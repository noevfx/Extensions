"use strict";
document.querySelectorAll('[data-app]').forEach(button => button.addEventListener('click', () => {
  const after = button.dataset.app === 'after';
  document.querySelectorAll('[data-app]').forEach(b => {
    const selected = b === button;
    b.classList.toggle('selected', selected);
    b.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[data-appname]').forEach(el => el.textContent = after ? 'After Effects' : 'Premiere Pro');
  document.querySelectorAll('[data-project]').forEach(el => el.textContent = 'Filme de marca.' + (after ? 'aep' : 'prproj'));
  document.querySelector('[data-container]').textContent = after ? 'na pasta' : 'no bin';
  document.querySelector('[data-created]').textContent = after ? 'a pasta' : 'o bin';
  document.querySelector('[data-projectdir]').textContent = after ? 'After Effects' : 'Premiere';
  const panelDocument = document.querySelector('.adobe-real').contentDocument;
  if (panelDocument) {
    panelDocument.querySelector('#info').innerHTML = 'Projeto: <b>Filme de marca.' + (after ? 'aep' : 'prproj') + '</b><br>Pasta: Filme de marca/_Noe VFX Downloader';
    panelDocument.querySelector('#app').textContent = (after ? 'After Effects' : 'Premiere Pro') + ' · exemplo';
  }
}));
