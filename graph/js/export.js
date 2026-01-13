
export async function exportToPPTX() {
    const activeGraphs = document.querySelectorAll('.canvas-area .graph-wrapper:not(.hidden)');
    if (activeGraphs.length === 0) {
        alert("グラフが描画されていません");
        return;
    }

    const downloadBtn = document.getElementById('download-pptx');
    const originalText = downloadBtn.innerHTML;

    try {
        downloadBtn.textContent = '生成中...';
        downloadBtn.disabled = true;

        let pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_16x9';

        for (const graph of activeGraphs) {
            const plotArea = graph.querySelector('.plot-content');
            if (!plotArea || !plotArea.data) continue;

            const imgData = await Plotly.toImage(plotArea, { format: 'png', width: 800, height: 500 });
            let slide = pptx.addSlide();

            let titleText = (plotArea.layout && plotArea.layout.title) ? plotArea.layout.title.text : 'Graph';
            slide.addText(titleText, { x: 0.5, y: 0.5, fontSize: 24, fontFace: 'Arial', color: '363636' });
            slide.addImage({ data: imgData, x: 1, y: 1.5, w: 8, h: 5 });

            const date = new Date().toLocaleDateString('ja-JP');
            slide.addText(`Exported on ${date}`, { x: 0.5, y: 6.8, fontSize: 10, color: '888888' });
        }

        await pptx.writeFile({ fileName: `Graphs_Export_${Date.now()}.pptx` });
    } catch (error) {
        console.error("PPTX Error:", error);
        alert("PPTXの作成に失敗しました");
    } finally {
        downloadBtn.innerHTML = originalText;
        downloadBtn.disabled = false;
    }
}
