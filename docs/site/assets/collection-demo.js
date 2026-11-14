/* Dados locais do manual. Não acessa o app, contas ou plataformas. */
(function(){
  "use strict";
  const params=new URLSearchParams(location.search);
  const adobe=document.body.dataset.adobe==="true";
  const target=adobe?(params.get("target")==="aftereffects"?"aftereffects":"premiere"):"";
  const names=["Luz da manhã","Cidade em movimento","Entre uma cena e outra","Horizonte aberto","Último take","Vídeo indisponível"];
  const api=async(method,path,body)=>{
    if(path==="/config")return{ok:true,data:{output_dir:"Vídeos/NoeVFX",compat_h264:false}};
    if(path==="/inspect")return{ok:true,data:{title:"Trilhas para o próximo corte",items:names.map((title,i)=>({title,url:i===5?"":"https://www.youtube.com/watch?v=exemplo"+(i+1),available:i!==5}))}};
    if(path==="/batch"&&method==="POST")return{ok:false,data:{error:"Demonstração: seleção conferida. Nenhum download real foi iniciado."}};
    if(path==="/pick-folder")return{ok:true,data:{path:"Vídeos/Referências"}};
    return{ok:false,data:{error:"Esta é uma demonstração local do manual."}};
  };
  const links=params.get("sample")==="links";
  const mount=NVFCollection.mount(document.getElementById("collection"),{api,editors:params.get("edition")!=="basic",target,viewMode:params.get("view")==="full"?"full":"compact",onViewMode:mode=>document.body.classList.toggle("panel-compact",mode==="compact"),media:params.get("mode")==="audio"?"audio":adobe||params.get("mode")==="video"?"video":"audio",url:params.get("empty")==="1"||links?"":"https://www.youtube.com/playlist?list=exemplo"});
  if(links)mount.add("https://vimeo.com/111111111 https://vimeo.com/222222222 https://vimeo.com/333333333");
  document.querySelectorAll('[data-demo-target]').forEach(button=>button.addEventListener('click',()=>{location.search='?target='+button.dataset.demoTarget;}));
})();
