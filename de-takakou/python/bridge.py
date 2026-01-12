import json
from pyodide.http import pyfetch
import math
import asyncio

# -----------------------------------------------------------------------------
# 1. 定数・辞書定義
# -----------------------------------------------------------------------------
SYSTEM_ORIGINS = {
    "01": {"lat": 44.0, "lon": 142.25},  # 第12系 (北海道)
    "13": {"lat": 36.0, "lon": 139.8333}, # 第9系 (東京)
    "27": {"lat": 36.0, "lon": 135.5},    # 第6系 (大阪)
    "34": {"lat": 36.0, "lon": 133.5},    # 第6系 (広島)
}

FIELD_LABELS = {
    'title': '施設名称',
    'id': 'ID',
    'lat': '緯度',
    'lon': '経度',
    'meta_RSDB:tenken_kiroku_hantei_kubun': '判定区分',
    'meta_RSDB:syogen_fukuin': '道路幅員',
    'meta_RSDB:tenken_nendo': '点検年度',
    'meta_DPF:address': '所在地住所',
    'meta_DPF:dataset_id': 'データセットID'
}

def translate_keys(data_list):
    translated_list = []
    for item in data_list:
        new_item = {}
        for key, value in item.items():
            new_key = FIELD_LABELS.get(key, key.split(':')[-1] if ':' in key else key)
            new_item[new_key] = value
        translated_list.append(new_item)
    return translated_list

# -----------------------------------------------------------------------------
# 2. データ取得メインロジック (400エラー修正版)
# -----------------------------------------------------------------------------

async def fetch_xroad_data(api_key, pref_name, data_category="橋梁"):
    limit = 500  # 1回あたりの取得件数 (size)
    offset = 0   # 開始位置 (from)
    total_data = []
    WORKER_ENDPOINT = "https://mlit-user-proxy.gyorui-sawara.workers.dev"

    print(f"INFO: {pref_name} のデータ取得を開始します（ターゲット: rsdb_bridge）")

    try:
        while True:
            # 【修正ポイント】
            # 1. 'first' を削除 (これが size と競合していました)
            # 2. 'from' に offset を指定 (0スタート)
            # 3. 'size' に limit を指定
            query = f"""
            query {{
              search(
                term: "{data_category}"
                phraseMatch: true
                from: {offset}
                size: {limit}
                attributeFilter: {{
                  and: [
                    {{ attributeName: "DPF:prefecture_name", is: "{pref_name}" }},
                    {{ attributeName: "DPF:dataset_id", is: "rsdb_bridge" }}
                  ]
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
            
            # デバッグ用: リクエストURL確認
            # print(f"DEBUG: Requesting from={offset}, size={limit}")

            response = await pyfetch(url, method="POST", headers=headers, body=json.dumps(body_data))
            
            if response.status != 200:
                print(f"ERROR: APIステータス {response.status}")
                # エラー詳細を表示して原因特定を容易にする
                try:
                    err_text = await response.string()
                    print(f"ERROR DETAILS: {err_text}")
                except:
                    pass
                break
            
            resp_json = await response.json()
            search_res = resp_json.get("data", {}).get("search", {})
            batch_data = search_res.get("searchResults", [])
            
            if not batch_data:
                break

            for item in batch_data:
                # metadataの平坦化処理
                if "metadata" in item and isinstance(item["metadata"], dict):
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
                total_data.append(item)
            
            count = len(batch_data)
            offset += count
            
            total_num = search_res.get("totalNumber", 0)
            print(f"INFO: {len(total_data)} / {total_num} 件 取得完了")
            
            # 終了判定
            if len(total_data) >= total_num or count < limit or len(total_data) >= 5000:
                break
            
            await asyncio.sleep(0.5)

        print(f"SUCCESS: 合計 {len(total_data)} 件のデータを取得しました。")
        return translate_keys(total_data)

    except Exception as e:
        print(f"ERROR: 致命的なエラーが発生しました: {str(e)}")
        return []