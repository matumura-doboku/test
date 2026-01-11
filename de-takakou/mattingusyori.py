from shapely.geometry import LineString, Point
from shapely.ops import nearest_points

def match_by_road_area(roads, pipes, offset_m=0.5):
    """
    道路幅員(W)をポリゴン化し、その範囲内の管路を抽出する
    offset_m: データの微細なズレを吸収するための外側への余裕
    """
    matches = []
    # 緯度1度あたりの距離（約111,000m）でメートルを度数に変換
    M_TO_DEG = 1 / 111000 

    for road in roads:
        # 1. 道路中心線のLineStringを作成
        road_line = LineString([(p['lon'], p['lat']) for p in road['coords']])
        
        # 2. 道路幅員(W)に基づいたバッファ（面）を生成
        # 半径 = (道路幅 / 2 + 遊び)
        width = road.get('width', 4.0) # デフォルト4m
        buffer_radius = (width / 2 + offset_m) * M_TO_DEG
        road_poly = road_line.buffer(buffer_radius)
        
        for pipe in pipes:
            # 3. 管路のLineStringを作成
            pipe_line = LineString([(p['lon'], p['lat']) for p in pipe['coords']])
            
            # 4. 包含・交差判定（道路の範囲内に管路の一部でも入っているか）
            if road_poly.intersects(pipe_line):
                matches.append({
                    'road_id': road['id'],
                    'pipe_id': pipe['id'],
                    'method': 'Area_Buffer'
                })
                
    return matches

# --- 実行用テストデータ ---
sample_roads = [
    {'id': 'R-1', 'width': 10.0, 'coords': [{'lat': 34.4, 'lon': 132.4}, {'lat': 34.41, 'lon': 132.41}]}
]
sample_pipes = [
    {'id': 'P-A', 'coords': [{'lat': 34.40001, 'lon': 132.40005}, {'lat': 34.41001, 'lon': 132.41005}]}
]

results = match_by_road_area(sample_roads, sample_pipes)
print(f"道路区域内でのマッチング結果: {results}")