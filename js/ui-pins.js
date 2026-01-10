import { state } from './state.js';
import {
    vizModeSelect,
    vizSettingsGrid,
    vizSettingsPin,
    pinDataCount,
    pinDataDate,
    pinDataStatus,
    pinLoadBtn,
    pinFilterAlert,
    pinFieldSelect,
    pinFieldAdd,
    pinFieldList
} from './dom.js';

let selectedFields = ['title', 'hantei']; // デフォルト表示項目

const FIELD_LABELS = {
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

function getFieldLabel(key) {
    if (FIELD_LABELS[key]) return FIELD_LABELS[key];
    const parts = key.split(':');
    return parts.length > 1 ? parts[parts.length - 1] : key;
}

export function initPinVisualization() {
    if (!vizModeSelect) return;

    // ... (イベントリスナー省略) ...
    if (pinLoadBtn) {
        pinLoadBtn.addEventListener('click', loadPinData);
    }

    if (pinFilterAlert) {
        pinFilterAlert.addEventListener('change', updatePinFilter);
    }

    if (pinFieldAdd) {
        pinFieldAdd.addEventListener('click', addDisplayField);
    }

    loadPinData();
    renderFieldList();
}

// フィールドリストの描画
function renderFieldList() {
    if (!pinFieldList) return;
    pinFieldList.innerHTML = '';
    selectedFields.forEach(field => {
        const item = document.createElement('div');
        item.className = 'field-item';
        item.innerHTML = `
            <span>${getFieldLabel(field)}</span>
            <button class="btn-remove" data-field="${field}">×</button>
        `;
        pinFieldList.appendChild(item);
    });

    // 削除ボタンのイベント
    pinFieldList.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const field = e.target.dataset.field;
            selectedFields = selectedFields.filter(f => f !== field);
            renderFieldList();
            // ポップアップ更新のためにレイヤ更新などは不要（クリック時に動的生成するため）
        });
    });
}

function addDisplayField() {
    const val = pinFieldSelect.value;
    if (!val || selectedFields.includes(val)) return;
    selectedFields.push(val);
    renderFieldList();
    pinFieldSelect.value = '';
}

function loadPinData() {
    const jsonStr = localStorage.getItem('daredemoGIS_imported_data');
    const timestamp = localStorage.getItem('daredemoGIS_import_timestamp');

    if (!jsonStr) {
        pinDataStatus.textContent = 'データが見つかりません。';
        return;
    }

    try {
        const data = JSON.parse(jsonStr);
        pinDataCount.textContent = `${data.length} 件`;
        pinDataDate.textContent = timestamp ? new Date(timestamp).toLocaleString() : '不明';
        pinDataStatus.textContent = 'データ読み込み完了';

        // ドロップダウンの更新
        updateFieldSelectOptions(data[0]);

        addPinLayer(data);
    } catch (e) {
        console.error(e);
        pinDataStatus.textContent = 'データの読み込みに失敗しました。';
    }
}

function updateFieldSelectOptions(sampleData) {
    if (!sampleData || !pinFieldSelect) return;
    const currentVal = pinFieldSelect.value;
    pinFieldSelect.innerHTML = '<option value="">項目を選択...</option>';

    // meta_RSDBで始まるキー または title, id, lat, lon など許可リストにあるもの
    const ALLOWED_FIELDS = ['title', 'hantei', 'id', 'lat', 'lon'];

    const keys = Object.keys(sampleData).filter(key => {
        return key.startsWith('meta_RSDB') || ALLOWED_FIELDS.includes(key);
    });

    // Sort keys: put allowed fields first, then alphabetical or standard order
    keys.sort((a, b) => {
        const aIsAllowed = ALLOWED_FIELDS.includes(a);
        const bIsAllowed = ALLOWED_FIELDS.includes(b);
        if (aIsAllowed && !bIsAllowed) return -1;
        if (!aIsAllowed && bIsAllowed) return 1;
        return a.localeCompare(b);
    });

    keys.forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = getFieldLabel(key);
        pinFieldSelect.appendChild(option);
    });
    pinFieldSelect.value = currentVal;
}

function addPinLayer(data) {
    if (!state.map || !state.mapReady) return;

    const features = data.filter(d => d.lat && d.lon).map(d => ({
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [Number(d.lon), Number(d.lat)]
        },
        properties: {
            ...d,
            hantei: Number(d['meta_RSDB:tenken_kiroku_hantei_kubun'] || 0)
        }
    }));

    const geojson = { type: 'FeatureCollection', features: features };
    const sourceId = 'imported-pins';

    if (state.map.getSource(sourceId)) {
        state.map.getSource(sourceId).setData(geojson);
    } else {
        state.map.addSource(sourceId, { type: 'geojson', data: geojson });

        state.map.addLayer({
            id: `${sourceId}-circle`,
            type: 'circle',
            source: sourceId,
            paint: {
                'circle-radius': 6,
                'circle-color': [
                    'match',
                    ['get', 'hantei'],
                    4, '#ef4444', 3, '#ef4444', 2, '#f59e0b', 1, '#3b82f6', '#9ca3af'
                ],
                'circle-stroke-width': 1,
                'circle-stroke-color': '#ffffff'
            }
        });

        // クリックイベント改修: selectedFieldsに基づいてポップアップを表示
        state.map.on('click', `${sourceId}-circle`, (e) => {
            const props = e.features[0].properties;

            // 選択された項目をビルド
            const content = selectedFields.map(field => {
                const val = props[field] !== undefined ? props[field] : '-';
                return `<div><span style="font-size:10px;color:#666;">${getFieldLabel(field)}</span><br><strong>${val}</strong></div>`;
            }).join('<hr style="margin:4px 0;border:none;border-top:1px solid #eee;">');

            new maplibregl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(`<div style="max-height:200px;overflow-y:auto;">${content}</div>`)
                .addTo(state.map);
        });

        // ... (マウスホバーイベント等はそのまま) ...
        state.map.on('mouseenter', `${sourceId}-circle`, () => {
            state.map.getCanvas().style.cursor = 'pointer';
        });
        state.map.on('mouseleave', `${sourceId}-circle`, () => {
            state.map.getCanvas().style.cursor = '';
        });
    }
    // updateMapLayerVisibility(vizModeSelect.value); // Removed to be handled by ui-visualization.js
}

function updatePinFilter() {
    if (!state.map || !state.map.getLayer('imported-pins-circle')) return;

    const showOnlyAlert = pinFilterAlert.checked;
    const filter = showOnlyAlert
        ? ['in', ['get', 'hantei'], ['literal', [3, 4]]]
        : null;

    state.map.setFilter('imported-pins-circle', filter);
}
