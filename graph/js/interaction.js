
export function initInteractions() {
    // We use a CSS class to ensure we don't re-init already initialized elements
    const elements = document.querySelectorAll('.graph-wrapper:not(.hidden):not(.interact-init)');

    elements.forEach(el => {
        el.classList.add('interact-init');

        interact(el)
            .draggable({
                inertia: true,
                modifiers: [interact.modifiers.restrictRect({ restriction: 'parent', endOnly: true })],
                autoScroll: true,
                allowFrom: '.graph-header-handle',
                listeners: { move: dragMoveListener }
            })
            .resizable({
                edges: { left: true, right: true, bottom: true, top: true },
                listeners: {
                    move: function (event) {
                        let { x, y } = event.target.dataset;
                        x = (parseFloat(x) || 0) + event.deltaRect.left;
                        y = (parseFloat(y) || 0) + event.deltaRect.top;
                        Object.assign(event.target.style, {
                            width: `${event.rect.width}px`,
                            height: `${event.rect.height}px`,
                            transform: `translate(${x}px, ${y}px)`
                        });
                        Object.assign(event.target.dataset, { x, y });

                        // Dynamically target the plot container INSIDE this window
                        const plotArea = event.target.querySelector('.plot-content');
                        if (plotArea && plotArea.data) {
                            Plotly.Plots.resize(plotArea);
                        }
                    }
                },
                modifiers: [
                    interact.modifiers.restrictEdges({ outer: 'parent' }),
                    interact.modifiers.restrictSize({ min: { width: 300, height: 200 } })
                ],
                inertia: true
            });
    });
}

function dragMoveListener(event) {
    var target = event.target;
    var x = (parseFloat(target.dataset.x) || 0) + event.dx;
    var y = (parseFloat(target.dataset.y) || 0) + event.dy;
    target.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    target.dataset.x = x;
    target.dataset.y = y;
}
