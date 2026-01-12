export const FIELD_LABELS = {
    'title': '施設名称',
    'hantei': '判定区分(数値)',
    'lat': '緯度',
    'lon': '経度',
    'id': 'ID',
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

    // DPF fields (optional, if needed to match user request better I can comment these out or keep them)
    'meta_DPF:title': '施設名',
    'meta_DPF:route_name': '路線名',
    'meta_DPF:prefecture_name': '都道府県',
    'meta_DPF:municipality_name': '市区町村',
    'meta_DPF:year': '年度',
    'meta_DPF:downloadURLs': 'ダウンロードURL'
};

export function getFieldLabel(key) {
    if (FIELD_LABELS[key]) return FIELD_LABELS[key];
    const parts = key.split(':');
    return parts.length > 1 ? parts[parts.length - 1] : key;
}
