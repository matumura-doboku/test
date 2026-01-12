import json
from pyodide.http import pyfetch
import math
import asyncio

# -----------------------------------------------------------------------------
# 1. 定数・辞書定義
# -----------------------------------------------------------------------------
# 平面直角座標系の系番号と原点(ラジアン)のマッピング
# 北海道(11, 12, 13系)を追加し、全国対応を強化
SYSTEM_ORIGINS = {
    "01": {"lat": 44.0, "lon": 142.25},  # 第12系 (北海道中央部)
    "13": {"lat": 36.0, "lon": 139.8333}, # 第9系 (東京)
    "27": {"lat": 36.0, "lon": 135.5},    # 第6系 (大阪)
    "34": {"lat": 36.0, "lon": 133.5},    # 第6系相当 (広島)
}

# 項目名変換マップ（RSDB, NLNI, CALSを網羅）
FIELD_LABELS = {
    # 共通・基本項目
    'title': '施設名称',
    'id': 'ID',
    'lat': '緯度',
    'lon': '経度',
    # RSDB系（橋梁点検）
    'meta_RSDB:tenken_kiroku_hantei_kubun': '判定区分',
    'meta_RSDB:syogen_fukuin': '道路幅員(W)',
    'meta_RSDB:tenken_nendo': '点検年度',
    'meta_RSDB:syogen_kyouchou': '橋長',
    # NLNI系（福祉施設等）
    'meta_NLNI:P14_001': '都道府県(NLNI)',
    'meta_NLNI:P14_008': '施設名称(NLNI)',
    'meta_DPF:address': '所在地住所',
    # CALS系（電子納品）
    'meta_CALS:contractor_info_name': '施工業者名',
    'meta_CALS:work_name_etc_work_name': '工事件名',
}

# -----------------------------------------------------------------------------
# 2. ユーティリティ関数
# -----------------------------------------------------------------------------

def flatten_dict(d, parent_key='', sep=':'):
    """metadata等の階層構造を平坦化する"""
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)

def translate_keys(data_list):
    """キーを日本語に翻訳し、読みやすくする"""
    translated_list = []
    for item in data_list:
        new_item = {}
        for key, value in item.items():
            new_key = FIELD_LABELS.get(key, key.split(':')[-1] if ':' in key else key)
            new_item[new_key] = value
        translated_list.append(new_item)
    return translated_list

# -----------------------------------------------------------------------------
# 3. データ取得メインロジック (仕様書準拠版)
# -----------------------------------------------------------------------------

async def fetch_mlit_data(api_key, pref_name, dataset_id="rsdb_bridge"):
    """
    最新仕様に基づき、dataset_idを狙い撃ちでページネーション取得する
    """
    limit = 500 # 1回あたりの取得件数 (first)
    offset = 0  # 取得開始位置
    total_data = []
    WORKER_ENDPOINT = "https://mlit-user-proxy.gyorui-sawara.workers.dev"

    print(f"INFO: {dataset_id} の取得を開始 (都道府県: {pref_name})")
    
    while True:
        # 仕様書に基づき、attributeFilterで都道府県とデータセットIDをAND検索
        query = f"""
        query {{
          search(
            first: {limit}
            offset: {offset}
            attributeFilter: {{
              and: [
                {{ attributeName: "DPF:prefecture_name", is: "{pref_name}" }},
                {{ attributeName: "DPF:dataset_id", is: "{dataset_id}" }}
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

        headers = {"apikey": api_key, "Content-Type": "application/json"}
        url = f"{WORKER_ENDPOINT.rstrip('/')}/api/v1/"
        
        try:
            response = await pyfetch(url, method="POST", headers=headers, body=json.dumps({"query": query}))
            if response.status != 200:
                print(f"ERROR: API Error {response.status}")
                break
                
            resp_json = await response.json()
            search_res = resp_json.get("data", {}).get("search", {})
            batch_data = search_res.get("searchResults", [])
            
            if not batch_data:
                break

            for item in batch_data:
                # metadataの展開
                if "metadata" in item and isinstance(item["metadata"], dict):
                    flat_meta = flatten_dict(item["metadata"], parent_key="meta")
                    item.update(flat_meta)
                total_data.append(item)

            offset += len(batch_data)
            total_num = search_res.get("totalNumber", 0)
            
            print(f"PROGRESS: {len(total_data)} / {total_num} 件取得中...")
            
            if len(total_data) >= total_num or len(total_data) >= 5000:
                break
                
            await asyncio.sleep(0.5) # レートリミット回避
            
        except Exception as e:
            print(f"EXCEPTION: {str(e)}")
            break

    print(f"SUCCESS: 合計 {len(total_data)} 件取得完了")
    return translate_keys(total_data)

# -----------------------------------------------------------------------------
# 4. 実行サンプル
# -----------------------------------------------------------------------------
# async def main():
#     # 北海道の橋梁点検データを取得する場合
#     data = await fetch_mlit_data("YOUR_API_KEY", "北海道", "rsdb_bridge")
#     # 下水道管路データを取得する場合（IDは例）
#     # sewer_data = await fetch_mlit_data("YOUR_API_KEY", "北海道", "sewerage_pipe")