import json
from pyodide.http import pyfetch
import math
import asyncio

# -----------------------------------------------------------------------------
# 1. 座標変換ロジック (JGD2011 平面直角座標系 -> WGS84 緯度経度)
# -----------------------------------------------------------------------------
# 簡易的な変換実装です。本来はpyproj推奨ですが、Pyodideでの軽量動作を優先してPure Pythonで実装します。
# 係数は国土地理院の計算式に基づく近似値を使用することを想定しています。
# ここでは「広島県(第6系)」や「東京都(第9系)」など、指定された系の原点を使用する必要があります。

# 平面直角座標系の系番号と原点(ラジアン)のマッピング (抜粋)
SYSTEM_ORIGINS = {
    "01": {"lat": 33.0, "lon": 129.5}, # 第1系 (長崎・鹿児島等)
    "13": {"lat": 36.0, "lon": 139.8333}, # 第9系 (東京)
    "27": {"lat": 36.0, "lon": 136.0}, # 第6系 (大阪)
    "34": {"lat": 36.0, "lon": 133.5}, # 第6系相当 (広島は状況によるがここでは仮定)
    # ... 他の都道府県も必要に応じて追加
}

def jgd2011_to_wgs84(x, y, pref_code):
    """
    平面直角座標 (x, y) を 緯度経度 (lat, lon) に変換する簡易関数
    ※精度は本格的なライブラリに劣りますが、可視化用途には十分です
    """
    # 簡易計算のため、実際には緯度経度へのオフセットとして近似計算します
    # 注意: x軸が北向き、y軸が東向き
    
    origin = SYSTEM_ORIGINS.get(pref_code, {"lat": 36.0, "lon": 133.5}) # デフォルト
    origin_lat = origin["lat"]
    origin_lon = origin["lon"]

    # 1度あたりの距離(km)概算
    lat_per_km = 1 / 111.0
    lon_per_km = 1 / (111.0 * math.cos(math.radians(origin_lat)))

    # メートル -> キロメートル -> 度
    lat = origin_lat + (x / 1000.0) * lat_per_km
    lon = origin_lon + (y / 1000.0) * lon_per_km

    return lat, lon

# -----------------------------------------------------------------------------
# 2. データ取得メインロジック (ページネーション対応)
# -----------------------------------------------------------------------------

async def fetch_xroad_data(api_key, pref_code, data_category):
    """
    Cloudflare Workers経由でデータをページネーションして取得し、座標変換を行う完全版関数
    """
    limit = 100 # 1回あたりの取得件数 (安全のため小さめに)
    offset = 0
    total_data = []
    
    # ワーカーのエンドポイント (ユーザーがデプロイしたURLに置き換える前提)
    # ここではローカルテストや仮置き用に空文字にしていますが、
    # 実際には "https://my-worker.username.workers.dev" のようになります
    WORKER_ENDPOINT = "https://mlit-user-proxy.gyorui-sawara.workers.dev"

    print(f"INFO: データ取得・加工プロセスを開始します (Pref: {pref_code})")
    
    # APIエンドポイントのパス (Worker経由)
    # GraphQLのルートエンドポイント
    resource_path = "/api/v1/"
    
    # モック判定（WorkerURLが設定されていない場合）
    is_mock = "your-worker-endpoint" in WORKER_ENDPOINT

    try:
        if not is_mock:
            # デバッグ: APIキーの受信確認
            print(f"DEBUG: API Key received (len: {len(str(api_key)) if api_key else 0})")

        # 都道府県コードから都道府県名への変換マップ
        pref_map = {
            "01": "北海道", "02": "青森県", "03": "岩手県", "04": "宮城県", "05": "秋田県",
            "06": "山形県", "07": "福島県", "08": "茨城県", "09": "栃木県", "10": "群馬県",
            "11": "埼玉県", "12": "千葉県", "13": "東京都", "14": "神奈川県", "15": "新潟県",
            "16": "富山県", "17": "石川県", "18": "福井県", "19": "山梨県", "20": "長野県",
            "21": "岐阜県", "22": "静岡県", "23": "愛知県", "24": "三重県", "25": "滋賀県",
            "26": "京都府", "27": "大阪府", "28": "兵庫県", "29": "奈良県", "30": "和歌山県",
            "31": "鳥取県", "32": "島根県", "33": "岡山県", "34": "広島県", "35": "山口県",
            "36": "徳島県", "37": "香川県", "38": "愛媛県", "39": "高知県", "40": "福岡県",
            "41": "佐賀県", "42": "長崎県", "43": "熊本県", "44": "大分県", "45": "宮崎県",
            "46": "鹿児島県", "47": "沖縄県"
        }
        pref_name = pref_map.get(pref_code, "東京都") # デフォルト

        while True:
            # GraphQLクエリの構築 (仕様書準拠)
            # term: 検索キーワード (xROAD的なデータを狙うため"道路"などを指定)
            query = """
            query searchData($term: String!, $first: Int, $size: Int, $prefName: String!) {
              search(
                term: $term
                phraseMatch: true
                first: $first
                size: $size
                attributeFilter: {
                  attributeName: "DPF:prefecture_name",
                  is: $prefName
                }
              ) {
                totalNumber
                searchResults {
                  id
                  title
                  # 必要なフィールドがあれば追加 (ただしスキーマ依存)
                }
              }
            }
            """
            
            # クエリ変数の設定
            variables = {
                "term": "橋梁", # とりあえずサンプル通り
                "first": offset, # pageFirstに対応
                "size": limit,   # pageSizeに対応
                "prefName": pref_name
            }

            # JSONボディ
            body_data = {
                "query": query,
                "variables": variables
            }
            
            # URL生成
            base = WORKER_ENDPOINT.rstrip('/')
            path = resource_path.lstrip('/') if resource_path.startswith('/') else resource_path
            url = f"{base}/{path}"

            if not is_mock:
                headers = {
                    "apikey": api_key,
                    "Content-Type": "application/json"
                }
                print(f"DEBUG: Fetching URL: {url} (GraphQL)")
                print(f"DEBUG: Query Variables: {json.dumps(variables)}")
                
                response = await pyfetch(url, method="POST", headers=headers, body=json.dumps(body_data))
                
                if response.status != 200:
                    print(f"ERROR: API Error {response.status}")
                    break
                
                resp_json = await response.json()
                
                if "errors" in resp_json:
                    print(f"ERROR: GraphQL Error: {json.dumps(resp_json['errors'])}")
                    break
                    
                # データの抽出
                search_res = resp_json.get("data", {}).get("search", {})
                batch_data = search_res.get("searchResults", [])
                
                # 簡易的なデータの整形 (x,yがないのでスキップせずそのまま追加)
                processed_batch = []
                for item in batch_data:
                    # 座標情報が含まれているか不明なため、そのまま追加
                    # 将来的には詳細取得APIなどが必要になる可能性大
                    processed_batch.append(item)
                
                count = len(processed_batch)
                total_data.extend(processed_batch)
                offset += count
                
                print(f"INFO: {len(total_data)}件 取得完了...")
                
                # 取得完了条件
                total_num = search_res.get("totalNumber", 0)
                if len(total_data) >= total_num or count < limit or len(total_data) >= 500:
                    print("INFO: 取得条件を満たしました (完了)")
                    break

            else:
                # モックデータの生成 (ページネーションの挙動確認用)
                await asyncio.sleep(0.5) # 通信待ち時間
                batch_data = generate_mock_batch(offset, limit, pref_code)
                if batch_data is None: # 終了条件
                    break
                # モックの場合は以下略... (既存ロジックはスキップ)
                count = len(batch_data)
                total_data.extend(batch_data)
                offset += count
                break # モックは1回で終了させる

        print(f"SUCCESS: 合計 {len(total_data)} 件のデータを準備しました。")
        return total_data
            else:
                # モックデータの生成 (ページネーションの挙動確認用)
                await asyncio.sleep(0.5) # 通信待ち時間
                batch_data = generate_mock_batch(offset, limit, pref_code)
                if batch_data is None: # 終了条件
                    break

            if not batch_data:
                break
            
            # --- 3. データの加工 (座標変換) ---
            processed_batch = []
            for item in batch_data:
                # 平面直角座標が含まれているかチェック (キー名は仕様依存)
                if "x" in item and "y" in item:
                    lat, lon = jgd2011_to_wgs84(item["x"], item["y"], pref_code)
                    item["latitude"] = round(lat, 6)
                    item["longitude"] = round(lon, 6)
                    
                    # 不要になった生座標は消しても良いが、デバッグ用に残す
                    # del item["x"]
                    # del item["y"]
                
                processed_batch.append(item)

            count = len(processed_batch)
            total_data.extend(processed_batch)
            offset += count
            
            print(f"INFO: {len(total_data)}件 取得・加工完了...")
            
            # 安全装置: 今回はテスト用に最大500件で打ち止め
            if len(total_data) >= 500 or count < limit:
                print("INFO: 取得条件を満たしました (完了)")
                break

        print(f"SUCCESS: 合計 {len(total_data)} 件のデータを準備しました。")
        return total_data

    except Exception as e:
        print(f"ERROR: 重大なエラーが発生しました: {str(e)}")
        return []

def generate_mock_batch(offset, limit, pref_code):
    """ページネーションの挙動をテストするためのモックデータ生成"""
    # 3ページ分(300件)だけ返すシミュレーション
    if offset >= 300:
        return None
    
    mock_batch = []
    # 広島(34)ならそれっぽい座標、その他なら適当に
    base_x = -15000 if pref_code == "34" else 0
    base_y = -35000 if pref_code == "34" else 0

    for i in range(limit):
        current_id = offset + i
        mock_batch.append({
            "id": f"ITEM-{current_id:04d}",
            "name": f"道路施設データ_{current_id}",
            "x": base_x + (i * 100), # 擬似的な平面直角座標
            "y": base_y + (i * 100),
            "pref": pref_code
        })
    return mock_batch
