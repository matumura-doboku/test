/**
 * 項目名変換マップ & 翻訳ロジック
 * Python版 translator.py のJavaScript移植版
 */

const FIELD_LABELS = {
    'id': 'ID',
    'title': '施設名称',
    'lat': '緯度',
    'lon': '経度',
    'metadata': 'metadata',
    'meta_DPF:year': '年度',
    // Note: These mappings are derived strictly from the provided 'APIデータ取得機能構想.txt' rows.
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

    // 以下、従来の辞書定義も念のため保持
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
    'meta_RSDB_koushin_nichiji': '更新日時'
};

/**
 * キー（ヘッダー）のリストを受け取り、翻訳後のヘッダーリストとマッピングオブジェクトを返す
 * @param {string[]} headersList 
 * @returns {{translatedHeaders: string[], mapping: {[key: string]: string}}}
 */
function translateHeaders(headersList) {
    const translatedHeaders = [];
    const mapping = {};

    headersList.forEach(key => {
        let newKey = key;

        // 1. 辞書完全一致
        if (FIELD_LABELS[key]) {
            newKey = FIELD_LABELS[key];
        } else {
            // 2. 揺らぎ吸収 (Normalization)
            let normalizedAttempt = key;
            const targets = ['shogen', 'kanrisha', 'meisho', 'jimusho', 'shuzen', 'kyocho', 'jokyo'];

            // シンプルなチェック: いずれかのターゲット文字列が含まれているか
            if (targets.some(t => key.includes(t))) {
                normalizedAttempt = key
                    .replace(/shogen/g, 'syogen')
                    .replace(/kanrisha/g, 'kanrisya')
                    .replace(/meisho/g, 'meisyou') // meishou -> meisyou もカバー
                    .replace(/jimusho/g, 'jimusyo')
                    .replace(/shuzen/g, 'syuzen')
                    .replace(/kyocho/g, 'kyouchou')
                    .replace(/jokyo/g, 'joukyou');
            }

            if (FIELD_LABELS[normalizedAttempt]) {
                newKey = FIELD_LABELS[normalizedAttempt];
            }
            // 3. フォールバック整形
            else if (key === newKey) {
                if (key.includes(':')) {
                    newKey = key.split(':').pop();
                } else if (key.includes('_') && (key.includes('meta_RSDB') || key.includes('meta_DPF'))) {
                    newKey = key.replace('meta_RSDB_', '').replace('meta_DPF_', '');
                }
            }
        }

        translatedHeaders.push(newKey);
        mapping[key] = newKey;
    });

    return { translatedHeaders, mapping };
}

/**
 * データリスト全体を受け取り、キーを翻訳して返す実用関数
 * @param {object[]} dataList 
 * @returns {object[]}
 */
function translateDataList(dataList) {
    if (!dataList || dataList.length === 0) return [];

    // 1. ユニークなキーを全件から収集
    const allKeysSet = new Set();
    // パフォーマンスのため、最大でも最初の100件程度を見れば通常は十分だが、
    // ここでは安全のため全件見る (JSなら高速)
    dataList.forEach(item => {
        Object.keys(item).forEach(k => allKeysSet.add(k));
    });

    const sampleKeys = Array.from(allKeysSet);

    // 2. マッピング作成
    const { mapping } = translateHeaders(sampleKeys);

    // 3. データ変換
    return dataList.map(item => {
        const newItem = {};
        Object.entries(item).forEach(([k, v]) => {
            // マッピングにあれば変換、なければそのまま
            const destKey = mapping[k] || k;
            newItem[destKey] = v;
        });
        return newItem;
    });
}

// ブラウザのグローバルスコープで使えるようにexposeする
window.Translator = {
    translateHeaders,
    translateDataList,
    FIELD_LABELS
};
