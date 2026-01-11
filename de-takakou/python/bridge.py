"""
橋梁データ（xROAD）取得専用モジュール
"""
import json
import asyncio
from pyodide.http import pyfetch

# Cloudflare Workers プロキシ
PROXY_ENDPOINT = "https://mlit-user-proxy.gyorui-sawara.workers.dev/api/v1/"

# フィールドラベル定義（橋梁・道路専用）
# mlit_fetcher.py の XROAD_FIELD_LABELS と同期
BRIDGE_FIELD_LABELS = {
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
    # DPF系メタデータも追加
    'meta_DPF:title': 'タイトル(DPF)',
    'meta_DPF:route_name': '路線名(DPF)',
    'meta_DPF:prefecture_name': '都道府県(DPF)',
    'meta_DPF:municipality_name': '市区町村(DPF)',
    'meta_DPF:year': '年度(DPF)',
    'meta_DPF:downloadURLs': 'ダウンロードURL',
}

def flatten_dict(d, parent_key='', sep='_'):
    """ネストされた辞書をフラットに展開"""
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)

def process_bridge_item(item):
    """データ加工処理"""
    # metadata展開
    if "metadata" in item and isinstance(item["metadata"], dict):
        flat_meta = flatten_dict(item["metadata"], parent_key="meta")
        item.update(flat_meta)
        del item["metadata"]
    
    # ラベル変換
    converted = {}
    for key, value in item.items():
        label = BRIDGE_FIELD_LABELS.get(key, key)
        converted[label] = value
        
    # 判定区分の数値化
    hantei = item.get('meta_RSDB:tenken_kiroku_hantei_kubun')
    try:
        converted['判定区分(数値)'] = int(hantei) if hantei else 0
    except:
        converted['判定区分(数値)'] = 0
        
    converted['データ種別'] = '橋梁(xROAD)'
    return converted

class BridgeFetcher:
    def __init__(self, api_key):
        self.api_key = api_key
        self.endpoint = PROXY_ENDPOINT
        
    async def fetch(self, pref_name, max_records=5000):
        """橋梁・道路データを取得（ページネーション＆複数キーワード対応）"""
        search_terms = ["橋梁", "道路中心線", "道路施設"]
        
        print(f"INFO: [BridgeFetcher] {pref_name} のデータを検索します")
        print(f"INFO: キーワード: {', '.join(search_terms)}")
        
        total_data = {}  # IDで重複排除用
        limit = 500
        
        headers = {"apikey": self.api_key, "Content-Type": "application/json"}

        for term in search_terms:
            print(f"INFO: キーワード「{term}」で検索中...")
            offset = 0
            
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
                
                try:
                    res = await pyfetch(self.endpoint, method="POST", headers=headers, body=json.dumps({"query": query}))
                    if res.status != 200:
                        print(f"ERROR: API Error {res.status}")
                        break
                        
                    json_res = await res.json()
                    if "errors" in json_res:
                        print(f"ERROR: GraphQL Error: {json_res['errors']}")
                        break
                        
                    data_block = json_res.get("data", {}).get("search", {})
                    hits = data_block.get("searchResults", [])
                    total_num = data_block.get("totalNumber", 0)
                    
                    if not hits:
                        break
                    
                    # データ処理と蓄積
                    for item in hits:
                        processed = process_bridge_item(item)
                        # IDをキーにしてユニーク化
                        # 変換後のラベルでは 'ID' になるが、元の 'id' も存在する可能性があるため注意
                        # process_bridge_itemで 'id' -> 'ID' に変換されている
                        if 'ID' in processed:
                            total_data[processed['ID']] = processed
                        elif 'id' in processed:
                            total_data[processed['id']] = processed
                        else:
                            # IDがない場合はリストに追加するしかないが、今回はID前提
                            pass
                            
                    count = len(hits)
                    offset += count
                    
                    print(f"INFO: ... {term} {offset}/{total_num} 件 取得")
                    
                    if offset >= total_num or count < limit or len(total_data) >= max_records:
                        break
                        
                    await asyncio.sleep(0.3)
                    
                except Exception as e:
                    print(f"ERROR: Fetch failed: {e}")
                    break
            
            if len(total_data) >= max_records:
                print("INFO: 最大件数に達しました")
                break
                
        final_list = list(total_data.values())
        print(f"SUCCESS: [BridgeFetcher] 合計 {len(final_list)} 件のデータを取得しました")
        return final_list
