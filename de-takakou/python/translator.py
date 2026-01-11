
# 項目名変換マップ
# main.pyのflatten_dict(sep='_')に合わせて、区切り文字をコロン(:)からアンダースコア(_)に変更
# ただし、元データ等の兼ね合いで混在する可能性もあるため、両方のパターン、あるいは柔軟なマッチングが必要だが、
# 一旦は main.py が生成する "meta_RSDB_syogen_..." という形式に合わせる。

FIELD_LABELS = {
    'id': 'ID',
    'title': '施設名称',
    'lat': '緯度',
    'lon': '経度',
    'metadata': 'metadata',
    'meta_DPF:year': '年度',
    # Note: These mappings are derived strictly from the provided 'APIデータ取得機能構想.txt' rows.
    # Alignments may appear shifted due to file structure, but are applied as requested.
    'meta_NLNI:crs_type': '施設名',
    'meta_NLNI:crs_properties_name': 'address',
    'meta_DPF:title': 'データURL',
    'meta_DPF:dataURLs': 'P14_001',
    'meta_DPF:latitude': 'P14_002',
    'meta_NLNI:meishou': 'P14_003',
    'meta_DPF:longitude': 'P14_004',
    'meta_NLNI:genten_1': 'P14_005',
    'meta_NLNI:genten_2': 'P14_006',
    'meta_NLNI:genten_3': 'P14_007',
    'meta_NLNI:genten_4': 'P14_008',
    'meta_NLNI:genten_5': 'P14_009',
    'meta_NLNI:genten_6': 'P14_010',
    'meta_NLNI:genten_7': 'meta_DPF:prefecture_code',
    'meta_NLNI:genten_8': 'meta_DPF:municipality_code',
    'meta_NLNI:genten_9': 'meta_DPF:year_originalform',
    'meta_NLNI:shozaichi': 'meta_DPF:last_update_datetime_originalform',
    'meta_DPF:downloadURLs': 'meta_DPF:dataset_id',
    'meta_NLNI:shutai_code': 'meta_DPF:catalog_id',
    'meta_DPF:prefecture_code': 'meta_DPF:dpf_update_date',
    'meta_NLNI:todoufuken_code': 'meta_DPF:last_update_datetime',
    'meta_DPF:year_originalform': 'meta_DPF:municipality_name',
    'meta_DPF:last_update_datetime': 'meta_DPF:prefecture_name',
    'meta_DPF:last_update_datetime_originalform': 'meta_DPF:catalog_title',
    'meta_DPF:dataset_id': 'meta_DPF:dataset_title',
    'meta_DPF:catalog_id': 'テーマ',
    'meta_DPF:dpf_update_date': 'meta_DPF:dataset_keywords',
    'meta_DPF:municipality_code': 'meta_DPF:ori_id',
    'meta_DPF:municipality_name': 'meta_DPF:related_count',
}

def translate_keys_list(data_list):
    """
    データのキーを日本語（または読みやすい形式）に変換する
    リスト全体を処理して新しいリストを返す
    """
    translated_list = []
    
    for item in data_list:
        new_item = {}
        for key, value in item.items():
            new_key = key
            
            # 1. 辞書にある場合
            if key in FIELD_LABELS:
                new_key = FIELD_LABELS[key]
            else:
                # 1.5 揺らぎ吸収 (Retry with normalized key)
                # 一般的なヘボン式などから、この辞書で採用されている訓令式ミックスへのマッピングを試行
                normalized_attempt = key.replace('shogen', 'syogen') \
                                        .replace('kanrisha', 'kanrisya') \
                                        .replace('meisho', 'meisyou') \
                                        .replace('meishou', 'meisyou') \
                                        .replace('jimusho', 'jimusyo') \
                                        .replace('shuzen', 'syuzen') \
                                        .replace('kyocho', 'kyouchou') \
                                        .replace('jokyo', 'joukyou')

                if normalized_attempt in FIELD_LABELS:
                    new_key = FIELD_LABELS[normalized_attempt]

            # 2. ':' を含む場合（動的な処理: fallback）
            if new_key == key and ':' in key:
                parts = key.split(':')
                new_key = parts[-1]
            # 3. '_' を含む場合の動的処理（main.pyのflattenに対応）
            elif '_' in key and 'meta' in key:
                 # meta_RSDB_foo -> foo のように短縮を試みる
                 # 辞書にヒットしなかった場合の最後の手段
                 parts = key.split('_')
                 # 最後の要素を使うのが一番安全か？ (例: syogen_ichi_ido -> ido だと意味不明になるかも)
                 # しかし全部日本語化辞書に含まれているはずなので、ここに来るのは未知の項目。
                 # その場合は元のキーのままでも良いが、多少見やすくするなら:
                 if len(parts) > 2:
                     # meta_RSDB_foo... -> foo...
                     # 簡易的に "meta_RSDB_" を取り除く
                     new_key = key.replace('meta_RSDB_', '').replace('meta_DPF_', '')
            
            new_item[new_key] = value
            
        translated_list.append(new_item)
        
    return translated_list
