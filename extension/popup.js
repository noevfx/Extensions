/* ============================================================================
   Noe VFX Downloader — Popup v3.0
   ========================================================================== */
"use strict";

const $ = (id) => document.getElementById(id);
const srv = $("srv");
const urlInput = $("urlInput");
const streamsEl = $("streams");
const statusEl = $("status");
const themeBtn = $("themeBtn");
const refreshBtn = $("refreshBtn");
const settingsBtn = $("settingsBtn");
const destPath = $("destPath");
const setupBox = $("setup");
const setupBtn = $("setupBtn");
const openFolderBtn = $("openFolderBtn");
const changeFolderBtn = $("changeFolderBtn");
const allBtn = $("allBtn");
const countPill = $("countPill");
const fabBtn = $("fabBtn");
const verEl = $("ver");

let currentTab = null;
let streams = [];
let cfg = null;
let serverOnline = false;

const RANK = { "HLS": 5, "DASH": 4, "MP4": 3, "WebM": 2, "Áudio": 1, "HTML5": 3, "Rede": 3, "Embed": 4, "YouTube": 6, "Globo/G1": 6 };

const send = (msg) =>
  new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false }));
    } catch (_) {
      resolve({ ok: false });
    }
  });

/* ---------------------------------------------------------------- tema ---- */
if (verEl) verEl.textContent = "v" + chrome.runtime.getManifest().version;

chrome.storage.local.get(["theme"], (res) => {
  document.documentElement.setAttribute("data-theme", (res && res.theme) || "dark");
});
themeBtn.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", cur);
  chrome.storage.local.set({ theme: cur });
});

/* ------------------------------------------------------------ configuração - */
function prettyFolder(p) {
  if (!p) return "Downloads/NoeVFX";
  const parts = String(p).split(/[\\/]+/).filter(Boolean);
  return parts.slice(-2).join("/") || p;
}

function applyConfig(c) {
  if (!c) return;
  cfg = c;
  destPath.textContent = prettyFolder(c.output_dir);
  destPath.title = c.output_dir || "";
  setupBox.classList.toggle("show", !c.onboarded);
  const on = c.fab_enabled !== false;
  fabBtn.classList.toggle("on", on);
  fabBtn.classList.toggle("off", !on);
  fabBtn.title = on ? "Ícone sobre os vídeos: ativado (clique para desligar)" : "Ícone sobre os vídeos: desativado (clique para ligar)";
}

async function loadConfig(force) {
  const r = await send({ type: "GET_CONFIG", force: !!force });
  if (r && r.config) applyConfig(r.config);
  return r;
}

/* ---------------------------------------------------------------- server -- */
async function checkHealth() {
  const r = await send({ type: "HEALTH" });
  serverOnline = !!(r && r.ok);
  srv.textContent = serverOnline ? "Online" : "Offline";
  srv.classList.toggle("on", serverOnline);
  srv.classList.toggle("off", !serverOnline);
  if (!serverOnline) {
    statusEl.textContent = "Servidor local offline — rode o instalador (windows/mac/linux)";
  }
  return serverOnline;
}

/* --------------------------------------------------------------- streams -- */
function groupize(list) {
  const map = new Map();
  for (const it of list) {
    const k = it.group || it.url;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  return [...map.entries()].map(([key, arr]) => {
    arr.sort((a, b) => (RANK[b.kind] || 0) - (RANK[a.kind] || 0));
    return { key, best: arr[0], count: arr.length };
  });
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (_) { return url.slice(0, 40); }
}

function shortPath(url) {
  try {
    const u = new URL(url);
    const q = u.search ? u.search.slice(0, 18) : "";
    return (u.pathname.length > 28 ? "…" + u.pathname.slice(-28) : u.pathname) + q;
  } catch (_) {
    return url.slice(0, 42);
  }
}

const thumbCache = new Map();

function thumbNode(item) {
  const src = item.thumb || thumbCache.get(item.url) || "";
  if (src && /^(https?:|data:image)/i.test(src)) {
    const img = document.createElement("img");
    img.className = "thumb";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = src;
    img.addEventListener("error", () => {
      img.replaceWith(placeholder(item.kind));
    });
    return img;
  }
  return placeholder(item.kind);
}

function placeholder(kind) {
  const d = document.createElement("div");
  d.className = "thumb-ph";
  d.textContent = (kind || "VIDEO").toUpperCase().slice(0, 6);
  return d;
}

function render() {
  const groups = groupize(streams);
  countPill.textContent = String(groups.length);
  streamsEl.textContent = "";

  if (!groups.length) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = "Nenhum stream capturado ainda. Dê play no vídeo e clique em ⟳.";
    streamsEl.appendChild(d);
    return;
  }

  const pending = [];

  groups.forEach((g) => {
    const row = document.createElement("div");
    row.className = "stream-item";

    const name = (g.best.title || "").trim() || hostOf(g.best.url);
    const meta = document.createElement("div");
    meta.className = "stream-meta";

    const n = document.createElement("div");
    n.className = "stream-name";
    n.textContent = name.slice(0, 70);
    n.title = name;

    const sub = document.createElement("div");
    sub.className = "stream-sub";
    const tag = document.createElement("span");
    tag.className = "stream-tag";
    tag.textContent = g.best.kind + (g.count > 1 ? ` +${g.count - 1}` : "");
    const u = document.createElement("span");
    u.className = "stream-url";
    u.textContent = shortPath(g.best.url);
    u.title = g.best.url;
    sub.append(tag, u);

    meta.append(n, sub);

    const btn = document.createElement("button");
    btn.className = "stream-btn";
    btn.type = "button";
    btn.textContent = "Baixar";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.textContent = "…";
      startDownload(g.best.url, "best", g.best.url, () => {
        btn.disabled = false;
        btn.textContent = "Baixar";
      });
    });

    const thumb = thumbNode(g.best);
    row.append(thumb, meta, btn);
    if (!g.best.thumb) pending.push({ el: thumb, item: g.best });
    streamsEl.appendChild(row);
  });

  loadThumbs(pending);
}

/* miniatura gerada pelo servidor (ffmpeg) quando a página não tem poster/og:image */
async function loadThumbs(pending) {
  if (!serverOnline) return;
  for (const p of pending.slice(0, 4)) {
    if (!p.el || !p.el.isConnected) continue;
    const cached = thumbCache.get(p.item.url);
    if (cached) {
      const img0 = document.createElement("img");
      img0.className = "thumb";
      img0.src = cached;
      p.el.replaceWith(img0);
      continue;
    }
    const r = await send({ type: "THUMB", url: p.item.url, referer: currentTab && currentTab.url ? currentTab.url : "" });
    if (!r || !r.ok || !r.data) continue;
    thumbCache.set(p.item.url, r.data);
    if (!p.el.isConnected) continue;
    const img = document.createElement("img");
    img.className = "thumb";
    img.src = r.data;
    img.alt = "";
    p.el.replaceWith(img);
  }
}

async function refreshStreams(showSpinner) {
  if (!currentTab || currentTab.id == null) return;
  if (showSpinner) refreshBtn.classList.add("spin");
  try {
    const r = await send({ type: "GET_TAB_STREAMS", tabId: currentTab.id });
    if (r && r.streams) {
      streams = r.streams;
      render();
    }
    const rr = await send({ type: "RESCAN_TAB", tabId: currentTab.id });
    if (rr && rr.ok && rr.streams) {
      streams = rr.streams;
      render();
    }
  } finally {
    refreshBtn.classList.remove("spin");
  }
}

/* -------------------------------------------------------------- downloads - */
function track(jobId, onDone) {
  const started = Date.now();
  const timer = setInterval(async () => {
    const st = await send({ type: "STATUS", jobId });
    if (!st || !st.ok) {
      if (Date.now() - started > 8000) {
        clearInterval(timer);
        statusEl.textContent = "Conexão perdida com o servidor local.";
        onDone && onDone(false);
      }
      return;
    }
    const d = st.data || {};
    if (d.status === "queued") statusEl.textContent = "Na fila...";
    else if (d.status === "downloading") statusEl.textContent = d.progress ? `Baixando ${d.progress}${d.speed ? " • " + d.speed : ""}` : "Extraindo vídeo...";
    else if (d.status === "merging") statusEl.textContent = "Unindo A/V (ffmpeg)...";
    else if (d.status === "done") {
      clearInterval(timer);
      statusEl.textContent = "Salvo em " + prettyFolder(d.output_dir || (cfg && cfg.output_dir));
      onDone && onDone(true);
    } else if (d.status === "error") {
      clearInterval(timer);
      statusEl.textContent = "Erro: " + String(d.error || "indisponível").slice(0, 70);
      onDone && onDone(false);
    }
  }, 700);
}

async function startDownload(targetUrl, quality, fallbackStream, onDone) {
  const url = (targetUrl || "").trim();
  if (!/^https?:/i.test(url)) {
    statusEl.textContent = "Abra uma página com vídeo.";
    onDone && onDone(false);
    return;
  }
  statusEl.textContent = "Iniciando download...";
  const res = await send({
    type: "DOWNLOAD",
    url,
    fallbackStream: fallbackStream && fallbackStream !== url ? fallbackStream : "",
    referer: (currentTab && currentTab.url) || url,
    title: (currentTab && currentTab.title) || "",
    pageUrl: (currentTab && currentTab.url) || url,
    quality: quality || "best"
  });

  if (!res || !res.ok || !res.job_id) {
    statusEl.textContent = "Servidor local offline.";
    await checkHealth();
    onDone && onDone(false);
    return;
  }
  track(res.job_id, onDone);
}

async function downloadAll() {
  const groups = groupize(streams);
  const urls = groups.map((g) => g.best.url).slice(0, 20);
  const host = (() => {
    try { return new URL((currentTab && currentTab.url) || "").hostname; } catch (_) { return ""; }
  })();
  const playerPage = /(^|\.)youtube\.com$|vimeo\.com|globoplay|globo\.com|dailymotion|twitch/.test(host);
  if (playerPage || (!urls.length && currentTab && currentTab.url && currentTab.url.startsWith("http"))) {
    urls.unshift(currentTab.url);
  }

  const res = await send({
    type: "DOWNLOAD_MANY",
    urls,
    referer: (currentTab && currentTab.url) || "",
    title: (currentTab && currentTab.title) || "",
    quality: "best"
  });

  if (!res || !res.ok) {
    statusEl.textContent = "Falha ao enfileirar. Servidor offline?";
    await checkHealth();
    return;
  }
  statusEl.textContent = `${res.queued} download(s) na fila do NOÉ VFX.`;
  if (!res.queued) statusEl.textContent = "Nada para baixar nesta aba.";
}

/* ------------------------------------------------------------------ boot -- */
async function boot() {
  await loadConfig(true);

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0] || null;
  const u = (currentTab && currentTab.url) || "";
  if (u.startsWith("http")) urlInput.value = u;

  await checkHealth();

  if (currentTab && currentTab.id != null) {
    const r = await send({ type: "GET_TAB_STREAMS", tabId: currentTab.id });
    if (r && r.streams && r.streams.length) {
      streams = r.streams;
      render();
    }
  }
  refreshStreams(false);

  // segunda chance: a página pode publicar os streams logo depois que o popup abre
  setTimeout(async () => {
    if (streams.length || !currentTab || currentTab.id == null) return;
    const r = await send({ type: "GET_TAB_STREAMS", tabId: currentTab.id });
    if (r && r.streams && r.streams.length) {
      streams = r.streams;
      render();
    }
  }, 800);
}

refreshBtn.addEventListener("click", async (e) => {
  if (e.shiftKey && currentTab && currentTab.id != null) {
    await chrome.tabs.reload(currentTab.id);
    window.close();
    return;
  }
  await refreshStreams(true);
  await loadConfig(true);
});

settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
changeFolderBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
setupBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

fabBtn.addEventListener("click", async () => {
  const turningOn = !(cfg && cfg.fab_enabled !== false);
  const r = await send({ type: "SAVE_CONFIG", patch: { fab_enabled: turningOn } });
  if (r && r.ok && r.config) {
    applyConfig(r.config);
    statusEl.textContent = turningOn
      ? "Ícone ativado sobre os vídeos."
      : "Ícone desativado. A detecção continua funcionando.";
  } else {
    statusEl.textContent = "Não consegui salvar (servidor local offline?).";
  }
});

openFolderBtn.addEventListener("click", async () => {
  const r = await send({ type: "OPEN_FOLDER", path: (cfg && cfg.output_dir) || "" });
  if (!r || !r.ok) statusEl.textContent = "Não consegui abrir a pasta (servidor offline?).";
});

allBtn.addEventListener("click", downloadAll);

document.querySelectorAll("button[data-q]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const quality = btn.dataset.q;
    const target = (urlInput.value || (currentTab && currentTab.url) || "").trim();
    const bestStream = streams[0] ? streams[0].url : "";
    startDownload(target, quality, bestStream);
  });
});

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") startDownload(urlInput.value, "best", streams[0] ? streams[0].url : "");
});

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && ch.cfg) applyConfig(ch.cfg.newValue);
});

boot();
