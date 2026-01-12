import json
import math
import asyncio
from pyodide.http import pyfetch
import micropip

# -----------------------------------------------------------------------------
# 1. システム初期化 & ライブラリロード
# -----------------------------------------------------------------------------
async def initialize_system():
    print("SYSTEM: GISコア(shapely)を起動中...")
    try:
        await micropip.install("shapely")
        global LineString, Point, box
        from shapely.geometry import LineString, Point, box
        print("SYSTEM: 準備完了。解析エンジンは正常です。")
        return True
    except Exception as e:
        print(f"CRITICAL: GISライブラリのロードに失敗: {e}")
        return False

# -----------------------------------------------------------------------------
# 2. ターゲット定義 (ID指定 + キーワード補完)
# -----------------------------------------------------------------------------
# dataset_id で取れなければ、keyword で再トライする「二段構え」
TARGETS = [
    {
        "tag": "BRIDGE", 
        "name": "橋梁", 
        "strict_id": "rsdb_bridge", 
        "keyword": "橋梁"
    },
    {
        "tag": "PIPE",   
        "name": "下水道", 
        "strict_id": "sewerage_pipe", # 地域によっては nlni_ksj-w09 等の場合あり
        "keyword": "下水道管路"       # IDで取れない場合の保険
    }
]

# -----------------------------------------------------------------------------
# 3. 高耐久データ取得エンジン (Hybrid Fetcher)
# -----------------------------------------------------------------------------
async def fetch_data_robust(api_key, pref_name, target):
    WORKER = "https://mlit-user-proxy.gyorui-sawara.workers.dev"
    limit = 500
    offset = 0
    results = []
    
    # 戦略: まずStrict(ID指定)で挑み、ダメならFuzzy(キーワード)に切り替える
    mode = "Strict"
    current_query_type = "ID" 
    
    print(f"FETCH: 【{target['name']}】データ探索開始...")

    try:
        while True:
            # クエリ構築
            if current_query_type == "ID":
                # ID指定 (高速・正確)
                query_body = f'term: "{pref_name}", phraseMatch: true, attributeFilter: {{ attributeName: "DPF:dataset_id", is: "{target["strict_id"]}" }}'
            else:
                # キーワード検索 (広範囲・保険)
                query_body = f'term: "{pref_name} {target["keyword"]}", phraseMatch: false'

            # 正しいコマンド (first=offset, size=limit)
            query = f"""
            query {{
              search({query_body}, first: {offset}, size: {limit}) {{
                totalNumber
                searchResults {{ id title lat lon metadata }}
              }}
            }}
            """

            # リクエスト
            res = await pyfetch(f"{WORKER.rstrip('/')}/api/v1/", method="POST", 
                              headers={"apikey": api_key, "Content-Type": "application/json"}, 
                              body=json.dumps({"query": query}))
            
            if res.status != 200: break
            data = await res.json()
            items = data.get("data", {}).get("search", {}).get("searchResults", [])
            total = data.get("data", {}).get("search", {}).get("totalNumber", 0)

            # Strictモードで0件なら、Fuzzyモードへ切り替え
            if not items and offset == 0 and current_query_type == "ID":
                print(f"WARN: ID({target['strict_id']})で見つかりません。キーワード({target['keyword']})検索に切り替えます。")
                current_query_type = "KEYWORD"
                continue # ループ先頭に戻って再検索
            
            if not items: break

            # データ保存
            for item in items:
                # メタデータ展開
                flat_meta = {}
                if "metadata" in item and isinstance(item["metadata"], dict):
                    def flatten(d, p=''):
                        o = {}
                        for k,v in d.items():
                            nk = f"{p}_{k}" if p else k
                            if isinstance(v, dict): o.update(flatten(v, nk))
                            else: o[nk] = v
                        return o
                    flat_meta = flatten(item["metadata"], "meta")
                
                # 生データ保持
                item.update(flat_meta)
                item["_tag"] = target["tag"]
                results.append(item)

            offset += len(items)
            print(f"   -> {len(results)} / {total} 件取得中 ({current_query_type})...")
            
            if len(results) >= 2000: break # テスト用リミット
            await asyncio.sleep(0.3)

        print(f"FETCH: {target['name']} -> 合計 {len(results)} 件")
        return results

    except Exception as e:
        print(f"ERROR: 取得中にエラー発生: {e}")
        return []

# -----------------------------------------------------------------------------
# 4. 万能座標パース & ジオメトリ生成
# -----------------------------------------------------------------------------
def parse_geometry_safe(item):
    """どんな形式の座標データも Shapely Geometry に変換する"""
    coords = []
    
    # 1. 文字列やリストから座標を探す
    candidates = [
        item.get("meta_geometry_coordinates"),
        item.get("meta_coordinates"),
        item.get("coords")
    ]
    
    found_raw = None
    for c in candidates:
        if c: 
            found_raw = c
            break
            
    # 文字列ならデコード
    if isinstance(found_raw, str):
        try:
            import ast
            found_raw = ast.literal_eval(found_raw)
        except: pass

    # リストなら座標抽出
    if isinstance(found_raw, list):
        # [[lon, lat], ...]
        if len(found_raw) > 0 and isinstance(found_raw[0], list):
            coords = [(float(p[0]), float(p[1])) for p in found_raw if len(p)>=2]
        # [lon, lat]
        elif len(found_raw) >= 2 and isinstance(found_raw[0], (int, float)):
            coords = [(float(found_raw[0]), float(found_raw[1]))]
            
    # 見つからなければ lat/lon
    if not coords and item.get("lat") and item.get("lon"):
        coords = [(float(item["lon"]), float(item["lat"]))]

    if not coords: return None

    # LineString か Point か
    if len(coords) > 1:
        return LineString(coords)
    else:
        return Point(coords[0])

# -----------------------------------------------------------------------------
# 5. 高速空間解析 (Boxフィルタ + 線形バッファ)
# -----------------------------------------------------------------------------
def analyze_risks_final(bridges, pipes):
    print(f"\nANALYZE: 空間解析を開始 (橋:{len(bridges)} vs 管:{len(pipes)})...")
    matches = []
    
    # 簡易距離係数
    LAT_PER_M = 1 / 111111.0
    
    # 1. 橋梁データの準備（ポリゴン化 + インデックス化）
    bridge_index = []
    for b in bridges:
        geom = parse_geometry_safe(b)
        if not geom: continue
        
        # 幅員取得 (なければ4m)
        w_val = b.get("meta_RSDB:syogen_fukuin")
        try: width = float(w_val) if w_val else 4.0
        except: width = 4.0
        
        # バッファ生成 (幅/2 + 余裕1m)
        buf_size = (width / 2 + 1.0) * LAT_PER_M
        poly = geom.buffer(buf_size)
        
        bridge_index.append({
            "poly": poly,
            "bounds": poly.bounds, # 高速化のための「箱」
            "data": b
        })

    # 2. 管路データとの総当たり（高速Box判定付き）
    for p in pipes:
        p_geom = parse_geometry_safe(p)
        if not p_geom: continue
        
        p_bounds = p_geom.bounds
        
        for b_obj in bridge_index:
            # Step 1: 箱(Bounds)が重なっていなければ即スキップ
            bb = b_obj["bounds"]
            if (p_bounds[0] > bb[2] or p_bounds[2] < bb[0] or 
                p_bounds[1] > bb[3] or p_bounds[3] < bb[1]):
                continue
                
            # Step 2: 箱が重なっていれば、精密判定
            if b_obj["poly"].intersects(p_geom):
                # リスク判定 (判定区分3,4は危険)
                hantei = str(b_obj["data"].get("meta_RSDB:tenken_kiroku_hantei_kubun", "-"))
                risk_level = "高" if hantei in ["3", "4"] else "低"
                
                matches.append({
                    "bridge": b_obj["data"].get("title", "不明"),
                    "hantei": hantei,
                    "pipe_id": p.get("id"),
                    "pipe_year": p.get("meta_NLNI:W09_003", "-"), # 布設年度
                    "risk": risk_level
                })

    print(f"SUCCESS: 解析完了 -> {len(matches)} 件のリスク箇所を特定しました。")
    return matches

# -----------------------------------------------------------------------------
# 6. メイン実行フロー
# -----------------------------------------------------------------------------
async def main_full(api_key, pref_name):
    # 1. 環境
    if not await initialize_system(): return

    # 2. 取得 (Hybrid)
    bridges = await fetch_data_robust(api_key, pref_name, TARGETS[0])
    pipes = await fetch_data_robust(api_key, pref_name, TARGETS[1])
    
    if not bridges or not pipes:
        print("ERROR: 解析に必要なデータが揃いませんでした。")
        return

    # 3. 解析 (Optimized)
    risks = analyze_risks_final(bridges, pipes)
    
    # 4. レポート
    print("\n--- 【重要】優先対応が必要な箇所 ---")
    high_risks = [r for r in risks if r['risk'] == "高"]
    for r in high_risks[:10]:
        print(f"橋梁: {r['bridge']}(判定{r['hantei']}) × 管路: {r['pipe_year']}年製")
        
    print(f"\n(全 {len(risks)} 件中、高リスクは {len(high_risks)} 件です)")
    return risks