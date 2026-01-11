import json
from pyodide.http import pyfetch
import asyncio
import math

# -----------------------------------------------------------------------------
# 定数定義
# -----------------------------------------------------------------------------

# Cloudflare Workers プロキシエンドポイント
WORKER_ENDPOINT = "https://mlit-user-proxy.gyorui-sawara.workers.dev"
RESOURCE_PATH = "/api/v1/"

# データカテゴリ別の検索設定
# search_termsに含まれるすべてのキーワードで検索を行い、結果を統合します
category_settings = {
    "xroad": {
        "search_terms": ["橋梁", "道路中心線", "道路施設"],
    },
    "mattingusyori": { # 道路、上下水道データ
        "search_terms": [
            "橋梁", "道路中心線", "道路施設", # xROAD
            "下水道管渠", "マンホール", "下水道施設", # 下水道
            "水道管路", "消火栓", "水道施設" # 上水道
        ],
    },
    # 他のカテゴリが必要ならここに追加
    "sewage": {"search_terms": ["下水道管渠", "マンホール", "下水道施設"]},
    "water": {"search_terms": ["水道管路", "消火栓", "水道施設"]},
}

# フィールド名 → 日本語ラベルの変換マップ
FIELD_LABELS = {
    'id': 'ID',
    'title': '施設名称',
    'lat': '緯度',
    'lon': '経度',
    'meta_RSDB:syogen_ichi_ido': '緯度(諸元)',
    'meta_RSDB:syogen_ichi_keido': '経度(諸元)',
    'meta_RSDB:syogen_rosen_meisyou': '路線名',
    'meta_RSDB:syogen_fukuin': '幅員',
    'meta_RSDB:syogen_kanrisya_kubun': '管理者区分',
    'meta_RSDB:syogen_kanrisya_jimusyo': '管理者事務所',
    'meta_RSDB:syogen_kanrisya_meisyou': '管理者',
    'meta_RSDB:syogen_kyouchou': '橋長',
    'meta_RSDB:syogen_shisetsu_meisyou': '施設名',
    'meta_RSDB:syogen_shisetsu_furigana': '施設名(カナ)',
    'meta_RSDB:syogen_gyousei_kuiki_todoufuken_mei': '都道府県',
    'meta_RSDB:syogen_gyousei_kuiki_todoufuken_code': '都道府県コード',
    'meta_RSDB:syogen_gyousei_kuiki_shikuchouson_mei': '市区町村',
    'meta_RSDB:syogen_gyousei_kuiki_shikuchouson_code': '市区町村コード',
    'meta_RSDB:syogen_kasetsu_nendo': '架設年度',
    'meta_RSDB:tenken_nendo': '点検年度',
    'meta_RSDB:tenken_kiroku_hantei_kubun': '判定区分',
    'meta_RSDB:tenken_syuzen_sochi_joukyou': '修繕措置状況',
    'meta_RSDB:shisetsu_id': '施設ID',
    'meta_RSDB:kanrisya_code': '管理者コード',
    'meta_RSDB:shisetsu_kubun': '施設区分',
    'meta_RSDB:koushin_nichiji': '更新日時',
    # 下水道・上水道用
    'meta_type': '種別',
    'meta_pipe_material': '管種',
    'meta_pipe_diameter': '管径/口径',
    'meta_pipe_length': '延長',
    'meta_installation_year': '布設年度',
    'meta_inspection_year': '点検年度',
    'meta_condition': '状態区分',
    'meta_manhole_id': 'マンホールID',
    'meta_manhole_type': 'マンホール種別',
    'meta_depth': '深さ',
    'meta_pressure': '水圧',
    'meta_valve_type': '弁種別',
    'meta_hydrant_type': '消火栓種別',
    # DPF系
    'meta_DPF:title': 'タイトル(DPF)',
    'meta_DPF:route_name': '路線名(DPF)',
    'meta_DPF:prefecture_name': '都道府県(DPF)',
    'meta_DPF:municipality_name': '市区町村(DPF)',
    'meta_DPF:year': '年度(DPF)',
    'meta_DPF:downloadURLs': 'ダウンロードURL',
}

# -----------------------------------------------------------------------------
# ユーティリティ関数
# -----------------------------------------------------------------------------

def flatten_dict(d, parent_key='', sep='_'):
    """ネストされた辞書をフラットに展開する"""
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)

def process_item(item):
    """1件のデータを処理（メタデータ展開・日本語化）"""
    # metadata展開
    if "metadata" in item and isinstance(item["metadata"], dict):
        flat_meta = flatten_dict(item["metadata"], parent_key="meta")
        item.update(flat_meta)
        del item["metadata"]
    
    # フィールド名を日本語ラベルに変換
    converted = {}
    for key, value in item.items():
        label = FIELD_LABELS.get(key, key)
        converted[label] = value
    
    # 判定区分(数値)を追加（フィルタリング用）
    hantei_val = item.get('meta_RSDB:tenken_kiroku_hantei_kubun', 0)
    try:
        converted['判定区分(数値)'] = int(hantei_val) if hantei_val else 0
    except (ValueError, TypeError):
        converted['判定区分(数値)'] = 0
            
    return converted

# -----------------------------------------------------------------------------
# データ取得メインロジック
# -----------------------------------------------------------------------------

async def fetch_xroad_data(api_key, pref_name, data_category):
    """
    指定されたカテゴリと都道府県でデータを取得し、日本語化して返す
    """
    print(f"INFO: データ取得・加工プロセスを開始します (Pref: {pref_name}, Category: {data_category})")
    
    # URL生成
    base = WORKER_ENDPOINT.rstrip('/')
    path = RESOURCE_PATH.lstrip('/') if RESOURCE_PATH.startswith('/') else RESOURCE_PATH
    url = f"{base}/{path}"
    
    headers = {
        "apikey": api_key,
        "Content-Type": "application/json"
    }

    # 検索キーワードの決定
    setting = category_settings.get(data_category)
    if not setting:
        # デフォルトあるいは不明な場合は単一キーワード検索として処理
        search_terms = ["橋梁"] if data_category == "xroad" else ["道路"]
        print(f"WARNING: カテゴリ設定が見つかりません。デフォルト検索を行います: {search_terms}")
    else:
        search_terms = setting["search_terms"]

    print(f"INFO: 検索キーワード: {', '.join(search_terms)}")

    total_data_map = {} # IDで重複排除するため辞書を使用
    limit = 500
    max_records_per_term = 5000 # キーワードごとの最大取得数
    
    is_mock = "your-worker-endpoint" in WORKER_ENDPOINT

    try:
        if is_mock:
            return generate_mock_data(pref_name)

        # 各キーワードについてAPI検索を実行
        for term in search_terms:
            print(f"\nINFO: キーワード「{term}」で検索中...")
            offset = 0
            term_fetched_count = 0
            
            while True:
                # GraphQLクエリ
                query = f"""
                query {{
                  search(
                    term: "{term}"
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
                
                body_data = {"query": query, "variables": {}}
                
                # APIリクエスト
                response = await pyfetch(url, method="POST", headers=headers, body=json.dumps(body_data))
                
                if response.status != 200:
                    err_text = await response.string()
                    print(f"ERROR: API Error {response.status}: {err_text[:100]}")
                    break
                
                resp_json = await response.json()
                
                if "errors" in resp_json:
                    print(f"ERROR: GraphQL Error: {json.dumps(resp_json['errors'])}")
                    break
                    
                data_block = resp_json.get("data", {}).get("search", {})
                batch_data = data_block.get("searchResults", [])
                total_num = data_block.get("totalNumber", 0)
                
                if not batch_data:
                    print(f"INFO: データが見つかりませんでした (Term: {term})")
                    break

                # データの処理と蓄積
                for item in batch_data:
                    processed = process_item(item)
                    # IDでユニーク化 (フィールド名が'ID'になっているはず)
                    item_id = processed.get('ID') or processed.get('id') or f"UNKNOWN-{len(total_data_map)}"
                    total_data_map[item_id] = processed
                
                count = len(batch_data)
                offset += count
                term_fetched_count += count
                
                print(f"INFO: ... {term_fetched_count}/{total_num} 件 取得 (Total Unique: {len(total_data_map)})")
                
                # 終了条件
                if term_fetched_count >= total_num or count < limit or term_fetched_count >= max_records_per_term:
                    break
                
                await asyncio.sleep(0.3)
        
        final_list = list(total_data_map.values())
        print(f"SUCCESS: 合計 {len(final_list)} 件のデータを準備しました。")
        return final_list

    except Exception as e:
        print(f"ERROR: 重大なエラーが発生しました: {str(e)}")
        import traceback
        traceback.print_exc()
        return []

def generate_mock_data(pref_name):
    """モックデータ生成（テスト用）"""
    print("INFO: モックデータを生成します")
    return [
        {"ID": "MOCK-001", "施設名称": "テスト橋梁A", "緯度": 35.0, "経度": 139.0, "判定区分": "III", "判定区分(数値)": 3},
        {"ID": "MOCK-002", "施設名称": "テスト道路B", "緯度": 35.1, "経度": 139.1, "判定区分": "II", "判定区分(数値)": 2},
    ]