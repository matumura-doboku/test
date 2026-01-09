import { initTabs } from './ui-tabs.js';
import { initMap, loadRoads, toggleRoads } from './map.js';
import { initAddressSearch } from './ui-address.js';
import { initVisualization, applyGridVisualization } from './ui-visualization.js';
import { initReport } from './ui-report.js';
import { initSummary } from './ui-summary.js';
import { initGuide } from './ui-guide.js';
import { initPropertyPanel } from './ui-property.js';
import { initDropdowns } from './ui-dropdown.js';
import { roadsLoadBtn, roadsToggleBtn } from './dom.js';
import { loadState, initAutoSave, bindMapEvents, initShareButton, resetState } from './state-sync.js';
import { state } from './state.js';

// 各種UIモジュールの初期化
initTabs();
initAddressSearch();
initVisualization();
initReport();
initSummary();
initGuide();
initPropertyPanel();
initDropdowns();

// 保存された状態の復元（地理的位置を含む）
const initialView = loadState();

// 地図の初期化（復元した座標・ズームを適用）
initMap(initialView);

// 自動保存と共有機能のセットアップ
initAutoSave();
initShareButton();

// 地図インスタンスが生成されたらイベントをバインド
// 地図インスタンスが生成されたらイベントをバインド
const checkMap = setInterval(() => {
    if (state.map) {
        bindMapEvents(state.map);
        // レイアウト変更後の描画崩れを防ぐためリサイズを通知
        state.map.resize();
        clearInterval(checkMap);
    }
}, 500);

roadsLoadBtn?.addEventListener('click', loadRoads);
roadsToggleBtn?.addEventListener('click', toggleRoads);
document.getElementById('app-reset')?.addEventListener('click', resetState);

// 初期表示の微調整
window.addEventListener('load', () => {
    // データ読み込み後の表示更新を確実にするため少し遅延させて適用
    setTimeout(() => {
        applyGridVisualization();
    }, 1000);
});
