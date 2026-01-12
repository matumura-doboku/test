import json
import math
import asyncio
from pyodide.http import pyfetch
import micropip

# -----------------------------------------------------------------------------
# 1. 初期化・ライブラリインストール
# -----------------------------------------------------------------------------
async def setup_environment():
    print("INIT: 解析ライブラリ(shapely)の準備を確認中...")
    try:
        await micropip.install("shapely")
        global LineString, Point
        from shapely.geometry import LineString, Point
        print("INIT: Shapelyの準備が完了しました。")
        return True
    except Exception as e:
        print(f"WARNING: Shapelyが利用できません({e})。簡易モードに切り替えます。")
        return False

# -----------------------------------------------------------------------------
# 2. 設定・ターゲット定義
# -----------------------------------------------------------------------------

TARGETS = [
    {
        "name": "道路(橋梁)",
        "mode": "strict",
        "id": "rsdb_bridge",
        "tag": "bridge"
    },
    {
        "name": "下水道管路",
        "mode": "fuzzy",
        "keyword": "下水道管路",
        "tag": "pipe"
    }
]

FIELD_LABELS = {
    'title': '名称',
    'meta_RSDB:tenken_kiroku_hantei_kubun': '判定',
    'meta_RSDB:syogen_fukuin': '幅員',
    'meta_NLNI:W09_002': '管径',
    'meta_NLNI:W09_003': '布設年度'
}

# -----------------------------------------------------------------------------
# 3. データ整形（防御力強化版）
# -----------------------------------------------------------------------------

def safe_float(value, default=0.0):
    """Noneや不正な文字列を安全に数値変換する"""
    if value is None:
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default

def translate_item(item, tag):
    """データ翻訳と座標の安全な抽出"""
    new_item = {"_type": tag}
    for k, v in item.items():
        label = FIELD_LABELS.get(k, k.split(':')[-1] if ':' in k else k)
        new_item[label] = v
    
    # 座標の安全な抽出（今回のエラー対策）
    coords = []
    lat = item.get("lat")
    lon = item.get("lon")
    
    # lat/lonの両方が存在し、かつNoneでない場合のみ数値変換
    if lat is not None and lon is not None:
        coords.append({
            "lat": safe_float(lat), 
            "lon": safe_float(lon)
        })
    
    new_item["coords"] = coords
    
    # 幅員の安全な数値化
    if tag == "bridge":
        w_val = item.get("meta_RSDB:syogen_fukuin")
        new_item["width"] = safe_float(w_val, default=4.0)
    else:
        new_item["width"] = 0.0 # 管路は幅員計算不要
        
    return new_item

# -----------------------------------------------------------------------------
# 4. データ取得エンジン
# -----------------------------------------------------------------------------

async def fetch_data(api_key, pref_name, target):
    limit = 500
    offset = 0
    results = []
    WORKER_ENDPOINT = "https://mlit-user-proxy.gyorui-sawara.workers.dev"
    
    print(f"INFO: 【{target['name']}】取得開始...")

    try:
        while True:
            # クエリ構築
            if target['mode'] == 'strict':
                query_body = f'term: "{pref_name}", phraseMatch: true, attributeFilter: {{ attributeName: "DPF:dataset_id", is: "{target["id"]}" }}'
            else:
                query_body = f'term: "{pref_name} {target["keyword"]}", phraseMatch: false'

            query = f"""
            query {{
              search({query_body}, first: {offset}, size: {limit}) {{
                totalNumber
                searchResults {{ id title lat lon metadata }}
              }}
            }}
            """

            headers = {"apikey": api_key, "Content-Type": "application/json"}
            url = f"{WORKER_ENDPOINT.rstrip('/')}/api/v1/"
            res = await pyfetch(url, method="POST", headers=headers, body=json.dumps({"query": query}))
            
            if res.status != 200:
                print(f"ERROR: API {res.status}")
                break

            data = await res.json()
            search_res = data.get("data", {}).get("search", {})
            items = search_res.get("searchResults", [])
            
            if not items:
                if offset == 0: print(f"WARNING: {target['name']}は0件でした。")
                break

            for item in items:
                # メタデータ展開
                if "metadata" in item and isinstance(item["metadata"], dict):
                    def flatten(d, p=''):
                        o = {}
                        for k,v in d.items():
                            nk = f"{p}_{k}" if p else k
                            if isinstance(v, dict): o.update(flatten(v, nk))
                            else: o[nk] = v
                        return o
                    item.update(flatten(item["metadata"], "meta"))
                
                # 整形（ここでsafe_floatが動く）
                results.append(translate_item(item, target["tag"]))

            offset += len(items)
            total = search_res.get("totalNumber", 0)
            print(f"   -> {len(results)} / {total} 件...")
            
            if len(results) >= 2000 or len(items) < limit: break
            await asyncio.sleep(0.5)

        return results

    except Exception as e:
        print(f"ERROR: 取得中に中断 ({e})")
        return []

# -----------------------------------------------------------------------------
# 5. 空間解析（Shapely活用）
# -----------------------------------------------------------------------------

def analyze_risks(bridges, pipes, use_shapely):
    print(f"\nINFO: 空間解析(交差判定)を実行中...")
    matches = []
    if not bridges or not pipes:
        print("WARNING: 解析に必要なデータが揃っていません。")
        return []

    DEG_PER_M = 1 / 111000.0 
    
    if use_shapely:
        # 1. 橋梁をポリゴン化（幅員バッファ）
        bridge_polys = []
        for b in bridges:
            if not b["coords"]: continue
            p = b["coords"][0]
            # 道路幅員(W)の半分 + 遊び0.5m
            radius = (b.get("width", 4.0) / 2 + 0.5) * DEG_PER_M
            poly = Point(p["lon"], p["lat"]).buffer(radius)
            bridge_polys.append({"geo": poly, "data": b})

        # 2. 管路（点）との交差判定
        for p in pipes:
            if not p["coords"]: continue
            pt = Point(p["coords"][0]["lon"], p["coords"][0]["lat"])
            
            for b_poly in bridge_polys:
                if b_poly["geo"].intersects(pt):
                    matches.append({
                        "bridge": b_poly["data"].get("名称", "不明"),
                        "hantei": b_poly["data"].get("判定", "-"),
                        "pipe_id": p.get("ID", "-"),
                        "year": p.get("布設年度", "-"),
                        "risk": "HIGH" if str(b_poly["data"].get("判定")) in ["3", "4"] else "LOW"
                    })
    
    print(f"SUCCESS: {len(matches)} 件の重なりを検出しました。")
    return matches

# -----------------------------------------------------------------------------
# 6. メイン実行プロセス
# -----------------------------------------------------------------------------
async def run_integrated_analysis(api_key, pref_name):
    # 1. 環境構築
    use_shapely = await setup_environment()
    
    # 2. 道路データ取得
    bridges = await fetch_data(api_key, pref_name, TARGETS[0])
    
    # 3. 下水道データ取得（fuzzyモード）
    pipes = await fetch_data(api_key, pref_name, TARGETS[1])
    
    # 4. 解析
    results = analyze_risks(bridges, pipes, use_shapely)
    
    # 5. 結果表示
    if results:
        print("\n--- 【解析結果】リスク箇所一覧 ---")
        for r in results[:10]:
            print(f"地点: {r['bridge']} (判定:{r['hantei']}) × 管路: {r['year']}年製 [リスク:{r['risk']}]")
    else:
        print("\nINFO: 指定エリア内に交差箇所は見つかりませんでした。")
            
    return results