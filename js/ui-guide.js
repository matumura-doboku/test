import { guideOverlay, guideBody, guideOpenBtn, guideCloseBtn } from './dom.js';

export function initGuide() {
  guideOpenBtn.addEventListener('click', async () => {
    guideOverlay.classList.remove('hidden');
    guideOverlay.setAttribute('aria-hidden', 'false');
    try {
      const res = await fetch('docs/guide.html');
      if (!res.ok) throw new Error('guide missing');
      const html = await res.text();
      guideBody.innerHTML = html;
    } catch (err) {
      guideBody.textContent = 'ガイドの読み込みに失敗しました。';
      console.error(err);
    }
  });

  guideCloseBtn.addEventListener('click', () => {
    guideOverlay.classList.add('hidden');
    guideOverlay.setAttribute('aria-hidden', 'true');
  });

  guideOverlay.addEventListener('click', (event) => {
    if (event.target === guideOverlay) {
      guideOverlay.classList.add('hidden');
      guideOverlay.setAttribute('aria-hidden', 'true');
    }
  });
}
