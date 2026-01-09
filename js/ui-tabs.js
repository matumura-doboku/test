import { tabs, panels } from './dom.js';

export function initTabs() {
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((item) => {
        item.classList.remove('active');
        item.setAttribute('aria-selected', 'false');
      });
      panels.forEach((panel) => panel.classList.remove('active'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const target = tab.dataset.tab;
      const panel = document.querySelector(`[data-panel="${target}"]`);
      if (panel) panel.classList.add('active');
    });
  });
}
