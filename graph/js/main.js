
import { state } from './state.js';
import { elements, initTabs, initChartTypeLogic, addSeries, populateAllSelects } from './ui.js';
import { processCSVFiles, loadPreset } from './loader.js';
import { drawChart, addShape, clearShapes, addTrendline, predictY, addAverageLine } from './chart.js';
import { exportToPPTX } from './export.js';
import { initInteractions } from './interaction.js';
import { initDropdowns } from './ui-dropdown.js';

// --- Initialization ---
function init() {
    initTabs();
    initChartTypeLogic();
    initInteractions();
    initDropdowns();
    addSeries(); // Add initial series

    // File Input Events
    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processCSVFiles(e.target.files, onDataLoaded);
        }
    });

    // Drag & Drop
    ['dragenter', 'dragover'].forEach(name => {
        elements.dropArea.addEventListener(name, () => elements.dropArea.classList.add('dragover'));
    });
    ['dragleave', 'drop'].forEach(name => {
        elements.dropArea.addEventListener(name, () => elements.dropArea.classList.remove('dragover'));
    });
    elements.dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
            processCSVFiles(e.dataTransfer.files, onDataLoaded);
        }
    });
    elements.dropArea.addEventListener('dragover', (e) => e.preventDefault());

    // Preset Buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            loadPreset(btn.dataset.url, btn.textContent.trim(), onDataLoaded);
        });
    });

    // Reset
    elements.removeFileBtn.addEventListener('click', () => {
        state.loadedFiles = {};
        state.headers = [];
        elements.fileInput.value = '';
        elements.fileStatusSection.classList.add('hidden');
        elements.dropArea.classList.remove('hidden');
        elements.seriesContainer.innerHTML = '';
        addSeries();
        populateAllSelects();
    });

    // Add Series
    elements.addSeriesBtn.addEventListener('click', () => addSeries());

    // Action Buttons
    elements.drawBtn.addEventListener('click', () => drawChart());
    elements.downloadBtn.addEventListener('click', () => exportToPPTX());

    // Highlight Shape Events
    elements.addRectBtn.addEventListener('click', () => addShape('rect'));
    elements.addCircleBtn.addEventListener('click', () => addShape('circle'));
    elements.addTrendlineBtn.addEventListener('click', () => addTrendline());
    elements.addAverageBtn.addEventListener('click', () => addAverageLine());
    elements.predictBtn.addEventListener('click', () => predictY());
    elements.clearShapesBtn.addEventListener('click', () => clearShapes());


}

function onDataLoaded(name, rowCount) {
    elements.fileNameDisplay.textContent = name;
    elements.rowCountDisplay.textContent = `${rowCount} 行`;
    elements.dropArea.classList.add('hidden');
    elements.fileStatusSection.classList.remove('hidden');
    populateAllSelects();
    document.querySelector('[data-tab="settings"]').click();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
