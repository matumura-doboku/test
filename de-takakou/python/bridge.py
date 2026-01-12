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
    'meta_RSDB:tenken_kiroku_hantei_kubun': '判定区分', # これが「1〜4」の数値
    'meta_RSDB:syogen_fukuin': '道路幅員', 
    'meta_RSDB:tenken_nendo': '点検年度',
    'meta_RSDB:syogen_kyouchou': '橋長',
    'meta_DPF:address': '所在地住所',
    'meta_DPF:dataset_id': 'データセットID'
}

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

# -----------------------------------------------------------------------------
# 2. データ取得メインロジック (エラー対策済み決定版)
# -----------------------------------------------------------------------------

async def fetch_xroad_data(api_key, pref_name, data_category="橋梁"):
    """
    400エラーを回避し、かつ正確に rsdb_bridge (橋梁点検) のみを取得する関数
    """
    limit = 500  # 1回あたりの取得件数 (first)
    offset = 0   # 取得開始位置 (offset)
    total_data = []
    WORKER_ENDPOINT = "https://mlit-user-proxy.gyorui-sawara.workers.dev"

    print(f"INFO: {pref_name} のデータを 'rsdb_bridge' 指定で取得開始...")

    try:
        while True:
            # 【ここが修正の決定打】
            # 1. attributeFilter は 'dataset_id' だけに使用 (ANDを使わずシンプルに)
            # 2. 都道府県名は 'term' (キーワード検索) で引っ掛ける
            # 3. first(件数) と offset(開始位置) を正しく分離
            query = f"""
            query {{
              search(
                term: "{pref_name}"
                phraseMatch: true
                first: {limit}
                offset: {offset}
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
            
            # リクエスト実行
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
            
            # レスポンス解析
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
                    
                    # キー名を 'meta_' で統一
                    flat_meta = flatten_dict(item["metadata"], parent_key="meta")
                    item.update(flat_meta)
                total_data.append(item)
            
            # ページネーション更新
            count = len(batch_data)
            offset += count
            
            total_num = search_res.get("totalNumber", 0)
            print(f"INFO: {len(total_data)} / {total_num} 件 取得中...")
            
            # 終了判定
            if len(total_data) >= total_num or count < limit or len(total_data) >= 5000:
                break
            
            # API負荷軽減のための待機
            await asyncio.sleep(0.5)

        print(f"SUCCESS: 合計 {len(total_data)} 件のデータを取得しました。")
        return translate_keys(total_data)

    except Exception as e:
        print(f"ERROR: 致命的なエラーが発生しました: {str(e)}")
        return []