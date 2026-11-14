"use strict";
const tutorialFrame = document.querySelector('.tutorial-web-frame');
window.addEventListener('message', event => {
  if (!tutorialFrame || event.origin !== location.origin || event.source !== tutorialFrame.contentWindow) return;
  const data = event.data;
  if (!data || data.type !== 'nvf-demo-send' || !['premiere','aftereffects'].includes(data.app)) return;
  const after = data.app === 'aftereffects';
  document.querySelector('[data-tutorial-badge]').textContent = after ? 'Ae' : 'Pr';
  document.querySelector('[data-tutorial-app]').textContent = after ? 'After Effects' : 'Premiere Pro';
  document.querySelector('.tutorial-import-state').textContent = '✓ Exemplo de resultado: referência importada no ' + (after ? 'After Effects' : 'Premiere Pro');
});
