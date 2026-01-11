
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

def translate_headers(headers_list):
    """
    ヘッダー（キー）のリストを受け取り、翻訳後のヘッダーリストと
    {旧キー: 新キー} のマッピング辞書を返す。
    「最上端のみで変換をかける」ためのコア関数。
    """
    translated_headers = []
    mapping = {}
    
    for key in headers_list:
        new_key = key
        
        # (A) 辞書完全一致
        if key in FIELD_LABELS:
            new_key = FIELD_LABELS[key]
        else:
            # (B) 揺らぎ吸収 (正規化)
            normalized_attempt = key
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
        
        translated_headers.append(new_key)
        mapping[key] = new_key
        
    return translated_headers, mapping

def translate_keys_list(data_list):
    """
    (後方互換用ラッパー)
    データのリストを受け取り、ヘッダー変換を適用して新しいリストを返す。
    """
    if not data_list:
        return []

    # 1. ヘッダー抽出 (最初の1件から)
    sample_keys = list(data_list[0].keys())
    
    # 2. ヘッダーだけを変換 (最上端のみ処理)
    _, key_mapping = translate_headers(sample_keys)

    # 3. マッピングを使って全データを再構築 (高速)
    translated_list = []
    for item in data_list:
        new_item = {}
        for k, v in item.items():
            # マップにあれば変換、なければそのまま
            new_item[key_mapping.get(k, k)] = v
        translated_list.append(new_item)
        
    return translated_list
