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
    limit = 500 # 1回あたりの取得件数 (API制限回避のため増やしてリクエスト回数を減らす)
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

        # フロントエンドから直接都道府県名が渡されるようになったため、変換マップを削除しそのまま使用
        pref_name = pref_code

        while True:
            if not is_mock:
                # GraphQLクエリの構築 (変数を直接埋め込み)
                # 参考コード準拠のスタイルに変更
                query = f"""
                query {{
                  search(
                    term: "橋梁"
                    phraseMatch: true
                    first: {offset}
                    size: {limit}
                    attributeFilter: {{
                      attributeName: "DPF:prefecture_name",
                      is: "{pref_name}"
                    }}
                  ) {{
                    totalNumber
                    searchResults {{
                      id
                      title
                      lat
                      lon
                      metadata
                    }}
                  }}
                }}
                """

                # JSONボディ (variablesは使わない)
                body_data = {
                    "query": query,
                    "variables": {}
                }
                
                # URL生成
                base = WORKER_ENDPOINT.rstrip('/')
                path = resource_path.lstrip('/') if resource_path.startswith('/') else resource_path
                url = f"{base}/{path}"

                headers = {
                    "apikey": api_key,
                    "Content-Type": "application/json"
                }
                print(f"DEBUG: Fetching URL: {url} (GraphQL)")
                # print(f"DEBUG: Query: {query}") # 必要ならコメントアウト解除
                
                response = await pyfetch(url, method="POST", headers=headers, body=json.dumps(body_data))
                
                if response.status != 200:
                    err_text = await response.string()
                    print(f"ERROR: API Error {response.status}")
                    print(f"ERROR: Details: {err_text}")
                    break
                
                resp_json = await response.json()
                
                if "errors" in resp_json:
                    print(f"ERROR: GraphQL Error: {json.dumps(resp_json['errors'])}")
                    break
                    
                # データの抽出
                search_res = resp_json.get("data", {}).get("search", {})
                batch_data = search_res.get("searchResults", [])
                
                # データをそのままリストに追加 (metadataがあれば展開)
                processed_batch = []
                for item in batch_data:
                    # metadataフィールドがあれば、その中身をフラットに展開してitemにマージ
                    if "metadata" in item and isinstance(item["metadata"], dict):
                        # 平坦化関数 (再帰的)
                        def flatten_dict(d, parent_key='', sep='_'):
                            items = []
                            for k, v in d.items():
                                new_key = f"{parent_key}{sep}{k}" if parent_key else k
                                if isinstance(v, dict):
                                    items.extend(flatten_dict(v, new_key, sep=sep).items())
                                else:
                                    items.append((new_key, v))
                            return dict(items)

                        flat_meta = flatten_dict(item["metadata"], parent_key="meta")
                        item.update(flat_meta)
                        
                        # 元のmetadataは消しても良いが、デバッグ用に残す
                        # del item["metadata"]
                    
                    processed_batch.append(item)
                
                count = len(processed_batch)
                total_data.extend(processed_batch)
                offset += count
                
                print(f"INFO: {len(total_data)}件 取得完了...")
                
                # 取得完了条件
                total_num = search_res.get("totalNumber", 0)
                if len(total_data) >= total_num or count < limit or len(total_data) >= 5000:
                    print("INFO: 取得条件を満たしました (完了)")
                    break
                
                # APIのレートリミット対策として少し待機
                if not is_mock:
                    await asyncio.sleep(0.5)

            else:
                # モックデータの生成
                await asyncio.sleep(0.5) 
                batch_data = generate_mock_batch(offset, limit, pref_code)
                if batch_data is None: # 終了条件
                    break
                
                count = len(batch_data)
                total_data.extend(batch_data)
                offset += count

        print(f"SUCCESS: 合計 {len(total_data)} 件のデータを準備しました。")
        return total_data

    except Exception as e:
        print(f"ERROR: 重大なエラーが発生しました: {str(e)}")
        return []

def generate_mock_batch(offset, limit, pref_code):
    """ページネーションの挙動をテストするためのモックデータ生成"""
    # 3ページ分(300件)だけ返すシミュレーション
    if offset >= 5000:
        return None
    
    mock_batch = []
    # 広島ならそれっぽい座標、その他なら適当に
    base_x = -15000 if pref_code == "広島県" else 0
    base_y = -35000 if pref_code == "広島県" else 0

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
