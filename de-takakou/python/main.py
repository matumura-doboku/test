import json
from pyodide.http import pyfetch
import asyncio
import mlit_fetcher  # 独立させたデータ取得モジュール
import bridge  # 橋梁専用モジュール

# -----------------------------------------------------------------------------
# メインロジック
# -----------------------------------------------------------------------------

async def fetch_xroad_data(api_key, pref_name, data_category):
    """
    データ取得のメインエントリーポイント
    
    Args:
        api_key: APIキー
        pref_name: 都道府県名（例: "東京都"）
        data_category: 選択されたデータカテゴリ
            - "xroad": 橋梁データのみ
            - "mattingusyori": 道路・下水道・上水道の一括取得
    
    Returns:
        list: APIから取得・統合されたデータリスト
    """
    print(f"INFO: メイン処理を開始します (Category: {data_category}, Pref: {pref_name})")
    
    # データ取得モジュールの初期化
    fetcher = mlit_fetcher.MLITDataFetcher(api_key)
    
    try:
        if data_category == "mattingusyori":
            # 道路、上下水道データを一括取得
            print("INFO: 道路・上下水道データを一括取得します...")
            
            # xroad, sewage, water の3種類を指定
            target_categories = ["xroad", "sewage", "water"]
            results = await fetcher.fetch_all_infrastructure(pref_name, categories=target_categories)
            
            # 取得した辞書データを1つのフラットなリストに結合
            total_data = []
            for cat, data_list in results.items():
                if data_list:
                    print(f"INFO: {cat} カテゴリのデータを統合中 ({len(data_list)}件)")
                    total_data.extend(data_list)
            
            print(f"SUCCESS: 全データの統合が完了しました (合計 {len(total_data)} 件)")
            return total_data

        elif data_category == "xroad":
            # 橋梁データのみ取得 (bridge.pyを使用)
            print("INFO: bridge.pyを使用してデータを取得します")
            bf = bridge.BridgeFetcher(api_key)
            return await bf.fetch(pref_name)
            
        elif data_category == "sewage":
            # 下水道データのみ (mlit_fetcher使用)
            return await fetcher.fetch_data("sewage", pref_name)
            
        elif data_category == "water":
            # 上水道データのみ (mlit_fetcher使用)
            return await fetcher.fetch_data("water", pref_name)

        else:
            print(f"WARNING: 未対応のカテゴリです: {data_category}")
            return []

    except Exception as e:
        print(f"ERROR: 重大なエラーが発生しました: {str(e)}")
        return []