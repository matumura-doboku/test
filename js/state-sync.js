import { state } from './state.js';
import {
    tabs,
    panels,
    vizSelect,
    vizSecondarySelect,
    vizModeSelect,
    vizFilterMode,
    filterPrimaryType,
    filterPrimaryMin,
    filterPrimaryMax,
    filterSecondaryType,
    filterSecondaryMin,
    filterSecondaryMax,
    vizFillOpacityInput,
    vizColorIntervalInput,
    vizCircleScaleInput,
    vizFillEmptyBlack,
    vizYearRadios,
    reportModeSelect,
    reportAggMetric,
    reportAggYearRadios,
    reportFacilitySearch,
    reportFacilityList
} from './dom.js';

const STORAGE_KEY = 'intai_app_state';

// 短縮キーのマップ
const STATE_MAP = {
    tab: 't',
    lat: 'lat',
    lng: 'lng',
    z: 'z',
    vizP: 'vp',
    vizS: 'vs',
    vizM: 'vm',
    fm: 'fm',
    fpT: 'fpt',
    fpMin: 'fpmin',
    fpMax: 'fpmax',
    fsT: 'fst',
    fsMin: 'fsmin',
    fsMax: 'fsmax',
    op: 'op',
    ci: 'ci',
    cs: 'cs',
    eb: 'eb',
    vizY: 'vy',
    repM: 'rm',
    aggM: 'am',
    aggY: 'ay',
    facS: 'fs', // Facility Search
    facSel: 'fsel', // Facility Selected (comma separated)
};

/**
 * 現在のUIと地図の状態を取得してオブジェクト形式で返す
 */
function getCurrentState() {
    const activeTab = document.querySelector('.tab.active')?.dataset.tab || 'home';
    const center = state.map ? state.map.getCenter() : { lat: 34.3853, lng: 132.4553 };
    const zoom = state.map ? state.map.getZoom() : 12.5;

    let selectedYear = '2020';
    if (vizYearRadios) {
        selectedYear = Array.from(vizYearRadios).find(r => r.checked)?.value || '2020';
    }

    // Facility State
    let facSearch = '';
    let facSelected = [];
    if (reportFacilitySearch) facSearch = reportFacilitySearch.value;
    if (reportFacilityList) {
        const checked = reportFacilityList.querySelectorAll('input[type="checkbox"]:checked');
        facSelected = Array.from(checked).map(c => c.value);
    }

    return {
        tab: activeTab,
        lat: center.lat.toFixed(6),
        lng: center.lng.toFixed(6),
        z: zoom.toFixed(2),
        vizP: vizSelect?.value,
        vizS: vizSecondarySelect?.value,
        vizM: vizModeSelect?.value,
        fm: vizFilterMode?.value,
        fpT: filterPrimaryType?.value,
        fpMin: filterPrimaryMin?.value,
        fpMax: filterPrimaryMax?.value,
        fsT: filterSecondaryType?.value,
        fsMin: filterSecondaryMin?.value,
        fsMax: filterSecondaryMax?.value,
        op: vizFillOpacityInput?.value,
        ci: vizColorIntervalInput?.value,
        cs: vizCircleScaleInput?.value,
        eb: vizFillEmptyBlack?.checked ? '1' : '0',
        vizY: selectedYear,
        repM: reportModeSelect?.value,
        aggM: reportAggMetric?.value,
        aggY: Array.from(reportAggYearRadios || []).find(r => r.checked)?.value || '2020',
        facS: facSearch,
        facSel: facSelected.join(','),
    };
}

/**
 * 状態をURLとLocalStorageに保存する
 */
export function saveState() {
    const currentState = getCurrentState();

    // LocalStorageに保存
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));

    // URLパラメータの更新
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(currentState)) {
        const shortKey = STATE_MAP[key];
        if (value !== undefined && value !== null && value !== '') {
            params.set(shortKey, value);
        }
    }

    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState({}, '', newUrl);
}

/**
 * 保存された状態を読み込み、UIと地図に適用する
 */
export function loadState() {
    const urlParams = new URLSearchParams(window.location.search);
    const savedJson = localStorage.getItem(STORAGE_KEY);
    const savedState = savedJson ? JSON.parse(savedJson) : {};

    // URLパラメータを優先、なければLocalStorage
    const getVal = (key) => {
        const shortKey = STATE_MAP[key];
        return urlParams.has(shortKey) ? urlParams.get(shortKey) : savedState[key];
    };

    // 1. タブの切り替え
    const tabId = getVal('tab');
    if (tabId) {
        const tabEl = document.querySelector(`.tab[data-tab="${tabId}"]`);
        if (tabEl) tabEl.click();
    }

    // 2. 可視化設定の適用
    if (vizSelect) vizSelect.value = getVal('vizP') || vizSelect.value;
    if (vizSecondarySelect) vizSecondarySelect.value = getVal('vizS') || vizSecondarySelect.value;
    if (vizModeSelect) {
        vizModeSelect.value = getVal('vizM') || (vizModeSelect.options.length > 0 ? vizModeSelect.options[0].value : '');
        // モード変更イベントを手動発火
        vizModeSelect.dispatchEvent(new Event('change'));
    }
    if (vizFilterMode) vizFilterMode.value = getVal('fm') || vizFilterMode.value;
    if (filterPrimaryType) filterPrimaryType.value = getVal('fpT') || filterPrimaryType.value;
    if (filterPrimaryMin) filterPrimaryMin.value = getVal('fpMin') || '';
    if (filterPrimaryMax) filterPrimaryMax.value = getVal('fpMax') || '';
    if (filterSecondaryType) filterSecondaryType.value = getVal('fsT') || filterSecondaryType.value;
    if (filterSecondaryMin) filterSecondaryMin.value = getVal('fsMin') || '';
    if (filterSecondaryMax) filterSecondaryMax.value = getVal('fsMax') || '';
    if (vizFillOpacityInput) vizFillOpacityInput.value = getVal('op') || vizFillOpacityInput.value;
    if (vizColorIntervalInput) vizColorIntervalInput.value = getVal('ci') || vizColorIntervalInput.value;
    if (vizCircleScaleInput) vizCircleScaleInput.value = getVal('cs') || vizCircleScaleInput.value;
    if (vizFillEmptyBlack) vizFillEmptyBlack.checked = getVal('eb') === '1';

    const yearVal = getVal('vizY');
    if (yearVal && vizYearRadios) {
        Array.from(vizYearRadios).forEach(r => {
            if (r.value === yearVal) r.checked = true;
        });
        // 状態復元時にもイベントを飛ばして地図等の同期待ち受け側に知らせる
        window.dispatchEvent(new CustomEvent('viz:year:changed', { detail: { year: Number(yearVal) } }));
    }

    // 3. 地図位置の適用 (地図がロードされた後に呼び出す必要がある)
    const lat = parseFloat(getVal('lat'));
    const lng = parseFloat(getVal('lng'));
    const zoom = parseFloat(getVal('z'));

    // 4. 分析モード・集計設定の適用
    if (reportModeSelect) {
        const val = getVal('repM');
        if (val) {
            reportModeSelect.value = val;
            reportModeSelect.dispatchEvent(new Event('change'));
        }
    }
    if (reportAggMetric) {
        reportAggMetric.value = getVal('aggM') || reportAggMetric.value;
    }
    const aggYearVal = getVal('aggY');
    if (aggYearVal && reportAggYearRadios) {
        Array.from(reportAggYearRadios).forEach(r => {
            if (r.value === aggYearVal) r.checked = true;
        });
    }

    // 5. 施設抽出設定の適用
    const facSearch = getVal('facS');
    const facSelected = getVal('facSel');

    if (reportFacilitySearch && facSearch) {
        reportFacilitySearch.value = facSearch;
        // Search input triggers rendering so we need to fire input event or call render manually
        // But renderFacilityList might not be available here directly (it's in ui-report.js).
        // Best way: Dispatch input event.
        setTimeout(() => {
            reportFacilitySearch.dispatchEvent(new Event('input', { bubbles: true }));

            // After render, check boxes
            if (facSelected) {
                // rendering is async if csv load needed, but here searching only filters list. 
                // However, facilityMapping needs to be loaded first in ui-report. initFacilityMode handles it.
                // We rely on initFacilityMode having run or running soon.
                // Wait a bit or use mutation observer? Simplify: assume synchronous rendering after init.
                setTimeout(() => {
                    const codes = facSelected.split(',');
                    codes.forEach(c => {
                        const cb = document.getElementById(`fac-${c}`);
                        if (cb) {
                            cb.checked = true;
                            // Make visible if hidden by search? Search logic handles visibility based on search text.
                            // If search text matches, it will be visible. If not, hidden but checked.
                            // If user wants to see checked ones, they clear search.
                            if (cb.parentElement) cb.parentElement.style.display = 'flex'; // Ensure visible
                        }
                    });
                    // Update count display
                    const countEl = document.getElementById('report-facility-count');
                    if (countEl) countEl.textContent = codes.length;
                }, 500);
            }
        }, 500); // Delay to allow main init
    } else if (facSelected) {
        // No search text but selected items exist
        setTimeout(() => {
            const codes = facSelected.split(',');
            codes.forEach(c => {
                const cb = document.getElementById(`fac-${c}`);
                if (cb) {
                    cb.checked = true;
                    if (cb.parentElement) cb.parentElement.style.display = 'flex';
                }
            });
            const countEl = document.getElementById('report-facility-count');
            if (countEl) countEl.textContent = codes.length;
        }, 500);
    }

    return {
        lat: isNaN(lat) ? null : lat,
        lng: isNaN(lng) ? null : lng,
        zoom: isNaN(zoom) ? null : zoom
    };
}

/**
 * 変更イベントを監視して自動保存を開始する
 */
export function initAutoSave() {
    // UI要素の変更監視
    const inputs = [
        vizSelect, vizSecondarySelect, vizModeSelect, vizFilterMode,
        filterPrimaryType, filterPrimaryMin, filterPrimaryMax,
        filterSecondaryType, filterSecondaryMin, filterSecondaryMax,
        vizFillOpacityInput, vizColorIntervalInput, vizCircleScaleInput,
        vizFillEmptyBlack,
        reportFacilitySearch // Add
    ];

    inputs.forEach(el => {
        if (!el) return;
        const eventType = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(eventType, () => {
            saveState();
        });
    });

    if (vizYearRadios) {
        vizYearRadios.forEach(el => {
            el.addEventListener('change', saveState);
        });
    }

    if (reportModeSelect) reportModeSelect.addEventListener('change', saveState);
    if (reportAggMetric) reportAggMetric.addEventListener('change', saveState);
    if (reportAggYearRadios) {
        reportAggYearRadios.forEach(el => {
            el.addEventListener('change', saveState);
        });
    }

    // Facility Checkboxes Delegation
    if (reportFacilityList) {
        reportFacilityList.addEventListener('change', (e) => {
            if (e.target.matches('input[type="checkbox"]')) {
                saveState();
            }
        });
    }

    // タブの変更監視
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // タブのクリックハンドラが完了した後に保存するため、少し遅らせる
            setTimeout(saveState, 0);
        });
    });

    // 地図の変更監視 (地図初期化後に別途設定)
}

export function bindMapEvents(map) {
    if (!map) return;
    const onMove = () => {
        saveState();
    };
    map.on('moveend', onMove);
    map.on('zoomend', onMove);
}

export function initShareButton() {
    const shareBtn = document.getElementById('share-btn');
    if (!shareBtn) return;
    shareBtn.addEventListener('click', () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            const originalText = shareBtn.textContent;
            shareBtn.textContent = 'コピー完了';
            setTimeout(() => {
                shareBtn.textContent = originalText;
            }, 2000);
        });
    });
}

/**
 * 状態を初期化（リセット）する
 */
export function resetState() {
    if (!confirm('すべての設定を初期状態に戻しますか？')) return;

    // LocalStorageの消去
    localStorage.removeItem(STORAGE_KEY);

    // リロード
    window.location.href = window.location.pathname;
}

