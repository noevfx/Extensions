/* Links e playlists: interface compartilhada pelo navegador e pelo painel Adobe.
   tools/build.py leva este mesmo arquivo ao pacote CEP. Sem dependências. */
(function (global) {
  "use strict";
  function extractLinks(text) {
    // Uma URL pode conter outra URL em um parâmetro: não dividir cegamente em todo "https".
    const values = String(text || "").match(/https?:\/\/[^\s<>"']+/gi) || [];
    return Array.from(new Set(values.map(s => s.replace(/[),.;\]}]+$/, "")).filter(s => {
      try { const u = new URL(s); return /https?:/.test(u.protocol) && !!u.hostname; } catch (_) { return false; }
    })));
  }
  function playlistUrl(value, includeWatch) {
    try {
      const u = new URL(value);
      if (/\.(m3u8|mpd|mp4|webm|mp3|m4a)$/i.test(u.pathname)) return "";
      if (/(^|\.)youtube\.com$/.test(u.hostname) && u.searchParams.has("list") && (includeWatch || u.pathname === "/playlist"))
        return "https://www.youtube.com/playlist?list=" + encodeURIComponent(u.searchParams.get("list"));
      return /\/(playlist|playlists|sets|showcase|album)\//i.test(u.pathname) ? value : "";
    } catch (_) { return ""; }
  }
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function mount(root, options) {
    const api = options.api;
    const forced = options.target || "";
    let entries = [], sources = [], batch = "", busy = false, submitting = false, last = "", config = {};
    let inspectionQueue = Promise.resolve();
    let revision = 0, polling = false, wasAdobe = false;
    const $ = id => root.querySelector('[data-c="' + id + '"]');
    root.classList.add("collection");
    root.innerHTML = `
      <div class="c-intro"><h2>Escolha o que baixar.</h2><p>Um vídeo, vários links ou uma playlist. Você decide o que vem.</p></div>
      <label class="c-label">Cole os links aqui<textarea data-c="links" rows="2" spellcheck="false" placeholder="Cole um link ou a lista inteira do seu documento"></textarea></label>
      <div class="c-input-actions"><span data-c="sourceCount" class="c-muted">Cada link colado vira um item separado.</span><button type="button" data-c="add" class="c-secondary">Adicionar links</button></div>
      <div data-c="sources" class="c-sources"></div>
      <div class="c-settings"><div><span class="c-label">Baixar como</span><div class="c-segment" role="group" aria-label="Tipo de mídia"><button type="button" data-c="video" aria-pressed="true">Vídeo</button><button type="button" data-c="audio" aria-pressed="false">Só áudio</button></div></div>
      <label class="c-label"><span data-c="formatLabel">Qualidade do vídeo</span><select data-c="format"></select></label></div>
      <div data-c="audioHint" class="c-muted" hidden>MP3 é uma escolha prática para música. WAV e FLAC não recuperam qualidade perdida no original.</div>
      <div class="c-selection-head"><b data-c="heading">Sua seleção</b><span data-c="count" class="c-muted" aria-live="polite">Nenhum item</span></div>
      <div class="c-selection-tools"><label><input type="checkbox" data-c="all"> Selecionar todos</label><button type="button" data-c="clear" class="c-link">Limpar seleção</button></div>
      <div data-c="entries" class="c-entries"></div>
      <div data-c="destination"><label class="c-label">Enviar para<select data-c="dest"><option value="default">Minha pasta de downloads</option><option value="custom">Escolher outra pasta…</option>${options.editors ? '<option value="premiere">Premiere Pro · projeto aberto</option><option value="aftereffects">After Effects · projeto aberto</option>' : ""}</select></label></div>
      <div class="c-muted" data-c="destInfo"></div><button data-c="pick" class="c-secondary" type="button" hidden>Escolher pasta…</button>
      <label data-c="compatRow" class="c-muted"><input data-c="compat" type="checkbox"> Preparar vídeo em H.264 quando necessário</label>
      <div data-c="message" role="status" aria-live="polite" class="c-message"></div>
      <button type="button" class="c-go" data-c="go" disabled>Adicione os links para continuar</button>
      <div class="c-run-head"><b>Andamento</b><button type="button" class="c-link" data-c="cancel" hidden>Cancelar lista</button></div><div data-c="progress" class="c-progress"></div>`;
    let media = options.media === "audio" ? "audio" : "video", customDir = "";
    if (forced) $("destination").hidden = true;
    $("compatRow").hidden = !options.editors;
    const target = () => forced || $("dest").value;
    function message(text, error) { $("message").textContent = text || ""; $("message").classList.toggle("c-error", !!error); }
    function formats() {
      const previous = $("format").value;
      const audio = media === "audio";
      const adobe = /^(premiere|aftereffects)$/.test(target());
      const values = audio ? [["mp3","MP3 · Mais compatível"],["m4a","M4A · Áudio AAC"],["wav","WAV"],...(!adobe ? [["flac","FLAC"],["opus","Opus"]] : [])] : [["best","Nativa · Máxima disponível"],["1080","1080p · Full HD"],["720","720p · HD"]];
      $("format").innerHTML = values.map(([v,label]) => '<option value="'+v+'">'+label+'</option>').join("");
      if (values.some(v => v[0] === previous)) $("format").value = previous;
      else if (!audio && ["best","1080","720"].includes(options.quality)) $("format").value = options.quality;
      $("formatLabel").textContent = audio ? "Formato do áudio" : "Qualidade do vídeo";
      $("audioHint").hidden = !audio;
      $("video").setAttribute("aria-pressed", String(!audio)); $("audio").setAttribute("aria-pressed", String(audio));
      $("compatRow").hidden = !options.editors || audio;
      summary();
    }
    function summary() {
      const selected = entries.filter(it => it.selected && it.available !== false);
      const available = entries.filter(it => it.available !== false);
      $("count").textContent = selected.length + " de " + entries.length + " selecionados";
      $("all").checked = available.length > 0 && selected.length === available.length;
      $("all").indeterminate = selected.length > 0 && selected.length < available.length;
      $("go").disabled = busy || submitting || !selected.length;
      const count = selected.length, audio = media === "audio", importing = /^(premiere|aftereffects)$/.test(target());
      const format = $("format").value;
      $("go").textContent = submitting ? "Enviando a lista…" : busy ? "Lendo a playlist…" : !count ? "Selecione pelo menos um item" :
        (importing ? "Baixar e importar " : "Baixar ") + count + " " + (audio ? (count === 1 ? "áudio" : "áudios") : (count === 1 ? "vídeo" : "vídeos")) +
        (audio ? " em " + format.toUpperCase() : format === "best" ? " na qualidade nativa" : " em " + format + "p");
    }
    function render() {
      if (!entries.some(it => it.collectionSource)) $("heading").textContent = "Sua seleção";
      $("entries").innerHTML = entries.map((it, index) => '<label class="c-entry '+(it.available === false ? 'c-unavailable' : '')+'"><input type="checkbox" data-index="'+index+'" '+(it.selected ? 'checked ' : '')+(it.available === false ? 'disabled' : '')+'><span class="c-number">'+String(index+1).padStart(2,"0")+'</span><span class="c-entry-copy"><b>'+esc(it.title && it.title !== it.url ? it.title : it.available === false ? "Item indisponível" : "Vídeo do link " + (index + 1))+'</b><small>'+esc(it.available === false ? "Indisponível · privado, removido ou sem acesso" : it.url)+'</small></span></label>').join("");
      $("sources").innerHTML = sources.map((url,index) => '<div class="c-source"><span>'+esc(url)+'</span><button type="button" data-remove="'+index+'" aria-label="Remover link '+(index+1)+'">×</button>'+(playlistUrl(url,true) ? '<button type="button" data-playlist="'+index+'" class="c-link">'+(playlistUrl(url,false) ? 'Ler playlist' : 'Ver playlist deste vídeo')+'</button>' : '')+'</div>').join("");
      $("sourceCount").textContent = sources.length + (sources.length === 1 ? " link identificado" : " links identificados");
      summary();
    }
    async function inspect(url) {
      if (busy) { message("Aguarde a leitura atual terminar."); return; }
      busy = true; const current = revision; summary(); message("Lendo títulos e itens da playlist. Nenhum download foi iniciado.");
      try {
        const r = await api("POST", "/inspect", {url, referer:url});
        if (current !== revision) return;
        if (!r.ok) throw new Error(r.data && r.data.error || "Não consegui ler a playlist. Tente novamente.");
        const retained = entries.filter(it => it.url !== url && playlistUrl(it.url,true) !== url && it.collectionSource !== url);
        const incoming = r.data.items || [];
        if (retained.length + incoming.length > 500) throw new Error("Esta seleção ultrapassa 500 itens. Remova uma lista ou baixe em partes.");
        entries = retained;
        incoming.forEach(it => entries.push(Object.assign({},it,{selected:it.available !== false, collectionSource:url})));
        $("heading").textContent = r.data.title || "Playlist";
        message(r.data.truncated ? "Esta leitura mostra os primeiros " + r.data.limit + " itens. Divida a playlist para acessar os demais." : "Playlist pronta. Marque o que quer baixar.");
      } catch (error) { message(error.message,true); }
      finally { busy = false; render(); }
    }
    async function add(text) {
      const urls = extractLinks(text); $("links").value = ""; message("");
      const fresh = urls.filter(url => !sources.includes(url));
      if (!urls.length) { message("Cole um endereço completo começando com http:// ou https://.",true); return; }
      if (sources.length + fresh.length > 500) { message("Adicione no máximo 500 links por lista.",true); return; }
      for (const url of fresh) { sources.push(url); if (!playlistUrl(url,false)) entries.push({url,title:url,available:true,selected:true}); }
      render();
      // Serializa leituras de várias playlists coladas juntas.
      for (const url of fresh.filter(url => playlistUrl(url,false))) {
        inspectionQueue = inspectionQueue.then(() => inspect(playlistUrl(url,false)));
      }
      await inspectionQueue;
    }
    async function destination() {
      const d = target(); $("pick").hidden = d !== "custom";
      $("destInfo").textContent = /^(premiere|aftereffects)$/.test(d) ? "O projeto precisa estar aberto e salvo. Os arquivos entram em _Noe VFX Downloader." : d === "custom" ? customDir || "Escolha a pasta antes de começar." : config.output_dir || "Pasta configurada no app local";
      $("compat").disabled = /^(premiere|aftereffects)$/.test(d);
      if ($("compat").disabled) $("compat").checked = true;
      else if (wasAdobe) $("compat").checked = config.compat_h264 === true;
      wasAdobe = $("compat").disabled;
      formats();
    }
    async function poll() {
      if (!batch || polling) return;
      polling = true;
      try {
      const r = await api("GET", "/batch?id="+encodeURIComponent(batch));
      if (!r.ok) {
        if (r.status === 404) { batch=""; if(options.saveBatch)options.saveBatch(""); }
        message(r.data && r.data.error || "Sem conexão com o app local. Tentando novamente…",true); return;
      }
      $("cancel").hidden = !!r.data.finished;
      $("progress").innerHTML = (r.data.items || []).map(it => {
        const state = it.status === "pending" ? "Aguardando vaga na fila" : it.status === "queued" ? "Na fila" : it.status === "canceled" ? "Cancelado" : it.status === "error" ? it.error || "Falha no download" : it.status === "done" ? it.import_error ? "Baixado, mas não importou: "+it.import_error : it.import_app ? it.imported ? "Importado no projeto" : "Baixado · aguardando importação no editor" : "Concluído" : it.progress || "Baixando…";
        return '<div class="c-result '+(it.status === "error" || it.import_error ? 'c-error' : '')+'"><b>'+esc(it.title || it.url)+'</b><span>'+esc(state)+'</span></div>';
      }).join("");
      if (r.data.finished && !(r.data.items || []).some(it=>it.status==="done" && it.import_app && !it.imported)) batch="";
      } finally { polling = false; }
    }
    $("links").addEventListener("paste", event => { const text = event.clipboardData && event.clipboardData.getData("text"); if (text && extractLinks(text).length) { event.preventDefault(); add(text); } });
    $("links").addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); add(event.target.value); } });
    $("add").addEventListener("click",()=>add($("links").value));
    $("sources").addEventListener("click",event=>{const remove=event.target.closest('[data-remove]'),read=event.target.closest('[data-playlist]');if(remove){revision++;const url=sources.splice(Number(remove.dataset.remove),1)[0];entries=entries.filter(it=>it.url!==url&&it.collectionSource!==playlistUrl(url,true));render();}if(read)inspect(playlistUrl(sources[Number(read.dataset.playlist)],true));});
    $("entries").addEventListener("change",event=>{if(event.target.dataset.index!==undefined){entries[Number(event.target.dataset.index)].selected=event.target.checked;summary();}});
    $("all").addEventListener("change",()=>{entries.forEach(it=>it.selected=it.available!==false&&$("all").checked);render();});
    $("clear").addEventListener("click",()=>{entries.forEach(it=>it.selected=false);render();});
    $("video").addEventListener("click",()=>{media="video";formats();});$("audio").addEventListener("click",()=>{media="audio";formats();});
    $("format").addEventListener("change",summary);$("dest").addEventListener("change",destination);
    $("pick").addEventListener("click",async()=>{const r=await api("POST","/pick-folder",{});if(r.ok&&r.data.path){customDir=r.data.path;destination();}});
    $("go").addEventListener("click",async()=>{
      if ($("links").value.trim()) { await add($("links").value); return; }
      const selected=entries.filter(it=>it.selected&&it.available!==false);if(!selected.length||busy||submitting)return;
      if(target()==="custom"&&!customDir){message("Escolha a pasta de destino.",true);return;}
      submitting=true;summary();
      try {const r=await api("POST","/batch",{items:selected.map(it=>({url:it.url,title:it.title,fallbackStream:it.fallbackStream,referer:it.referer})),quality:media==="audio"?"audio":$("format").value,audio_format:media==="audio"?$("format").value:"m4a",target:/^(premiere|aftereffects)$/.test(target())?target():"",outDir:target()==="custom"?customDir:"",compat:$("compat").checked});
        if(!r.ok)throw new Error(r.data&&r.data.error||"Não consegui iniciar. Confira se o app local está atualizado.");
        batch=r.data.batch_id;last=batch;if(options.saveBatch)options.saveBatch(batch);message("Lista enviada. Você pode fechar esta janela; o app local continua os downloads.");await poll();
      } catch(error){message(error.message,true);} finally{submitting=false;summary();}
    });
    $("cancel").addEventListener("click",async()=>{await api("POST","/batch/cancel",{id:batch});poll();});
    if(options.batchId){batch=options.batchId;poll();}
    if(options.items){entries=options.items.map(it=>Object.assign({available:true,selected:true},it));render();}
    if(options.url)add(options.url);
    api("GET","/config").then(r=>{if(!r.ok){message(r.data&&r.data.error||"O app local não respondeu. Confira se está atualizado e em execução.",true);return;}config=r.data||{};$("compat").checked=config.compat_h264===true;destination();});
    formats();render();
    const timer=setInterval(poll,2000);
    return {add,inspect,destroy:()=>clearInterval(timer),getEntries:()=>entries,getBatch:()=>last};
  }
  global.NVFCollection = {extractLinks,playlistUrl,mount};
  if(typeof module!=="undefined"&&module.exports)module.exports=global.NVFCollection;
})(typeof window!=="undefined"?window:globalThis);
