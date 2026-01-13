
import { state } from './state.js';

export function processCSVFiles(files, callback) {
    let resultsCount = 0;

    // Safety initialization
    if (!state.loadedFiles) state.loadedFiles = {};

    Array.from(files).forEach((file) => {
        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: function (results) {
                // Double safety inside callback
                if (!state.loadedFiles) state.loadedFiles = {};

                state.loadedFiles[file.name] = {
                    data: results.data,
                    headers: Object.keys(results.data[0] || {})
                };
                resultsCount++;
                if (resultsCount === files.length) {
                    if (callback) callback(file.name, results.data.length);
                }
            }
        });
    });
}

export function loadPreset(url, name, callback) {
    if (!state.loadedFiles) state.loadedFiles = {};

    fetch(url)
        .then(res => res.text())
        .then(csvText => {
            Papa.parse(csvText, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: function (results) {
                    if (!state.loadedFiles) state.loadedFiles = {};

                    state.loadedFiles[name] = {
                        data: results.data,
                        headers: Object.keys(results.data[0] || {})
                    };
                    if (callback) callback(name, results.data.length);
                }
            });
        });
}
