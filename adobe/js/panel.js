/* Mesmo seletor do navegador, com destino fixo no projeto Adobe. */
(function () {
  "use strict";
  const NVF=window.NVF;
  const info=document.getElementById("info");
  const app=document.getElementById("app");
  async function refreshProject(){
    const r=await NVF.api("GET","/adobe/project?app="+NVF.APP);
    app.textContent=r.ok?"App local: online":"App local: sem conexão";
    info.className="info "+(r.ok&&r.data.status==="ok"?"ok":"warn");
    info.textContent=r.ok&&r.data.status==="ok"?"Projeto: "+String(r.data.project).split(/[\\/]/).pop()+" · arquivos em _Noe VFX Downloader":r.data&&r.data.message||"Abra e salve o projeto. Confira se o app local está atualizado e em execução.";
  }
  NVFCollection.mount(document.getElementById("collection"),{
    api:NVF.api,editors:true,target:NVF.APP,
    viewMode:localStorage.getItem("nvf_panel_view_"+NVF.APP)||"compact",
    saveViewMode:mode=>localStorage.setItem("nvf_panel_view_"+NVF.APP,mode),
    onViewMode:mode=>document.body.classList.toggle("panel-compact",mode==="compact"),
    batchId:localStorage.getItem("nvf_batch_"+NVF.APP)||"",
    saveBatch:id=>localStorage.setItem("nvf_batch_"+NVF.APP,id)
  });
  refreshProject();setInterval(refreshProject,5000);
  setInterval(()=>NVF.tick(),3000);
})();
