"""
国土交通省データプラットフォーム データ取得モジュール (Pyodide版)

対応データセット:
- xROAD（道路・橋梁）: 道路中心線、橋梁点検データ
- 下水道台帳: 下水道管渠（線）、マンホール（点）
- 上水道台帳: 水道管路（線）、消火栓・弁類（点）

References: https://www.mlit-data.jp/api_docs/
"""

import json
import asyncio
from pyodide.http import pyfetch

# =============================================================================
# 定数定義
# =============================================================================

# CORSプロキシエンドポイント（Cloudflare Worker等を経由）
PROXY_ENDPOINT = "https://mlit-user-proxy.gyorui-sawara.workers.dev/api/v1/"

# 直接アクセス用（CORS制限がある場合は使用不可）
DIRECT_ENDPOINT = "https://www.mlit-data.jp/api/v1/"

# データカテゴリ別の検索設定
DATA_CATEGORIES = {
    "xroad": {
        "name": "xROAD（道路・橋梁）",
        "search_terms": ["橋梁", "道路施設点検"],
        "description": "道路中心線、橋梁点検データ、道路幅員",
    },
    "sewage": {
        "name": "下水道台帳",
        "search_terms": ["下水道", "下水道台帳", "管渠"],
        "description": "下水道管渠（線）、マンホール（点）",
    },
    "water": {
        "name": "上水道台帳",
        "search_terms": ["上水道", "水道台帳", "水道管路"],
        "description": "水道管路（線）、消火栓・弁類（点）",
    },
}

# 共通フィールドラベル（各データ種別で共通して使用）
COMMON_FIELD_LABELS = {
    'id': 'ID',
    'title': '施設名称',
    'lat': '緯度',
    'lon': '経度',
}

# xROAD用フィールドラベル
XROAD_FIELD_LABELS = {
    **COMMON_FIELD_LABELS,
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
}

# 下水道用フィールドラベル
SEWAGE_FIELD_LABELS = {
    **COMMON_FIELD_LABELS,
    'meta_type': '種別',
    'meta_pipe_material': '管種',
    'meta_pipe_diameter': '管径',
    'meta_pipe_length': '延長',
    'meta_installation_year': '布設年度',
    'meta_inspection_year': '点検年度',
    'meta_condition': '状態区分',
    'meta_manhole_id': 'マンホールID',
    'meta_manhole_type': 'マンホール種別',
    'meta_depth': '深さ',
}

# 上水道用フィールドラベル
WATER_FIELD_LABELS = {
    **COMMON_FIELD_LABELS,
    'meta_type': '種別',
    'meta_pipe_material': '管種',
    'meta_pipe_diameter': '口径',
    'meta_pipe_length': '延長',
    'meta_installation_year': '布設年度',
    'meta_pressure': '水圧',
    'meta_valve_type': '弁種別',
    'meta_hydrant_type': '消火栓種別',
}

# カテゴリ別フィールドラベルマップ
CATEGORY_FIELD_LABELS = {
    "xroad": XROAD_FIELD_LABELS,
    "sewage": SEWAGE_FIELD_LABELS,
    "water": WATER_FIELD_LABELS,
}


# =============================================================================
# ユーティリティ関数
# =============================================================================

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


def convert_field_labels(item, category="xroad"):
    """フィールド名を日本語ラベルに変換"""
    labels = CATEGORY_FIELD_LABELS.get(category, COMMON_FIELD_LABELS)
    converted = {}
    for key, value in item.items():
        label = labels.get(key, key)
        converted[label] = value
    return converted


def process_item(item, category="xroad"):
    """
    APIから取得した1件のデータを処理する
    - metadataを展開
    - フィールド名を日本語に変換
    - カテゴリ固有の処理を適用
    """
    # metadata展開
    if "metadata" in item and isinstance(item["metadata"], dict):
        flat_meta = flatten_dict(item["metadata"], parent_key="meta")
        item.update(flat_meta)
        del item["metadata"]
    
    # ラベル変換
    converted = convert_field_labels(item, category)
    
    # xROADの場合: 判定区分(数値)を追加
    if category == "xroad":
        hantei_val = item.get('meta_RSDB:tenken_kiroku_hantei_kubun', 0)
        try:
            converted['判定区分(数値)'] = int(hantei_val) if hantei_val else 0
        except (ValueError, TypeError):
            converted['判定区分(数値)'] = 0
    
    # データ種別を追加
    converted['データ種別'] = DATA_CATEGORIES.get(category, {}).get('name', category)
    
    return converted


# =============================================================================
# MLITDataFetcher クラス
# =============================================================================

class MLITDataFetcher:
    """
    国土交通省データプラットフォームからデータを取得するクラス (Pyodide版)
    
    対応データ:
    - xroad: xROAD（道路・橋梁）
    - sewage: 下水道台帳
    - water: 上水道台帳
    """
    
    def __init__(self, api_key, use_proxy=True):
        """
        Args:
            api_key: 国土交通省DPFのAPIキー
            use_proxy: CORSプロキシを使用するか（ブラウザ環境ではTrue推奨）
        """
        self.api_key = api_key
        self.endpoint = PROXY_ENDPOINT if use_proxy else DIRECT_ENDPOINT
        
        if not self.api_key:
            print("WARNING: APIキーが設定されていません")

    def get_headers(self):
        return {
            "Content-Type": "application/json",
            "apikey": self.api_key
        }

    async def execute_query(self, query, variables=None):
        """GraphQLクエリを実行"""
        payload = {"query": query}
        if variables:
            payload["variables"] = variables
        
        try:
            response = await pyfetch(
                self.endpoint,
                method="POST",
                headers=self.get_headers(),
                body=json.dumps(payload)
            )
            
            if response.status != 200:
                err_text = await response.string()
                print(f"ERROR: HTTP {response.status}: {err_text[:200]}")
                return None
            
            result = await response.json()
            
            if "errors" in result:
                print(f"ERROR: GraphQL Error: {json.dumps(result['errors'])}")
                return None
                
            return result
        except Exception as e:
            print(f"ERROR: Fetch failed: {e}")
            return None

    # =========================================================================
    # 検索・取得メソッド
    # =========================================================================

    async def search(self, term, prefecture=None, limit=100, offset=0):
        """
        キーワードでデータセットを検索
        
        Args:
            term: 検索キーワード
            prefecture: 都道府県名でフィルタ（例: "東京都"）
            limit: 取得件数
            offset: オフセット
        """
        # attributeFilter付きのクエリ
        if prefecture:
            query = f"""
            query {{
              search(
                term: "{term}"
                phraseMatch: true
                first: {offset}
                size: {limit}
                attributeFilter: {{
                  attributeName: "DPF:prefecture_name",
                  is: "{prefecture}"
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
        else:
            query = f"""
            query {{
              search(
                term: "{term}"
                phraseMatch: true
                first: {offset}
                size: {limit}
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
        
        result = await self.execute_query(query)
        if result and "data" in result and "search" in result["data"]:
            return result["data"]["search"]
        return None

    async def fetch_data(self, category, prefecture, max_records=5000):
        """
        指定カテゴリのデータを取得
        
        Args:
            category: "xroad", "sewage", or "water"
            prefecture: 都道府県名
            max_records: 最大取得件数
            
        Returns:
            list: 処理済みデータのリスト
        """
        if category not in DATA_CATEGORIES:
            print(f"ERROR: 不明なカテゴリ: {category}")
            print(f"有効なカテゴリ: {list(DATA_CATEGORIES.keys())}")
            return []
        
        cat_info = DATA_CATEGORIES[category]
        search_term = cat_info["search_terms"][0]  # 最初の検索語を使用
        
        print(f"INFO: {cat_info['name']} データ取得を開始")
        print(f"INFO: 対象都道府県: {prefecture}")
        print(f"INFO: 検索語: {search_term}")
        
        limit = 500
        offset = 0
        total_data = []
        
        while True:
            result = await self.search(search_term, prefecture, limit, offset)
            
            if not result:
                print("ERROR: データ取得に失敗しました")
                break
            
            batch = result.get("searchResults", [])
            total_num = result.get("totalNumber", 0)
            
            # データ処理
            processed = [process_item(item, category) for item in batch]
            total_data.extend(processed)
            
            count = len(batch)
            offset += count
            
            print(f"INFO: {len(total_data)}/{total_num} 件 取得完了...")
            
            # 終了条件
            if len(total_data) >= total_num or count < limit or len(total_data) >= max_records:
                break
            
            # レートリミット対策
            await asyncio.sleep(0.3)
        
        print(f"SUCCESS: 合計 {len(total_data)} 件を取得しました")
        return total_data

    async def fetch_all_infrastructure(self, prefecture, categories=None):
        """
        複数カテゴリのインフラデータを一括取得
        
        Args:
            prefecture: 都道府県名
            categories: 取得するカテゴリのリスト（省略時は全カテゴリ）
            
        Returns:
            dict: カテゴリ名をキー、データリストを値とする辞書
        """
        if categories is None:
            categories = list(DATA_CATEGORIES.keys())
        
        results = {}
        for cat in categories:
            print(f"\n{'='*50}")
            data = await self.fetch_data(cat, prefecture)
            results[cat] = data
        
        # サマリー表示
        print(f"\n{'='*50}")
        print("取得結果サマリー:")
        for cat, data in results.items():
            name = DATA_CATEGORIES.get(cat, {}).get('name', cat)
            print(f"  - {name}: {len(data)} 件")
        
        return results

    # =========================================================================
    # ファイルダウンロード関連
    # =========================================================================

    async def get_dataset_files(self, dataset_id):
        """データセット内のファイル一覧を取得"""
        query = """
        query GetDataCatalog($id: String!) {
            get_data_catalog(id: $id) {
                id
                title
                distributions {
                    id
                    title
                    format
                    accessURL
                    description
                }
            }
        }
        """
        result = await self.execute_query(query, {"id": dataset_id})
        if result and "data" in result and "get_data_catalog" in result["data"]:
            return result["data"]["get_data_catalog"]
        return None

    async def get_download_url(self, file_id):
        """ファイルのダウンロードURLを取得"""
        query = """
        query GetFileDownloadUrl($fileId: String!) {
            get_file_download_urls(file_id: $fileId) {
                file_id
                url
                expiration
            }
        }
        """
        result = await self.execute_query(query, {"fileId": file_id})
        if result and "data" in result and "get_file_download_urls" in result["data"]:
            data = result["data"]["get_file_download_urls"]
            if isinstance(data, list) and len(data) > 0:
                return data[0].get("url")
            elif isinstance(data, dict):
                return data.get("url")
        return None


# =============================================================================
# 便利関数（main.pyから呼び出し用）
# =============================================================================

async def fetch_infrastructure_data(api_key, prefecture, category="xroad"):
    """
    インフラデータを取得する簡易関数
    
    Args:
        api_key: APIキー
        prefecture: 都道府県名
        category: "xroad", "sewage", "water" のいずれか
    
    Returns:
        list: 処理済みデータのリスト
    """
    fetcher = MLITDataFetcher(api_key)
    return await fetcher.fetch_data(category, prefecture)


# =============================================================================
# テスト用
# =============================================================================

async def test_fetcher(api_key):
    """テスト実行"""
    fetcher = MLITDataFetcher(api_key)
    
    # 検索テスト
    print("=== 検索テスト ===")
    for cat, info in DATA_CATEGORIES.items():
        print(f"\n[{info['name']}]")
        result = await fetcher.search(info['search_terms'][0], limit=3)
        if result:
            print(f"  総件数: {result.get('totalNumber', 0)}")
            for item in result.get('searchResults', [])[:2]:
                print(f"  - {item.get('title', 'N/A')}")
