(()=>{
  const p=document.querySelector('.panel'),fab=document.querySelector('.demo-fab'),status=document.querySelector('.demo-status');
  fab.onclick=()=>{p.style.display=p.style.display==='none'?'block':'none';fab.setAttribute('aria-expanded',String(p.style.display!=='none'));};
  document.querySelectorAll('[data-target]').forEach(button=>button.onclick=()=>{parent.postMessage({type:'nvf-demo-send',app:button.dataset.target},location.origin);status.textContent='Exemplo: envio ao '+(button.dataset.target==='premiere'?'Premiere':'After Effects')+' · '+document.querySelector('[data-quality]').selectedOptions[0].textContent;});
  document.querySelector('[data-q]').onclick=()=>{status.textContent='Demonstração: baixar somente o vídeo atual. Nenhum download é iniciado.';};
  document.querySelector('[data-audio]').onclick=()=>{location.href='batch-demo.html?mode=audio';};
  document.querySelectorAll('.all-btn').forEach(button=>button.onclick=()=>{location.href='batch-demo.html?mode=video';});
})();
