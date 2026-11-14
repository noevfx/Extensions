/* Somente demos de mesma origem podem ajustar o próprio espaço no manual. */
window.addEventListener("message",event=>{
  if(event.origin!==location.origin||!event.data||event.data.type!=="nvf-demo-height")return;
  const height=Number(event.data.height);
  if(!Number.isFinite(height)||height<100||height>5000)return;
  for(const frame of document.querySelectorAll("iframe"))if(frame.contentWindow===event.source)frame.style.height=Math.ceil(height)+2+"px";
});
