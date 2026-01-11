import { state } from './state.js';
import { registerLabels, parseFilterExpression } from './filter-parser.js';
import {
    vizModeSelect,
    vizSettingsGrid,
    vizSettingsPin,
    pinDataCount,
    pinDataDate,
    pinDataStatus,
    pinLoadBtn,
    pinCsvInput, // 追加
    pinFilterAlert,
    pinFilterFormula,
    pinFilterApply,
    pinFilterClear,
    pinFieldSelect,
    pinFieldAdd,
    pinFieldList
} from './dom.js';

let selectedFields = ['施設名称', '判定区分(数値)']; // デフォルト表示項目
// 柔軟なカラム特定のためのロジックは削除し、Pythonから送られてきたキーを直接使用する

function getFieldLabel(key) {
    // サーバーサイド(Python)ですでに翻訳されているため、キーをそのまま返す
    // 必要であればここで追加の整形を行うことも可能
    return key;
}

export function initPinVisualization() {
    if (!vizModeSelect) return;

    registerLabels(FIELD_LABELS);

    if (pinLoadBtn) {
        pinLoadBtn.addEventListener('click', loadPinDataFromStorage);
    }

    if (pinCsvInput) {
        pinCsvInput.addEventListener('change', handleCsvUpload);
    }

    if (pinFilterAlert) {
        pinFilterAlert.addEventListener('change', updatePinFilter);
    }

    if (pinFilterApply) {
        pinFilterApply.addEventListener('click', updatePinFilter);
    }

    if (pinFilterClear) {
        pinFilterClear.addEventListener('click', () => {
            if (pinFilterFormula) pinFilterFormula.value = '';
            if (pinFilterAlert) pinFilterAlert.checked = false;
            updatePinFilter();
        });
    }

    if (pinFieldAdd) {
        pinFieldAdd.addEventListener('click', addDisplayField);
    }

    loadPinDataFromStorage();
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

function handleCsvUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    pinDataStatus.textContent = 'CSV読み込み中...';

    Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function (results) {
            if (results.data && results.data.length > 0) {
                // 必須フィールドチェック (lat, lon または 緯度, 経度)
                const sample = results.data[0];
                console.log("CSV Loaded:", results.data.length, "rows");

                // データを整形 (lat/lonがなければ緯度/経度カラムを探すなどの正規化もここで行うと良い)
                // 今回はそのまま渡す
                processPinData(results.data, new Date().toISOString());

                // 成功したらLocalStorageにも保存しておく（オプション）
                try {
                    localStorage.setItem('daredemoGIS_imported_data', JSON.stringify(results.data));
                    localStorage.setItem('daredemoGIS_import_timestamp', new Date().toISOString());
                } catch (err) {
                    console.warn('Storage quota exceeded, skipping local save', err);
                }
            } else {
                pinDataStatus.textContent = 'CSVデータが空です。';
            }
        },
        error: function (err) {
            console.error(err);
            pinDataStatus.textContent = 'CSV読み込みエラー: ' + err.message;
        }
    });
}

function loadPinDataFromStorage() {
    const jsonStr = localStorage.getItem('daredemoGIS_imported_data');
    const timestamp = localStorage.getItem('daredemoGIS_import_timestamp');

    if (!jsonStr) {
        pinDataStatus.textContent = 'データが見つかりません。';
        return;
    }

    try {
        const data = JSON.parse(jsonStr);
        processPinData(data, timestamp);
    } catch (e) {
        console.error(e);
        pinDataStatus.textContent = 'Storageデータの読み込みに失敗しました。';
    }
}

function processPinData(data, timestamp) {
    if (!data || data.length === 0) return;

    pinDataCount.textContent = `${data.length} 件`;
    pinDataDate.textContent = timestamp ? new Date(timestamp).toLocaleString() : '不明';
    pinDataStatus.textContent = 'データ読み込み完了';

    // ドロップダウンの更新
    updateFieldSelectOptions(data[0]);

    addPinLayer(data);
}

function updateFieldSelectOptions(sampleData) {
    if (!sampleData || !pinFieldSelect) return;
    const currentVal = pinFieldSelect.value;
    pinFieldSelect.innerHTML = '<option value="">項目を選択...</option>';

    // Pythonから送られてきた全てのキーをドロップダウンの候補とする
    const keys = Object.keys(sampleData);

    keys.forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key; // getFieldLabelを通さず、キーそのものを表示（Python側で翻訳済みのため）
        pinFieldSelect.appendChild(option);
    });
    pinFieldSelect.value = currentVal;
}

function addPinLayer(data) {
    if (!state.map || !state.mapReady) return;

    // Python側で「緯度」「経度」というキーに翻訳されていることを前提とする
    // もしPython側の翻訳が変われば、ここも自動的に影響を受ける（データ駆動）
    const features = data.filter(d => d['緯度'] && d['経度']).map(d => ({
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [Number(d['経度']), Number(d['緯度'])]
        },
        properties: {
            ...d,
            // 色分け用の数値データ。Python側で「判定区分(数値)」に変換されている箇所を参照
            // キーが存在しない場合はデフォルト0
            hantei: Number(d['判定区分(数値)'] || 0)
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

    const showOnlyAlert = pinFilterAlert?.checked;
    const formulaText = pinFilterFormula?.value?.trim();

    let filter = null;
    const conditions = [];

    // チェックボックスの条件
    if (showOnlyAlert) {
        // 色分けロジック側でのプロパティ名確認が必要。
        // 上記addPinLayerで properties.hantei に数値をセットしているので、フィルタは 'hantei' のままで良い
        conditions.push(['in', ['get', 'hantei'], ['literal', [3, 4]]]);
    }

    // 数式の条件
    if (formulaText) {
        const parsedFormula = parseFilterExpression(formulaText);
        if (parsedFormula) {
            conditions.push(parsedFormula);
        }
    }

    // 条件を組み合わせる
    if (conditions.length === 0) {
        filter = null; // フィルタなし（全表示）
    } else if (conditions.length === 1) {
        filter = conditions[0];
    } else {
        filter = ['all', ...conditions];
    }

    state.map.setFilter('imported-pins-circle', filter);
    console.log('Pin filter applied:', filter);
}
