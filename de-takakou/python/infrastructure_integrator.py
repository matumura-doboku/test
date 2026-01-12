import json
import math
import asyncio
from pyodide.http import pyfetch
import micropip # ライブラリインストール用

# -----------------------------------------------------------------------------
# 1. 初期化・ライブラリインストール
# -----------------------------------------------------------------------------
async def setup_environment():
    print("INIT: 解析ライブラリ(shapely)をインストールしています...")
    try:
        await micropip.install("shapely")
        global LineString, Point
        from shapely.geometry import LineString, Point
        print("INIT: Shapelyのインストールに成功しました。")
        return True
    except Exception as e:
        print(f"WARNING: Shapelyのインストールに失敗 ({e})。簡易判定モードで動作します。")
        return False

# -----------------------------------------------------------------------------
# 2. 設定・ターゲット定義
# -----------------------------------------------------------------------------

# 取得ターゲット設定
# mode: "strict" (ID指定・高精度) / "fuzzy" (キーワード検索・広範囲)
TARGETS = [
    {
        "name": "道路(橋梁)",
        "mode": "strict",
        "id": "rsdb_bridge",
        "category_tag": "bridge"
    },
    {
        "name": "下水道管路",
        "mode": "fuzzy", # 下水道はキーワードで広く探す
        "keyword": "下水道管路", 
        "category_tag": "pipe"
    }
]

FIELD_LABELS = {
    'title': '名称',
    'id': 'ID',
    'meta_RSDB:tenken_kiroku_hantei_kubun': '判定',
    'meta_RSDB:syogen_fukuin': '幅員',
    'meta_NLNI:W09_002': '管径',
    'meta_NLNI:W09_003': '布設年度'
}

# -----------------------------------------------------------------------------
# 3. データ取得エンジン
# -----------------------------------------------------------------------------

def translate_item(item, tag):
    """データの整形・座標変換"""
    new_item = {"_type": tag}
    
    # 属性の翻訳
    for k, v in item.items():
        label = FIELD_LABELS.get(k, k.split(':')[-1] if ':' in k else k)
        new_item[label] = v
    
    # 座標情報の抽出 (lat/lon または coordinates)
    # APIから返る座標を Shapely で扱える {"lat": y, "lon": x} のリストにする
    coords = []
    if "lat" in item and "lon" in item:
        coords.append({"lat": float(item["lat"]), "lon": float(item["lon"])})
    
    new_item["coords"] = coords
    
    # 幅員の数値化 (橋梁用)
    try:
        new_item["width"] = float(item.get("meta_RSDB:syogen_fukuin", "4.0"))
    except:
        new_item["width"] = 4.0
        
    return new_item

async def fetch_data(api_key, pref_name, target):
    """ターゲットごとの戦略（strict/fuzzy）でデータを取得"""
    limit = 500
    offset = 0
    results = []
    WORKER_ENDPOINT = "https://mlit-user-proxy.gyorui-sawara.workers.dev"
    
    print(f"INFO: 【{target['name']}】取得開始 (Mode: {target['mode']})...")

    try:
        while True:
            # クエリの構築（モード分岐）
            if target['mode'] == 'strict':
                # ID指定（橋梁など明確なもの）
                query = f"""
                query {{
                  search(
                    term: "{pref_name}"
                    phraseMatch: true
                    first: {offset}
                    size: {limit}
                    attributeFilter: {{
                      attributeName: "DPF:dataset_id",
                      is: "{target['id']}"
                    }}
                  ) {{
                    totalNumber
                    searchResults {{ id title lat lon metadata }}
                  }}
                }}
                """
            else:
                # キーワード検索（下水道など属性が曖昧なもの）
                # "北海道 下水道管路" のように連結して検索
                search_term = f"{pref_name} {target['keyword']}"
                query = f"""
                query {{
                  search(
                    term: "{search_term}"
                    phraseMatch: false
                    first: {offset}
                    size: {limit}
                  ) {{
                    totalNumber
                    searchResults {{ id title lat lon metadata }}
                  }}
                }}
                """

            # APIリクエスト
            headers = {"apikey": api_key, "Content-Type": "application/json"}
            url = f"{WORKER_ENDPOINT.rstrip('/')}/api/v1/"
            res = await pyfetch(url, method="POST", headers=headers, body=json.dumps({"query": query}))
            
            if res.status != 200:
                print(f"ERROR: API Error {res.status}")
                break

            data = await res.json()
            search_res = data.get("data", {}).get("search", {})
            items = search_res.get("searchResults", [])
            
            if not items:
                # キーワード検索で0件だった場合のログ
                if offset == 0:
                    print(f"WARNING: {target['name']} が見つかりませんでした。検索条件: {target.get('keyword', target.get('id'))}")
                break

            # メタデータの展開とリスト追加
            for item in items:
                if "metadata" in item and isinstance(item["metadata"], dict):
                    def flatten(d, p=''):
                        o = {}
                        for k,v in d.items():
                            nk = f"{p}_{k}" if p else k
                            if isinstance(v, dict): o.update(flatten(v, nk))
                            else: o[nk] = v
                        return o
                    item.update(flatten(item["metadata"], "meta"))
                
                results.append(translate_item(item, target["category_tag"]))

            offset += len(items)
            total_num = search_res.get("totalNumber", 0)
            print(f"   -> {len(results)} / {total_num} 件...")
            
            # 安全のため最大2000件で打ち止め
            if len(results) >= 2000 or len(items) < limit:
                break
            
            await asyncio.sleep(0.5)

        return results

    except Exception as e:
        print(f"ERROR: データ取得中にエラー ({e})")
        return []

# -----------------------------------------------------------------------------
# 4. 空間解析ロジック (Shapely)
# -----------------------------------------------------------------------------

def analyze_risks(bridges, pipes, use_shapely=True):
    print(f"\nINFO: 空間解析を実行中 (橋梁:{len(bridges)} vs 管路:{len(pipes)})...")
    matches = []
    
    # 簡易換算係数 (1度 ≒ 111km)
    DEG_PER_M = 1 / 111000.0 
    
    if not bridges or not pipes:
        return []

    # Shapelyが使える場合
    if use_shapely and 'Point' in globals():
        # 1. 橋梁バッファの生成
        bridge_geoms = []
        for b in bridges:
            if not b["coords"]: continue
            p = b["coords"][0]
            pt = Point(p["lon"], p["lat"])
            # 幅員の半分 + 余裕0.5m
            r = (b.get("width", 4.0) / 2 + 0.5) * DEG_PER_M
            bridge_geoms.append({"geo": pt.buffer(r), "data": b})
            
        # 2. 管路との交差判定
        for p in pipes:
            if not p["coords"]: continue
            # 管路座標 (点または線)
            p_coords = [(c["lon"], c["lat"]) for c in p["coords"]]
            if len(p_coords) == 1:
                pipe_geo = Point(p_coords[0])
            else:
                pipe_geo = LineString(p_coords)
            
            for b_geom in bridge_geoms:
                if b_geom["geo"].intersects(pipe_geo):
                    matches.append(create_risk_record(b_geom["data"], p))
                    
    else:
        # 簡易判定モード (Shapelyなし・距離のみ)
        print("INFO: 簡易距離判定モードで実行します")
        for b in bridges:
            if not b["coords"]: continue
            bx, by = b["coords"][0]["lon"], b["coords"][0]["lat"]
            threshold = (b.get("width", 4.0) / 2 + 0.5) * DEG_PER_M
            
            for p in pipes:
                if not p["coords"]: continue
                # パイプの各点との距離を見る
                for pc in p["coords"]:
                    px, py = pc["lon"], pc["lat"]
                    dist = math.sqrt((bx-px)**2 + (by-py)**2)
                    if dist < threshold:
                        matches.append(create_risk_record(b, p))
                        break # 1つの橋で重複カウントしない

    print(f"SUCCESS: {len(matches)} 件のリスク箇所を検出しました。")
    return matches

def create_risk_record(bridge, pipe):
    return {
        "bridge": bridge.get("名称", "不明"),
        "bridge_hantei": bridge.get("判定", "-"),
        "pipe_id": pipe.get("ID", "-"),
        "pipe_year": pipe.get("布設年度", "-"),
        "risk": "HIGH" if str(bridge.get("判定")) in ["3", "4"] else "LOW"
    }

# -----------------------------------------------------------------------------
# 5. メイン実行
# -----------------------------------------------------------------------------
async def main_process(api_key, pref_name):
    # 1. 環境セットアップ
    use_shapely = await setup_environment()
    
    # 2. データ取得
    bridges = await fetch_data(api_key, pref_name, TARGETS[0])
    pipes = await fetch_data(api_key, pref_name, TARGETS[1])
    
    # 3. 統合解析
    risks = analyze_risks(bridges, pipes, use_shapely)
    
    # 4. 結果プレビュー
    if risks:
        print("\n--- 検出されたリスク上位 ---")
        for r in risks[:5]:
            print(f"橋:{r['bridge']}(判定{r['bridge_hantei']}) × 管:{r['pipe_year']}年製 -> リスク:{r['risk']}")
            
    return risks