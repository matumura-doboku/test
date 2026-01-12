import json
from pyodide.http import pyfetch
import math
import asyncio

# -----------------------------------------------------------------------------
# 1. 定数・辞書定義
# -----------------------------------------------------------------------------

# 平面直角座標系の系番号と原点(ラジアン)
# 北海道(01=第12系)、東京(13=第9系)、大阪(27=第6系)、広島(34=第6系)
SYSTEM_ORIGINS = {
    "01": {"lat": 44.0, "lon": 142.25},  
    "13": {"lat": 36.0, "lon": 139.8333},
    "27": {"lat": 36.0, "lon": 135.5},    
    "34": {"lat": 36.0, "lon": 133.5},    
}

# 翻訳マップ（RSDB:橋梁点検データ用）
FIELD_LABELS = {
    'title': '施設名称',
    'id': 'ID',
    'lat': '緯度',
    'lon': '経度',
    'meta_RSDB:tenken_kiroku_hantei_kubun': '判定区分', # 1〜4の数値
    'meta_RSDB:syogen_fukuin': '道路幅員', 
    'meta_RSDB:tenken_nendo': '点検年度',
    'meta_RSDB:syogen_kyouchou': '橋長',
    'meta_DPF:address': '所在地住所',
    'meta_DPF:dataset_id': 'データセットID'
}

# -----------------------------------------------------------------------------
# 2. ユーティリティ関数
# -----------------------------------------------------------------------------

def translate_keys(data_list):
    """データのキーを日本語（FIELD_LABELS）に変換する"""
    translated_list = []
    for item in data_list:
        new_item = {}
        for key, value in item.items():
            # 辞書にあるキーは変換、なければ末尾の単語を使う
            new_key = FIELD_LABELS.get(key, key.split(':')[-1] if ':' in key else key)
            new_item[new_key] = value
        translated_list.append(new_item)
    return translated_list

def jgd2011_to_wgs84(x, y, pref_code="34"):
    """
    平面直角座標 (x, y) を 緯度経度 (lat, lon) に変換する簡易関数
    ※座標データのみでlat/lonがない場合の保険として実装
    """
    origin = SYSTEM_ORIGINS.get(pref_code, {"lat": 36.0, "lon": 133.5})
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
# 3. データ取得メインロジック (仕様書準拠・決定版)
# -----------------------------------------------------------------------------

async def fetch_xroad_data(api_key, pref_name, data_category="橋梁"):
    """
    MLIT DPF API仕様書に基づき、正しいパラメータでデータを取得する関数
    first: 取得開始位置 (Offset)
    size:  取得件数 (Limit)
    """
    limit = 500       # 1回あたりの取得件数 (size)
    current_offset = 0 # 現在の開始位置 (first)
    total_data = []
    
    # ユーザープロキシのエンドポイント
    WORKER_ENDPOINT = "https://mlit-user-proxy.gyorui-sawara.workers.dev"

    print(f"INFO: {pref_name} のデータを取得開始 (Target: rsdb_bridge)")

    try:
        while True:
            # 【仕様書に基づく修正箇所】
            # first: 開始位置を指定 (0, 500, 1000...)
            # size:  件数を指定
            # attributeFilter: dataset_id で rsdb_bridge をピンポイント指定
            query = f"""
            query {{
              search(
                term: "{pref_name}"
                phraseMatch: true
                first: {current_offset}
                size: {limit}
                attributeFilter: {{
                  attributeName: "DPF:dataset_id",
                  is: "rsdb_bridge"
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

            body_data = {"query": query, "variables": {}}
            url = f"{WORKER_ENDPOINT.rstrip('/')}/api/v1/"
            headers = {"apikey": api_key, "Content-Type": "application/json"}
            
            # リクエスト送信
            response = await pyfetch(url, method="POST", headers=headers, body=json.dumps(body_data))
            
            # エラーハンドリング
            if response.status != 200:
                print(f"ERROR: APIステータス {response.status}")
                try:
                    err_text = await response.string()
                    print(f"詳細: {err_text}")
                except:
                    pass
                break
            
            # レスポンスの解析
            resp_json = await response.json()
            search_res = resp_json.get("data", {}).get("search", {})
            batch_data = search_res.get("searchResults", [])
            
            if not batch_data:
                break

            # データの平坦化 (Metadataの展開)
            for item in batch_data:
                if "metadata" in item and isinstance(item["metadata"], dict):
                    # 再帰的に展開する内部関数
                    def flatten_dict(d, parent_key='', sep='_'):
                        items = []
                        for k, v in d.items():
                            new_key = f"{parent_key}{sep}{k}" if parent_key else k
                            if isinstance(v, dict):
                                items.extend(flatten_dict(v, new_key, sep=sep).items())
                            else:
                                items.append((new_key, v))
                        return dict(items)
                    
                    # 統一フォーマット 'meta_' で展開
                    flat_meta = flatten_dict(item["metadata"], parent_key="meta")
                    item.update(flat_meta)
                total_data.append(item)
            
            # 次の開始位置を更新
            count = len(batch_data)
            current_offset += count
            
            total_num = search_res.get("totalNumber", 0)
            print(f"INFO: {len(total_data)} / {total_num} 件 取得中... (Next Offset: {current_offset})")
            
            # 終了判定
            if len(total_data) >= total_num or count < limit or len(total_data) >= 5000:
                print("INFO: データ取得完了")
                break
            
            # API負荷軽減
            await asyncio.sleep(0.5)

        print(f"SUCCESS: 合計 {len(total_data)} 件のデータを準備しました。")
        return translate_keys(total_data)

    except Exception as e:
        print(f"ERROR: 処理中にエラーが発生しました: {str(e)}")
        return []