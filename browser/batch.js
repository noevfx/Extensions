/* Janela independente: a fila vive no app local, não nesta aba. */
(async function () {
  "use strict";
  const seedId = new URL(location.href).searchParams.get("seed");
  const seedKey = "collection_seed_" + seedId;
  let seed = {};
  if (seedId) {
    const stored = await chrome.storage.session.get(seedKey);
    seed = stored[seedKey] || {};
    await chrome.storage.session.remove(seedKey);
  }
  const state = await chrome.storage.local.get("collection_batch");
  const api = (method,path,body) => new Promise(resolve => {
    chrome.runtime.sendMessage({type:"COLLECTION_API",method,path,body:body||{}},r=>{void chrome.runtime.lastError;resolve(r||{ok:false,data:{error:"O app local não respondeu. Confira se está atualizado e em execução."}});});
  });
  NVFCollection.mount(document.getElementById("collection"),{
    api,editors:globalThis.NVF_EDITION!=="basic"&&/Windows|Macintosh|Mac OS X/i.test(navigator.userAgent),
    url:seed.url,items:seed.items,media:seed.media,quality:seed.quality,
    batchId:state.collection_batch,
    saveBatch:id=>chrome.storage.local.set({collection_batch:id})
  });
})();
