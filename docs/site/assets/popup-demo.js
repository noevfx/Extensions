(function(){
  "use strict";
  if(globalThis.__nvfI18n)globalThis.__nvfI18n.applyStatic();
  const $=id=>document.getElementById(id);
  $("srv").textContent="Online";$("srv").classList.add("on");
  $("destPath").textContent="Vídeos/NoeVFX";$("urlInput").value="https://www.youtube.com/watch?v=referencia&list=exemplo";
  $("sendRow").hidden=false;$("edPill").hidden=false;$("playlistBtn").hidden=false;
  $("streams").innerHTML='<div class="empty">Referência de movimento · vídeo atual<br><small>Dados de exemplo do manual</small></div>';
  $("countPill").textContent="1";$("status").textContent="Demonstração · sem downloads";
  const open=audio=>{location.href="batch-demo.html?mode="+(audio?"audio":"video");};
  $("audioBtn").onclick=()=>open(true);$("playlistBtn").onclick=()=>open(false);$("batchBtn").onclick=()=>open(false);$("allBtn").onclick=()=>open(false);
  document.querySelectorAll('[data-target]').forEach(button=>button.onclick=()=>{$("status").textContent="Exemplo: envio ao "+(button.dataset.target==="premiere"?"Premiere":"After Effects");});
  document.querySelector('[data-q]').onclick=()=>{$("status").textContent="Exemplo: só o vídeo atual · "+$("quickQuality").selectedOptions[0].textContent;};
})();
