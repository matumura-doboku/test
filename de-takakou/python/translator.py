
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
    if not data_list:
        return []

    # 1. すべてのデータに含まれる「キー（カラム名）」のユニークなリストを取得
    # データ構造が均一なら data_list[0].keys() だけで十分だが、念のため全走査して和集合をとるか、
    # 速度優先なら「最初の100件」くらいから全カラムを拾うアプローチが良い。
    # ここではシンプルかつそれなりに高速な方法として、データの最初の1件を代表とする
    # (APIデータは通常スキーマが決まっているため)
    sample_keys = data_list[0].keys()
    
    # 2. キーごとの変換マップを作成 (ここだけ重い処理を行う)
    # カラム数分(数十〜数百)しかループしないので一瞬で終わる
    key_mapping = {}
    for key in sample_keys:
        new_key = key
        
        # (A) 辞書完全一致
        if key in FIELD_LABELS:
            new_key = FIELD_LABELS[key]
        else:
            # (B) 揺らぎ吸収 (正規化)
            normalized_attempt = key
            # パフォーマンスのため、明らかに対象になりそうな場合のみ試行
            if any(x in key for x in ['shogen', 'kanrisha', 'meisho', 'jimusho', 'shuzen', 'kyocho', 'jokyo']):
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
            
            # (C) フォールバック整形
            elif key == new_key:
                if ':' in key:
                    new_key = key.split(':')[-1]
                elif '_' in key and ('meta_RSDB' in key or 'meta_DPF' in key):
                     new_key = key.replace('meta_RSDB_', '').replace('meta_DPF_', '')
        
        key_mapping[key] = new_key

    # 3. 作成したマップを使って全データを変換 (単純なDict生成のみ)
    translated_list = []
    for item in data_list:
        # マップにあるキーだけで新しい辞書を作る (存在しないキーは無視orそのまま)
        # item.items() を使うと、sample_keysに含まれていなかった稀なキーが漏れる可能性があるため、
        # 必要に応じて動的に追加するか、itemベースで回す。
        
        new_item = {}
        for k, v in item.items():
            # もしsampleに含まれていないキーが後から出てきた場合、そのまま使うか都度変換する
            # ここでは高速化のため「既知のキーはマップから、未知はそのまま」とする
            if k in key_mapping:
                new_item[key_mapping[k]] = v
            else:
                new_item[k] = v
                
        translated_list.append(new_item)
        
    return translated_list
