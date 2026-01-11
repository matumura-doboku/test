
# 項目名変換マップ
# main.pyのflatten_dict(sep='_')に合わせて、区切り文字をコロン(:)からアンダースコア(_)に変更
# ただし、元データ等の兼ね合いで混在する可能性もあるため、両方のパターン、あるいは柔軟なマッチングが必要だが、
# 一旦は main.py が生成する "meta_RSDB_syogen_..." という形式に合わせる。

FIELD_LABELS = {
    'title': '施設名称',
    'hantei': '判定区分(数値)',
    'lat': '緯度',
    'lon': '経度',
    'id': 'ID',
    'meta_RSDB_syogen_ichi_ido': '緯度',
    'meta_RSDB_syogen_ichi_keido': '経度',
    'meta_RSDB_syogen_rosen_meisyou': '路線名',
    'meta_RSDB_syogen_fukuin': '幅員',
    'meta_RSDB_syogen_kanrisya_kubun': '管理者区分',
    'meta_RSDB_syogen_kanrisya_jimusyo': '管理者事務所',
    'meta_RSDB_syogen_kanrisya_meisyou': '管理者',
    'meta_RSDB_syogen_kyouchou': '橋長',
    'meta_RSDB_syogen_shisetsu_meisyou': '施設名',
    'meta_RSDB_syogen_shisetsu_furigana': '施設名(カナ)',
    'meta_RSDB_syogen_gyousei_kuiki_todoufuken_mei': '都道府県',
    'meta_RSDB_syogen_gyousei_kuiki_todoufuken_code': '都道府県コード',
    'meta_RSDB_syogen_gyousei_kuiki_shikuchouson_mei': '市区町村',
    'meta_RSDB_syogen_gyousei_kuiki_shikuchouson_code': '市区町村コード',
    'meta_RSDB_syogen_kasetsu_nendo': '架設年度',
    'meta_RSDB_tenken_nendo': '点検年度',
    'meta_RSDB_tenken_kiroku_hantei_kubun': '判定区分',
    'meta_RSDB_tenken_syuzen_sochi_joukyou': '修繕措置状況',
    'meta_RSDB_shisetsu_id': '施設ID',
    'meta_RSDB_kanrisya_code': '管理者コード',
    'meta_RSDB_shisetsu_kubun': '施設区分',
    'meta_RSDB_koushin_nichiji': '更新日時',
    
    # コロン区切り版も念のため残す（main.pyの仕様変更やデータ揺れ対策）
    'meta_RSDB:syogen_ichi_ido': '緯度',
    'meta_RSDB:syogen_ichi_keido': '経度',
    'meta_RSDB:syogen_rosen_meisyou': '路線名',
    'meta_RSDB:syogen_fukuin': '幅員',
    'meta_RSDB:syogen_kanrisya_kubun': '管理者区分',
    'meta_RSDB:syogen_kanrisya_jimusyo': '管理者事務所',
    'meta_RSDB:syogen_kanrisya_meisyou': '管理者',
    'meta_RSDB:syogen_kyouchou': '橋長',
    'meta_RSDB:syogen_shisetsu_meisyou': '施設名',
    'meta_RSDB:syogen_shisetsu_furigana': '施設名(カナ)',
    'meta_RSDB:syogen_gyousei_kuiki_todoufuken_mei': '都道府県',
    'meta_RSDB:syogen_gyousei_kuiki_todoufuken_code': '都道府県コード',
    'meta_RSDB:syogen_gyousei_kuiki_shikuchouson_mei': '市区町村',
    'meta_RSDB:syogen_gyousei_kuiki_shikuchouson_code': '市区町村コード',
    'meta_RSDB:syogen_kasetsu_nendo': '架設年度',
    'meta_RSDB:tenken_nendo': '点検年度',
    'meta_RSDB:tenken_kiroku_hantei_kubun': '判定区分',
    'meta_RSDB:tenken_syuzen_sochi_joukyou': '修繕措置状況',
    'meta_RSDB:shisetsu_id': '施設ID',
    'meta_RSDB:kanrisya_code': '管理者コード',
    'meta_RSDB:shisetsu_kubun': '施設区分',
    'meta_RSDB:koushin_nichiji': '更新日時',

    'meta_DPF:title': '施設名',
    'meta_DPF:route_name': '路線名',
    'meta_DPF:prefecture_name': '都道府県',
    'meta_DPF:municipality_name': '市区町村',
    'meta_DPF:year': '年度',
    'meta_DPF:downloadURLs': 'ダウンロードURL',

    # 追加: APIデータ取得機能構想.txt に基づくマッピング補完
    'meta_NLNI:crs_type': '座標系タイプ',
    'meta_NLNI:crs_properties_name': '座標系名',
    'meta_DPF:dataURLs': 'データURL',
    'meta_DPF:latitude': '緯度',
    'meta_NLNI:meishou': '名称',
    'meta_DPF:longitude': '経度',
    'meta_NLNI:shozaichi': '所在地',
    'meta_NLNI:shutai_code': '主体コード',
    'meta_DPF:prefecture_code': '都道府県コード',
    'meta_NLNI:todoufuken_code': '都道府県コード',
    'meta_DPF:year_originalform': '年度(元表記)',
    'meta_DPF:last_update_datetime': '最終更新日時',
    'meta_DPF:last_update_datetime_originalform': '最終更新日時(元表記)',
    'meta_DPF:dataset_id': 'データセットID',
    'meta_DPF:catalog_id': 'カタログID',
    'meta_DPF:dpf_update_date': 'DPF更新日',
    'meta_DPF:municipality_code': '市区町村コード',
    'meta_DPF:municipality_name': '市区町村',
    'meta_DPF:prefecture_name': '都道府県',
    'meta_DPF:catalog_title': 'カタログタイトル',
    'meta_DPF:dataset_title': 'データセットタイトル',
    'meta_DPF:theme': 'テーマ',
    'meta_DPF:dataset_keywords': 'キーワード',
    'meta_DPF:id': 'ID',
    'meta_DPF:ori_id': '元ID',
    'meta_DPF:related_count': '関連数',
    
    # 座標原点系 (NLNI)
    'meta_NLNI:genten_1': '原点1',
    'meta_NLNI:genten_2': '原点2',
    'meta_NLNI:genten_3': '原点3',
    'meta_NLNI:genten_4': '原点4',
    'meta_NLNI:genten_5': '原点5',
    'meta_NLNI:genten_6': '原点6',
    'meta_NLNI:genten_7': '原点7',
    'meta_NLNI:genten_8': '原点8',
    'meta_NLNI:genten_9': '原点9',
    
    # DPFのアダースコア版
    'meta_DPF_title': '施設名',
    'meta_DPF_route_name': '路線名',
    'meta_DPF_prefecture_name': '都道府県',
    'meta_DPF_municipality_name': '市区町村',
    'meta_DPF_year': '年度',
    'meta_DPF_downloadURLs': 'ダウンロードURL'
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
