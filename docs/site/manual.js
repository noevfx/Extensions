"use strict";
document.querySelectorAll('[data-app]').forEach(button=>button.addEventListener('click',()=>{
 const after=button.dataset.app==='after';
 document.querySelectorAll('[data-app]').forEach(other=>{const selected=other===button;other.classList.toggle('selected',selected);other.setAttribute('aria-pressed',String(selected));});
 document.querySelectorAll('[data-appname]').forEach(el=>el.textContent=after?'After Effects':'Premiere Pro');
 document.querySelectorAll('[data-project]').forEach(el=>el.textContent='Filme de marca.'+(after?'aep':'prproj'));
 document.querySelectorAll('[data-container]').forEach(el=>el.textContent=after?'na pasta':'no bin');
 const frame=document.querySelector('.adobe-real');if(frame)frame.src='assets/adobe-demo.html?mode=video&target='+(after?'aftereffects':'premiere');
}));
