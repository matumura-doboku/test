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
            <span>${field}</span>
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

    Object.keys(sampleData).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key;
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
                return `<div><span style="font-size:10px;color:#666;">${field}</span><br><strong>${val}</strong></div>`;
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
