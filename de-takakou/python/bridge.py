import json
from pyodide.http import pyfetch
import math
import asyncio

# -----------------------------------------------------------------------------
# 1. 座標変換・項目変換の定義 (hennkoumae.pyのロジックを継承)
# -----------------------------------------------------------------------------

# 系番号と原点のマッピング。北海道(01)を修正し、精度を確保
SYSTEM_ORIGINS = {
    "01": {"lat": 44.0, "lon": 142.25},  # 第12系 (北海道中央部)
    "13": {"lat": 36.0, "lon": 139.8333}, # 第9系 (東京)
    "27": {"lat": 36.0, "lon": 135.5},    # 第6系 (大阪)
    "34": {"lat": 36.0, "lon": 133.5},    # 第6系相当 (広島)
}

# 翻訳マップ。RSDBの点検区分や幅員を重点的にカバー
FIELD_LABELS = {
    'title': '施設名称',
    'id': 'ID',
    'lat': '緯度',
    'lon': '経度',
    'meta_RSDB:tenken_kiroku_hantei_kubun': '判定区分', # 1〜4の数値
    'meta_RSDB:syogen_fukuin': '道路幅員', # 道路幅
    'meta_RSDB:tenken_nendo': '点検年度',
    'meta_RSDB:syogen_kyouchou': '橋長',
    'meta_DPF:address': '所在地住所',
}

def translate_keys(data_list):
    """データのキーを日本語に変換する"""
    translated_list = []
    for item in data_list:
        new_item = {}
        for key, value in item.items():
            new_key = FIELD_LABELS.get(key, key.split(':')[-1] if ':' in key else key)
            new_item[new_key] = value
        translated_list.append(new_item)
    return translated_list

# -----------------------------------------------------------------------------
# 2. データ取得メインロジック (仕様書完全準拠版)
# -----------------------------------------------------------------------------

async def fetch_xroad_data(api_key, pref_name, data_category="橋梁"):
    """
    GraphQLを使用してRSDB（橋梁点検データ）を狙い撃ちで取得する
    """
    limit = 500  # 1回あたりの取得数(size)
    offset = 0   # 取得済み件数
    total_data = []
    WORKER_ENDPOINT = "https://mlit-user-proxy.gyorui-sawara.workers.dev"

    print(f"INFO: {pref_name} のデータ取得を開始します。")

    try:
        while True:
            # 【重要】仕様書に基づきクエリを構築
            # 1. first は取得開始位置（1-indexed）。0回目は 1, 500回目は 501を指定する。
            # 2. size は取得件数。
            # 3. attributeFilter で不純物（福祉施設等）を排除し、rsdb_bridgeのみを指定。
            query = f"""
            query {{
              search(
                term: "{data_category}"
                phraseMatch: true
                first: {offset + 1}
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
            
            print(f"DEBUG: {offset + 1}件目から取得中...")
            response = await pyfetch(url, method="POST", headers=headers, body=json.dumps(body_data))
            
            if response.status != 200:
                print(f"ERROR: APIステータス {response.status}")
                break
            
            resp_json = await response.json()
            search_res = resp_json.get("data", {}).get("search", {})
            batch_data = search_res.get("searchResults", [])
            
            if not batch_data:
                break

            for item in batch_data:
                # metadataの平坦化 (hennkoumae.pyの再帰ロジック)
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
                    
                    # 互換性を保つためプレフィックスを meta_ に設定
                    flat_meta = flatten_dict(item["metadata"], parent_key="meta")
                    item.update(flat_meta)
                total_data.append(item)
            
            count = len(batch_data)
            offset += count
            
            total_num = search_res.get("totalNumber", 0)
            print(f"INFO: {len(total_data)} / {total_num} 件 完了")
            
            # 終了判定
            if len(total_data) >= total_num or count < limit or len(total_data) >= 5000:
                break
            
            await asyncio.sleep(0.5) # レートリミット回避

        print(f"SUCCESS: 合計 {len(total_data)} 件のデータを正規化しました。")
        return translate_keys(total_data)

    except Exception as e:
        print(f"ERROR: 処理中に致命的なエラーが発生しました: {str(e)}")
        return []