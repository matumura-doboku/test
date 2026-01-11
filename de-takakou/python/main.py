import json
from pyodide.http import pyfetch
import asyncio

# -----------------------------------------------------------------------------
# 定数定義
# -----------------------------------------------------------------------------

# Cloudflare Workers プロキシエンドポイント
WORKER_ENDPOINT = "https://mlit-user-proxy.gyorui-sawara.workers.dev"

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
    """
    ネストされた辞書をフラットに展開する再帰関数
    例: {"a": {"b": 1}} -> {"a_b": 1}
    """
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)


def convert_field_labels(item):
    """
    フィールド名を日本語ラベルに変換し、判定区分(数値)を追加する
    """
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


def process_item(item):
    """
    APIから取得した1件のデータを処理する
    - metadataを展開
    - フィールド名を日本語に変換
    """
    # metadata展開
    if "metadata" in item and isinstance(item["metadata"], dict):
        flat_meta = flatten_dict(item["metadata"], parent_key="meta")
        item.update(flat_meta)
        del item["metadata"]
    
    # ラベル変換
    return convert_field_labels(item)


# -----------------------------------------------------------------------------
# GraphQLクエリ生成
# -----------------------------------------------------------------------------

def build_search_query(search_term, pref_name, offset, limit):
    """
    国土交通省データプラットフォーム用のGraphQLクエリを生成する
    """
    return f"""
    query {{
      search(
        term: "{search_term}"
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


# -----------------------------------------------------------------------------
# データ取得メインロジック
# -----------------------------------------------------------------------------

async def fetch_xroad_data(api_key, pref_name, data_category):
    """
    国土交通省データプラットフォームからデータを取得する
    
    Args:
        api_key: APIキー
        pref_name: 都道府県名（例: "東京都", "広島県"）
        data_category: データカテゴリ（現在は "xroad" のみ対応）
    
    Returns:
        list: 処理済みデータのリスト
    """
    limit = 500
    offset = 0
    total_data = []
    max_records = 5000  # 最大取得件数

    print(f"INFO: データ取得・加工プロセスを開始します")
    print(f"INFO: 対象都道府県: {pref_name}")

    # モック判定
    is_mock = "your-worker-endpoint" in WORKER_ENDPOINT
    
    if is_mock:
        print("INFO: モックモードで実行します")
        return await fetch_mock_data(pref_name, max_records)

    # API通信設定
    url = f"{WORKER_ENDPOINT.rstrip('/')}/api/v1/"
    headers = {
        "apikey": api_key,
        "Content-Type": "application/json"
    }
    
    print(f"DEBUG: API Key length: {len(str(api_key)) if api_key else 0}")

    try:
        while True:
            # クエリ生成
            query = build_search_query("橋梁", pref_name, offset, limit)
            body_data = {"query": query, "variables": {}}
            
            print(f"DEBUG: Fetching offset={offset}...")
            
            # APIリクエスト
            response = await pyfetch(
                url, 
                method="POST", 
                headers=headers, 
                body=json.dumps(body_data)
            )
            
            # エラーチェック
            if response.status != 200:
                err_text = await response.string()
                print(f"ERROR: API Error {response.status}: {err_text[:200]}")
                break
            
            resp_json = await response.json()
            
            if "errors" in resp_json:
                print(f"ERROR: GraphQL Error: {json.dumps(resp_json['errors'])}")
                break
            
            # データ抽出と処理
            search_res = resp_json.get("data", {}).get("search", {})
            batch_data = search_res.get("searchResults", [])
            total_num = search_res.get("totalNumber", 0)
            
            # 各アイテムを処理
            processed_batch = [process_item(item) for item in batch_data]
            
            count = len(processed_batch)
            total_data.extend(processed_batch)
            offset += count
            
            print(f"INFO: {len(total_data)}/{total_num} 件 取得完了...")
            
            # 終了条件
            if len(total_data) >= total_num or count < limit or len(total_data) >= max_records:
                print("INFO: 取得完了")
                break
            
            # レートリミット対策
            await asyncio.sleep(0.3)

        print(f"SUCCESS: 合計 {len(total_data)} 件のデータを準備しました。")
        return total_data

    except Exception as e:
        print(f"ERROR: 重大なエラーが発生しました: {str(e)}")
        return []


# -----------------------------------------------------------------------------
# モックデータ生成（テスト用）
# -----------------------------------------------------------------------------

# 都道府県別のサンプル座標（モック用）
PREF_COORDS = {
    "北海道": (43.0642, 141.3469),
    "東京都": (35.6762, 139.6503),
    "大阪府": (34.6937, 135.5023),
    "広島県": (34.3853, 132.4553),
    "福岡県": (33.5902, 130.4017),
}

async def fetch_mock_data(pref_name, max_records=100):
    """
    テスト用のモックデータを生成する
    """
    print("INFO: モックデータを生成中...")
    await asyncio.sleep(0.5)
    
    # 都道府県に応じた座標を取得
    base_lat, base_lon = PREF_COORDS.get(pref_name, (35.0, 135.0))
    
    mock_data = []
    for i in range(min(100, max_records)):
        # 座標を少しずつずらす
        lat = base_lat + (i % 10) * 0.01
        lon = base_lon + (i // 10) * 0.01
        
        mock_data.append({
            "ID": f"MOCK-{i:04d}",
            "施設名称": f"テスト橋梁_{i}",
            "緯度": lat,
            "経度": lon,
            "都道府県": pref_name,
            "市区町村": f"{pref_name}テスト市",
            "路線名": f"テスト路線{i % 5 + 1}号",
            "橋長": 50 + i * 2,
            "架設年度": 1970 + (i % 50),
            "点検年度": 2020 + (i % 5),
            "判定区分": ["I", "II", "III", "IV"][i % 4],
            "判定区分(数値)": (i % 4) + 1,
        })
    
    print(f"SUCCESS: モックデータ {len(mock_data)} 件を生成しました。")
    return mock_data