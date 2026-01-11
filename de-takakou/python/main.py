import bridge  # 橋梁専用モジュール

# ... (中略)

        elif data_category == "xroad":
            # 橋梁データのみ取得 (bridge.pyを使用)
            print("INFO: bridge.pyを使用してデータを取得します")
            bf = bridge.BridgeFetcher(api_key)
            return await bf.fetch(pref_name)
            
        elif data_category == "sewage":
            # 下水道データのみ
            return await fetcher.fetch_data("sewage", pref_name)
            
        elif data_category == "water":
            # 上水道データのみ
            return await fetcher.fetch_data("water", pref_name)

        else:
            print(f"WARNING: 未対応のカテゴリです: {data_category}")
            # デフォルトでxroadを試す、あるいは空を返す
            return []

    except Exception as e:
        print(f"ERROR: 重大なエラーが発生しました: {str(e)}")
        return []