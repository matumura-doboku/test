import json
import math
import asyncio
from pyodide.http import pyfetch

# Shapelyのインストール確認とインポート
# ※Pyodide環境で実行する場合、事前に micropip.install("shapely") が必要です
try:
    from shapely.geometry import LineString, Point
    from shapely.ops import nearest_points
except ImportError:
    print("WARNING: Shapelyがインストールされていません。空間判定がスキップされます。")
    # 簡易的なダミークラス（エラー回避用）
    class Point: 
        def __init__(self, *args): pass
        def buffer(self, *args): return self
        def intersects(self, *args): return False

# -----------------------------------------------------------------------------
# 1. 設定・辞書定義
# -----------------------------------------------------------------------------

SYSTEM_ORIGINS = {
    "01": {"lat": 44.0, "lon": 142.25},   # 北海道
    "13": {"lat": 36.0, "lon": 139.8333}, # 東京
    "27": {"lat": 36.0, "lon": 135.5},    # 大阪
    "34": {"lat": 36.0, "lon": 133.5},    # 広島
}

# 取得対象と翻訳マップ
TARGETS = [
    {"id": "rsdb_bridge", "type": "bridge", "name": "道路(橋梁)"},
    {"id": "nlni_ksj-w09", "type": "pipe", "name": "下水道管路"},
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
# 2. データ取得エンジン (API仕様完全準拠版)
# -----------------------------------------------------------------------------

def translate_item(item, category):
    """データのキー翻訳と整形"""
    new_item = {"_type": category}
    for k, v in item.items():
        label = FIELD_LABELS.get(k, k.split(':')[-1] if ':' in k else k)
        new_item[label] = v
    
    # 座標データの正規化（Shapely用）
    # APIからは単点のlat/lonが返る前提。管路で始点・終点がある場合は別途パースが必要
    if "lat" in item and "lon" in item:
        new_item["coords"] = [{"lat": float(item["lat"]), "lon": float(item["lon"])}]
        # 幅員があれば数値化、なければデフォルト4.0m
        width_str = item.get("meta_RSDB:syogen_fukuin", "4.0")
        try:
            new_item["width"] = float(width_str)
        except:
            new_item["width"] = 4.0
            
    return new_item

async def fetch_dataset(api_key, pref_name, target):
    """first=開始位置, size=件数 の正しいコマンドで取得"""
    limit = 500
    current_offset = 0
    results = []
    WORKER_ENDPOINT = "https://mlit-user-proxy.gyorui-sawara.workers.dev"

    print(f"INFO: 【{target['name']}】取得開始...")

    try:
        while True:
            query = f"""
            query {{
              search(
                term: "{pref_name}"
                phraseMatch: true
                first: {current_offset}
                size: {limit}
                attributeFilter: {{
                  attributeName: "DPF:dataset_id",
                  is: "{target['id']}"
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
            res = await pyfetch(url, method="POST", headers=headers, body=json.dumps({"query": query}))
            
            if res.status != 200:
                print(f"ERROR: API Error {res.status}")
                break

            data = await res.json()
            items = data.get("data", {}).get("search", {}).get("searchResults", [])
            if not items: break

            # フラット化処理
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
                
                results.append(translate_item(item, target["type"]))

            current_offset += len(items)
            print(f"   -> {len(results)} 件...")
            if len(results) >= 2000 or len(items) < limit: break
            await asyncio.sleep(0.5)
            
        return results

    except Exception as e:
        print(f"ERROR: {str(e)}")
        return []

# -----------------------------------------------------------------------------
# 3. 空間解析ロジック (data-kakouベース)
# -----------------------------------------------------------------------------

def detect_infrastructure_conflicts(bridges, pipes, offset_m=0.5):
    """
    橋梁（点/面）と管路（点/線）の交差判定を行う
    """
    matches = []
    # 緯度1度あたりの距離（簡易換算）
    M_TO_DEG = 1 / 111000.0 

    print(f"\nINFO: 空間解析を開始 (橋梁: {len(bridges)}件 vs 管路: {len(pipes)}件)")

    # 1. 橋梁データの準備（バッファ作成）
    bridge_polys = []
    for b in bridges:
        if "coords" not in b or not b["coords"]: continue
        
        # 橋梁は通常1点（中心点）で提供されるため、Pointとして扱う
        p_data = b["coords"][0]
        point = Point(p_data["lon"], p_data["lat"])
        
        # 幅員(W)の半分 + 余裕分 を半径とする円を作成（これを橋のエリアとみなす）
        radius = (b.get("width", 4.0) / 2 + offset_m) * M_TO_DEG
        poly = point.buffer(radius)
        bridge_polys.append({"geo": poly, "data": b})

    # 2. 管路データとの交差判定
    count = 0
    for p in pipes:
        if "coords" not in p or not p["coords"]: continue
        
        # 管路もAPI仕様上は点（Point）として返ることが多いが、
        # 将来的にLineStringが返る場合にも対応できるように記述
        coords = [(c["lon"], c["lat"]) for c in p["coords"]]
        if len(coords) == 1:
            pipe_geo = Point(coords[0]) # 点として扱う
        else:
            pipe_geo = LineString(coords) # 線として扱う

        # 全橋梁との総当たり判定（本来は空間インデックスを使うと高速）
        for b_poly in bridge_polys:
            if b_poly["geo"].intersects(pipe_geo):
                # マッチした場合
                matches.append({
                    "bridge_name": b_poly["data"].get("名称"),
                    "bridge_hantei": b_poly["data"].get("判定"),
                    "pipe_type": p.get("管種", "不明"),
                    "pipe_year": p.get("布設年度", "不明"),
                    "risk_level": "HIGH" if str(b_poly["data"].get("判定")) in ["3", "4"] else "LOW"
                })
                count += 1
    
    print(f"SUCCESS: {count} 件の交差（リスク箇所）を検出しました。")
    return matches

# -----------------------------------------------------------------------------
# 4. メイン実行関数
# -----------------------------------------------------------------------------

async def main_analysis(api_key, pref_name):
    # 1. データ取得
    bridges = await fetch_dataset(api_key, pref_name, TARGETS[0])
    pipes = await fetch_dataset(api_key, pref_name, TARGETS[1])
    
    if not bridges or not pipes:
        print("ERROR: データが不足しているため解析できません。")
        return []
    
    # 2. 空間解析（統合）
    risk_report = detect_infrastructure_conflicts(bridges, pipes)
    
    # 3. 結果表示（上位5件）
    print("\n--- 検出されたリスク箇所（サンプル） ---")
    for row in risk_report[:5]:
        print(row)
        
    return risk_report