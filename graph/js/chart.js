
import { state } from './state.js';

const layoutTemplate = {
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    font: { color: '#334155', family: 'Zen Kaku Gothic New, sans-serif' },
    xaxis: { gridcolor: '#e2e8f0', linecolor: '#cbd5e1', zerolinecolor: '#cbd5e1', tickfont: { size: 11 } },
    yaxis: { gridcolor: '#e2e8f0', linecolor: '#cbd5e1', zerolinecolor: '#cbd5e1', tickfont: { size: 11 } },
    margin: { t: 50, r: 20, l: 60, b: 60 },
    colorway: ['#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6']
};

export function drawChart() {
    const typeRadio = document.querySelector('input[name="chart-type"]:checked');
    const type = typeRadio ? typeRadio.value : 'line';
    const cards = document.querySelectorAll('.series-card');
    const traces = [];
    let titleText = "";

    cards.forEach((card, i) => {
        const fileName = card.querySelector('.file-select').value;
        const xCol = card.querySelector('.x-axis-select').value;
        const yCol = card.querySelector('.y-axis-select').value;
        const files = state.loadedFiles || {};
        if (!fileName || !files[fileName] || !xCol || !yCol) return;

        let fileData = files[fileName].data;

        let xData = fileData.map(row => row[xCol]);

        const yData = fileData.map(row => row[yCol]);
        let traceName = `${yCol} (${fileName})`;

        // Prepare custom data for tooltips/pinning
        const customData = fileData.map(row => {
            const meshId = row.KEY_CODE || row.kye_code || row.key_code || row.id || "-";
            return {
                xLabel: xCol,
                yLabel: yCol,
                meshId: meshId
            };
        });

        let trace = {
            x: xData, y: yData, name: traceName,
            customdata: customData,
            hovertemplate: `<b>%{customdata.meshId}</b><br>` +
                `%{customdata.xLabel}: %{x}<br>` +
                `%{customdata.yLabel}: %{y}<br>` +
                `<extra></extra>`,
            type: 'scatter',
            mode: type === 'scatter' ? 'markers' : 'lines+markers',
        };


        if (type === 'scatter') {
            const colorCol = document.getElementById('color-axis').value;
            const sizeCol = document.getElementById('size-axis').value;
            trace.marker = { size: 10, opacity: 0.7 };
            if (colorCol && fileData[0] && fileData[0].hasOwnProperty(colorCol)) {
                trace.marker.color = fileData.map(row => row[colorCol]);
                trace.marker.showscale = true;
                trace.marker.colorbar = { title: colorCol };
            }
            if (sizeCol && fileData[0] && fileData[0].hasOwnProperty(sizeCol)) {
                const rawSizes = fileData.map(row => row[sizeCol]);
                const maxVal = Math.max(...rawSizes.filter(v => !isNaN(v)));
                trace.marker.size = rawSizes.map(v => (v / maxVal) * 35 + 5);
            }
        }
        traces.push(trace);
    });

    if (traces.length === 0) {
        alert("有効な系列設定がありません");
        return;
    }

    if (!titleText) {
        if (traces.length === 1) {
            titleText = `${traces[0].name.split(' (')[0]} vs ${cards[0].querySelector('.x-axis-select').value}`;
        } else {
            titleText = "Multi-Series Graph";
        }
    }

    // --- Dynamic Window Creation ---
    const template = document.getElementById('graph-template');
    const canvas = document.getElementById('canvas-area');
    const newWindow = template.cloneNode(true);
    newWindow.id = `graph-${Date.now()}`;
    newWindow.classList.remove('hidden');
    newWindow.querySelector('.graph-title').textContent = titleText;

    // Position slightly offset to see overlapping
    const count = canvas.querySelectorAll('.graph-wrapper:not(.hidden)').length;
    newWindow.style.transform = `translate(${count * 20}px, ${count * 20}px)`;
    newWindow.dataset.x = count * 20;
    newWindow.dataset.y = count * 20;

    canvas.appendChild(newWindow);
    document.getElementById('empty-state').classList.add('hidden');

    const plotArea = newWindow.querySelector('.plot-content');

    newWindow.querySelector('.graph-close-btn').addEventListener('click', () => {
        newWindow.remove();
        if (canvas.querySelectorAll('.graph-wrapper:not(.hidden)').length === 0) {
            document.getElementById('empty-state').classList.remove('hidden');
        }
    });

    const layout = {
        ...layoutTemplate,
        title: { text: titleText, font: { size: 18 } },
        xaxis: { ...layoutTemplate.xaxis, title: { text: "X-Axis" }, autorange: true },
        yaxis: { ...layoutTemplate.yaxis },
        showlegend: true,
        annotations: [],
        margin: { t: 60, r: 40, l: 60, b: 60 }
    };

    const config = {
        responsive: true,
        displaylogo: false,
        editable: true,
        edits: {
            annotationPosition: true,
            annotationText: false,
            axisTitleText: false,
            colorbarPosition: false,
            colorbarTitleText: false,
            legendPosition: false,
            legendText: false,
            shapePosition: true,
            titleText: false
        }
    };

    Plotly.newPlot(plotArea, traces, layout, config);

    // Update Analysis Target Dropdown
    const analysisSelect = document.getElementById('analysis-target-series');
    if (analysisSelect) {
        analysisSelect.innerHTML = traces.map((t, idx) => `<option value="${idx}">${t.name}</option>`).join('');
    }

    // --- Click to Pin Feature ---
    plotArea.on('plotly_click', function (data) {
        if (!data.points || data.points.length === 0) return;
        const pt = data.points[0];
        const cd = pt.customdata;
        if (!cd) return;

        const text = `<b>${cd.meshId}</b><br>${cd.xLabel}:${pt.x}<br>${cd.yLabel}:${pt.y}`;

        const newAnnotation = {
            x: pt.x,
            y: pt.y,
            text: text,
            showarrow: true,
            arrowhead: 2,
            ax: 0,
            ay: -40,
            bgcolor: 'rgba(255, 255, 255, 0.9)',
            bordercolor: '#2563eb',
            borderwidth: 1,
            borderpad: 4,
            font: { size: 12, color: '#1e293b' },
            captureevents: true // Make it clickable to remove
        };

        // Add the annotation
        const currentAnnotations = plotArea.layout.annotations || [];
        // Check if already exists (optional, but good for UX)
        const exists = currentAnnotations.some(ann => ann.x === pt.x && ann.y === pt.y && ann.text === text);
        if (exists) return;

        Plotly.relayout(plotArea, {
            annotations: [...currentAnnotations, newAnnotation]
        });
    });

    // Click annotation to remove it
    plotArea.on('plotly_clickannotation', function (data) {
        const currentAnnotations = plotArea.layout.annotations || [];
        const index = currentAnnotations.indexOf(data.annotation);
        if (index !== -1) {
            currentAnnotations.splice(index, 1);
            Plotly.relayout(plotArea, { annotations: currentAnnotations });
        }
    });

    // Re-init interactions for new window
    import('./interaction.js').then(m => m.initInteractions());
}

export function addShape(type) {
    const canvas = document.getElementById('canvas-area');
    const graphs = canvas.querySelectorAll('.plot-content');
    if (graphs.length === 0) {
        alert("まずグラフを描画してください");
        return;
    }

    // Add to the last created graph (or we could track "active" one)
    const plotArea = graphs[graphs.length - 1];

    // Get current axis ranges to place shape in center
    const xRange = plotArea.layout.xaxis.range;
    const yRange = plotArea.layout.yaxis.range;
    const xCenter = (xRange[0] + xRange[1]) / 2;
    const yCenter = (yRange[0] + yRange[1]) / 2;
    const xSize = (xRange[1] - xRange[0]) * 0.2;
    const ySize = (yRange[1] - yRange[0]) * 0.2;

    // Get custom color
    const color = document.getElementById('shape-color')?.value || '#ef4444';
    // Convert hex to rgba for transparency
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const fillcolor = `rgba(${r}, ${g}, ${b}, 0.2)`;

    const newShape = {
        type: type === 'rect' ? 'rect' : 'circle',
        xref: 'x',
        yref: 'y',
        x0: xCenter - xSize,
        y0: yCenter - ySize,
        x1: xCenter + xSize,
        y1: yCenter + ySize,
        line: {
            color: color,
            width: 2
        },
        fillcolor: fillcolor
    };

    const currentShapes = plotArea.layout.shapes || [];
    Plotly.relayout(plotArea, {
        shapes: [...currentShapes, newShape]
    });
}

export function clearShapes() {
    const canvas = document.getElementById('canvas-area');
    const graphs = canvas.querySelectorAll('.plot-content');
    if (graphs.length === 0) return;

    // Clear shapes from the last created graph
    const plotArea = graphs[graphs.length - 1];
    Plotly.relayout(plotArea, { shapes: [] });
}

export function addTrendline() {
    const canvas = document.getElementById('canvas-area');
    const graphs = canvas.querySelectorAll('.plot-content');
    if (graphs.length === 0) {
        alert("まずグラフを描画してください");
        return;
    }

    const plotArea = graphs[graphs.length - 1];
    const data = plotArea.data;
    if (!data || data.length === 0) return;

    // Get selected series index
    const targetIdx = parseInt(document.getElementById('analysis-target-series')?.value || 0);
    const trace = data[targetIdx] || data[0];
    const xRaw = trace.x;
    const yRaw = trace.y;

    // Filter out non-numeric values
    const pairs = [];
    for (let i = 0; i < xRaw.length; i++) {
        const x = parseFloat(xRaw[i]);
        const y = parseFloat(yRaw[i]);
        if (!isNaN(x) && !isNaN(y)) {
            pairs.push({ x, y });
        }
    }

    if (pairs.length < 2) {
        alert("近似線の計算には少なくとも2点の数値データが必要です");
        return;
    }

    // Linear Regression (Least Squares Method)
    const n = pairs.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    pairs.forEach(p => {
        sumX += p.x;
        sumY += p.y;
        sumXY += p.x * p.y;
        sumX2 += p.x * p.x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Generate trendline points spanning the X range
    const xMin = Math.min(...pairs.map(p => p.x));
    const xMax = Math.max(...pairs.map(p => p.x));
    const trendX = [xMin, xMax];
    const trendY = [slope * xMin + intercept, slope * xMax + intercept];

    const color = document.getElementById('shape-color')?.value || '#ef4444';

    const trendTrace = {
        x: trendX,
        y: trendY,
        mode: 'lines',
        name: `近似線 (${trace.name})`,
        line: { color: color, width: 2, dash: 'dash' },
        hoverinfo: 'name'
    };

    // Store for prediction
    state.lastTrendline = {
        slope,
        intercept,
        xLabel: trace.customdata?.[0]?.xLabel || "X",
        yLabel: trace.customdata?.[0]?.yLabel || "Y",
        plotArea: plotArea
    };

    // Show prediction panel
    document.getElementById('prediction-wrapper').classList.remove('hidden');

    Plotly.addTraces(plotArea, trendTrace);
}

export function predictY() {
    if (!state.lastTrendline) {
        alert("まず近似線を作成してください");
        return;
    }

    const input = document.getElementById('predict-x-input');
    const xVal = parseFloat(input.value);
    if (isNaN(xVal)) {
        alert("有効な数値を入力してください");
        return;
    }

    const { slope, intercept, xLabel, yLabel, plotArea } = state.lastTrendline;
    const yVal = slope * xVal + intercept;

    const color = document.getElementById('shape-color')?.value || '#ef4444';

    const predictionTrace = {
        x: [xVal],
        y: [yVal],
        mode: 'markers',
        name: `予測値 (${xVal})`,
        marker: {
            size: 14,
            color: color,
            symbol: 'star',
            line: { color: '#fff', width: 2 }
        },
        hovertemplate: `<b>予測結果</b><br>${xLabel}: ${xVal}<br>${yLabel}: ${yVal.toFixed(2)}<extra></extra>`
    };

    // Add as annotation for persistence
    const newAnnotation = {
        x: xVal,
        y: yVal,
        text: `<b>予測値</b><br>${xLabel}:${xVal}<br>${yLabel}:${yVal.toFixed(2)}`,
        showarrow: true,
        arrowhead: 2,
        ax: 40,
        ay: -40,
        bgcolor: 'rgba(255, 255, 255, 0.95)',
        bordercolor: color,
        borderwidth: 2,
        font: { size: 12, color: '#1e293b' },
        captureevents: true
    };

    const currentAnnotations = plotArea.layout.annotations || [];
    Plotly.relayout(plotArea, {
        annotations: [...currentAnnotations, newAnnotation]
    });

    Plotly.addTraces(plotArea, predictionTrace);
}

export function addAverageLine() {
    const canvas = document.getElementById('canvas-area');
    const graphs = canvas.querySelectorAll('.plot-content');
    if (graphs.length === 0) {
        alert("まずグラフを描画してください");
        return;
    }

    const plotArea = graphs[graphs.length - 1];
    const data = plotArea.data;
    if (!data || data.length === 0) return;

    // Use the first series for calculation
    const targetIdx = parseInt(document.getElementById('analysis-target-series')?.value || 0);
    const trace = data[targetIdx] || data[0];
    const xRaw = trace.x;
    const yRaw = trace.y;

    const pairs = [];
    for (let i = 0; i < xRaw.length; i++) {
        const x = parseFloat(xRaw[i]);
        const y = parseFloat(yRaw[i]);
        if (!isNaN(x) && !isNaN(y)) pairs.push({ x, y });
    }

    if (pairs.length === 0) {
        alert("数値データが見つかりません");
        return;
    }

    const yNums = pairs.map(p => p.y);
    const sum = yNums.reduce((a, b) => a + b, 0);
    const avg = sum / yNums.length;

    const color = document.getElementById('shape-color')?.value || '#ef4444';

    const xMin = Math.min(...pairs.map(p => p.x));
    const xMax = Math.max(...pairs.map(p => p.x));

    const avgTrace = {
        x: [xMin, xMax],
        y: [avg, avg],
        mode: 'lines',
        name: `平均線 (${trace.name})`,
        line: { color: color, width: 2, dash: 'dashdot' },
        hoverinfo: 'name'
    };

    const annotation = {
        x: xMax,
        y: avg,
        text: `平均: ${avg.toFixed(2)}`,
        showarrow: false,
        xanchor: 'right',
        yanchor: 'bottom',
        font: { color: color, size: 12, weight: 'bold' },
        bgcolor: 'rgba(255, 255, 255, 0.8)'
    };

    const currentAnnotations = plotArea.layout.annotations || [];
    Plotly.relayout(plotArea, {
        annotations: [...currentAnnotations, annotation]
    });

    Plotly.addTraces(plotArea, avgTrace);
}
