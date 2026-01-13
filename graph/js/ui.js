
import { state } from './state.js';

// Get elements dynamically to avoid null/undefined during initialization
export const elements = {
    get tabs() { return document.querySelectorAll('.tab'); },
    get panels() { return document.querySelectorAll('.panel'); },
    get dropArea() { return document.getElementById('drop-area'); },
    get fileInput() { return document.getElementById('csv-file'); },
    get fileStatusSection() { return document.getElementById('file-status-section'); },
    get fileNameDisplay() { return document.getElementById('filename'); },
    get rowCountDisplay() { return document.getElementById('row-count'); },
    get removeFileBtn() { return document.getElementById('remove-file'); },
    get seriesContainer() { return document.getElementById('series-container'); },
    get addSeriesBtn() { return document.getElementById('add-series-btn'); },
    get colorAxisSelect() { return document.getElementById('color-axis'); },
    get sizeAxisSelect() { return document.getElementById('size-axis'); },
    get chartTypeRadios() { return document.querySelectorAll('input[name="chart-type"]'); },
    get scatterOptions() { return document.getElementById('scatter-options'); },
    get drawBtn() { return document.getElementById('draw-btn'); },
    get downloadBtn() { return document.getElementById('download-pptx'); },
    get addRectBtn() { return document.getElementById('add-rect-btn'); },
    get addCircleBtn() { return document.getElementById('add-circle-btn'); },
    get analysisTargetSelect() { return document.getElementById('analysis-target-series'); },
    get shapeColorPicker() { return document.getElementById('shape-color'); },
    get clearShapesBtn() { return document.getElementById('clear-shapes-btn'); },
    get addTrendlineBtn() { return document.getElementById('add-trendline-btn'); },
    get addAverageBtn() { return document.getElementById('add-average-btn'); },
    get predictionWrapper() { return document.getElementById('prediction-wrapper'); },
    get predictXInput() { return document.getElementById('predict-x-input'); },
    get predictBtn() { return document.getElementById('predict-btn'); },
};

export function initTabs() {
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            elements.tabs.forEach(t => t.classList.remove('active'));
            elements.panels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const targetId = `panel-${tab.dataset.tab}`;
            document.getElementById(targetId).classList.add('active');
        });
    });
}

export function initChartTypeLogic() {
    elements.chartTypeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'scatter') {
                elements.scatterOptions?.classList.remove('hidden');
            } else {
                elements.scatterOptions?.classList.add('hidden');
            }
        });
    });
}

export function addSeries() {
    state.seriesCount++;
    const id = state.seriesCount;
    const card = document.createElement('div');
    card.className = 'series-card';
    card.dataset.id = id;

    const container = elements.seriesContainer;
    if (!container) return;

    const isFirst = container.children.length === 0;

    card.innerHTML = `
        <div class="row space-between" style="margin-bottom: 8px;">
            <span style="font-size: 11px; font-weight: 700; color: var(--primary);">系列 #${id}</span>
            ${!isFirst ? `<button class="series-remove"><i class="fa-solid fa-times"></i></button>` : ''}
        </div>
        <label class="field">
            <span>使用ファイル</span>
            <select class="file-select"><option value="">未選択</option></select>
        </label>
        
        <div class="axis-config hidden">
            <label class="field">
                <span>X軸 (カテゴリ/横軸)</span>
                <select class="x-axis-select"><option value="">未選択</option></select>
            </label>
            <label class="field">
                <span>Y軸 (値/縦軸)</span>
                <select class="y-axis-select"><option value="">未選択</option></select>
            </label>
        </div>
    `;

    container.appendChild(card);

    // Listeners
    const fileSel = card.querySelector('.file-select');
    fileSel.addEventListener('change', () => {
        updateAxisSelects(card);
    });

    if (!isFirst) {
        card.querySelector('.series-remove')?.addEventListener('click', () => card.remove());
    }

    populateFileSelect(fileSel);
}

function populateFileSelect(sel) {
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">ファイルを選択</option>';
    const files = state.loadedFiles || {};
    Object.keys(files).forEach(fileName => {
        const op = document.createElement('option');
        op.value = fileName;
        op.textContent = fileName;
        sel.appendChild(op);
    });
    if (state.loadedFiles && state.loadedFiles[currentVal]) sel.value = currentVal;
}

function updateAxisSelects(card) {
    const fileName = card.querySelector('.file-select').value;
    const axisConfig = card.querySelector('.axis-config');
    const xSel = card.querySelector('.x-axis-select');
    const ySel = card.querySelector('.y-axis-select');

    if (!fileName || !state.loadedFiles || !state.loadedFiles[fileName]) {
        axisConfig.classList.add('hidden');
        return;
    }

    axisConfig.classList.remove('hidden');
    const headers = state.loadedFiles[fileName].headers;

    // Populate axes
    [xSel, ySel].forEach(sel => {
        const currentVal = sel.value;
        sel.innerHTML = `<option value="">未選択</option>`;
        headers.forEach(h => {
            const op = document.createElement('option');
            op.value = h; op.textContent = h;
            sel.appendChild(op);
        });
        if (headers.includes(currentVal)) sel.value = currentVal;
    });

    // Auto-guess for first time
    if (!xSel.value && headers.length > 0) xSel.value = headers[0];
    if (!ySel.value && headers.length > 1) ySel.value = headers[1];
}



export function populateAllSelects() {
    document.querySelectorAll('.file-select').forEach(sel => {
        const card = sel.closest('.series-card');
        populateFileSelect(sel);
        if (sel.value) updateAxisSelects(card);
    });



    const files = state.loadedFiles || {};
    const firstFile = Object.values(files)[0];
    if (firstFile) {
        [elements.colorAxisSelect, elements.sizeAxisSelect].forEach(sel => {
            const currentVal = sel.value;
            sel.innerHTML = '<option value="">未選択</option>';
            firstFile.headers.forEach(h => {
                const op = document.createElement('option');
                op.value = h; op.textContent = h;
                sel.appendChild(op);
            });
            if (firstFile.headers.includes(currentVal)) sel.value = currentVal;
        });
    }
}
