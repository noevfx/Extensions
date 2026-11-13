/* ============================================================================
   Noe VFX Downloader — Popup v3.0 (i18n pt/en)
   ========================================================================== */
"use strict";

const $ = (id) => document.getElementById(id);
const t = (k, ...s) => (globalThis.__nvfT ? globalThis.__nvfT(k, ...s) : k);

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
const cancelBtn = $("cancelBtn");
const barWrap = $("barWrap");
const bar = $("bar");

let currentTab = null;
let currentJob = null;          // último download em andamento (o botão Cancelar age nele)
let streams = [];
let cfg = null;
let serverOnline = false;

const RANK = { "HLS": 5, "DASH": 4, "MP4": 3, "WebM": 2, "Áudio": 1, "Audio": 1, "HTML5": 3, "Rede": 3, "Network": 3, "Embed": 4, "YouTube": 6, "Globo/G1": 6 };

const send = (msg) =>
  new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false }));
    } catch (_) {
      resolve({ ok: false });
    }
  });

/* ---------------------------------------------------------------- idioma -- */
if (globalThis.__nvfI18n) globalThis.__nvfI18n.applyStatic();
if (verEl) verEl.textContent = "v" + chrome.runtime.getManifest().version;

/* ---------------------------------------------------------------- tema ---- */
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
  if (!p) return t("folderLabel");
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
  fabBtn.title = on ? t("iconEnabled") : t("iconDisabled");
  const cb = $("compatBox");
  if (cb) cb.checked = c.compat_h264 === true;
}

async function loadConfig(force) {
  const r = await send({ type: "GET_CONFIG", force: !!force });
  if (r && r.config) applyConfig(r.config);
  return r;
}

/* ---------------------------------------------------------------- server -- */
let srvVersion = "";
async function checkHealth() {
  const r = await send({ type: "HEALTH" });
  serverOnline = !!(r && r.ok);
  srvVersion = (r && r.data && r.data.version) || "";
  srv.textContent = serverOnline ? t("online") : t("offline");
  srv.classList.toggle("on", serverOnline);
  srv.classList.toggle("off", !serverOnline);
  if (!serverOnline) statusEl.textContent = r && r.forbidden ? t("forbiddenMsg") : t("offlineHint");
  else if (r.outdated) statusEl.textContent = t("outdatedMsg");
  else if (r.data && r.data.ffmpeg_ok === false) statusEl.textContent = t("ffmpegMissing");
  return serverOnline;
}

/* --------------------------------------------------------------- streams -- */
/* O MESMO vídeo chega por dois caminhos: o player (Globo/G1 /v/ID/) e o stream que o player puxa pela rede
   (…/ID.m3u8). Junta os dois num item só, pelo id do vídeo, e mostra o do player (o mais confiável). */
function globoIdOf(it) { const m = it.kind === "Globo/G1" && String(it.url).match(/\/v\/(\d{7,})/); return m ? m[1] : ""; }

function groupize(list) {
  const map = new Map();
  const gids = list.map(globoIdOf).filter(Boolean);
  const groupKeyOf = (it) => {
    const own = globoIdOf(it);
    if (own) return "globo:" + own;
    for (const id of gids) if (new RegExp("(^|[^\d])" + id + "([^\d]|$)").test(String(it.url).split("?")[0])) return "globo:" + id;
    return it.group || it.url;
  };
  for (const it of list) {
    const k = groupKeyOf(it);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  // dentro de um grupo HLS, a playlist PRINCIPAL vale mais que a de uma qualidade só ("...-video=1320960.m3u8")
  const variant = (u) => /[=_]\d+(-|\.)|-(video|audio)=|chunklist|\/(video|audio)_/i.test(String(u).split("?")[0].split("/").pop()) ? 1 : 0;
  const out = [...map.entries()].map(([key, arr]) => {
    arr.sort((a, b) => ((RANK[b.kind] || 0) - (RANK[a.kind] || 0)) || (variant(a.url) - variant(b.url)));
    return { key, best: arr[0], count: arr.length, pri: Math.max(...arr.map((x) => x.pri || 0)) };
  });
  // o vídeo que está TOCANDO (ou à vista) vem primeiro; o resto mantém a ordem de chegada
  return out.map((g, i) => ({ g, i })).sort((a, b) => (b.g.pri - a.g.pri) || (a.i - b.i)).map((x) => x.g);
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
  d.textContent = "▶";                // o tipo (HLS/MP4...) já aparece na etiqueta ao lado
  d.setAttribute("aria-hidden", "true");
  return d;
}

function render() {
  const groups = groupize(streams);
  countPill.textContent = String(groups.length);
  streamsEl.textContent = "";

  if (!groups.length) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = t("empty");
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
    btn.textContent = t("download");
    btn.setAttribute("aria-label", t("download") + ": " + name.slice(0, 70));
    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.textContent = "…";
      startDownload(g.best.url, "best", g.best.url, () => {
        btn.disabled = false;
        btn.textContent = t("download");
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
  const queue = pending.slice(0, 6);
  const work = async () => {                       // 3 em paralelo (o servidor também limita a 2 ffmpeg)
    while (queue.length) {
      const p = queue.shift();
      if (!p.el || !p.el.isConnected) continue;
      let src = thumbCache.get(p.item.url);
      if (!src) {
        const r = await send({ type: "THUMB", url: p.item.url, referer: currentTab && currentTab.url ? currentTab.url : "" });
        if (!r || !r.ok || !r.data) continue;
        src = r.data;
        thumbCache.set(p.item.url, src);
      }
      if (!p.el.isConnected) continue;
      const img = document.createElement("img");
      img.className = "thumb";
      img.src = src;
      img.alt = "";
      p.el.replaceWith(img);
    }
  };
  await Promise.all([work(), work(), work()]);
}

/* Só redesenha a lista quando algo mudou (evita piscar) */
let lastSig = "";
const sigOf = (l) => l.map((x) => x.url + "|" + (x.thumb ? x.thumb.length : 0) + "|" + (x.title || "")).join("\n");
function applyStreams(list) {
  if (!Array.isArray(list)) return;
  const sg = sigOf(list);
  if (sg === lastSig) return;
  lastSig = sg;
  streams = list;
  render();
}

async function refreshStreams(showSpinner) {
  if (!currentTab || currentTab.id == null) return;
  if (showSpinner) refreshBtn.classList.add("spin");
  try {
    const r = await send({ type: "GET_TAB_STREAMS", tabId: currentTab.id });
    if (r && r.streams) applyStreams(r.streams);
    const rr = await send({ type: "RESCAN_TAB", tabId: currentTab.id });
    if (rr && rr.ok && rr.streams) applyStreams(rr.streams);
  } finally {
    refreshBtn.classList.remove("spin");
  }
}

/* -------------------------------------------------------------- downloads - */
function setJob(jobId) {
  currentJob = jobId;
  cancelBtn.hidden = !jobId;
  barWrap.hidden = !jobId;
  if (!jobId) bar.style.width = "0";
}

function track(jobId, onDone) {
  const started = Date.now();
  setJob(jobId);
  let ended = false;
  const timer = setInterval(async () => {
    const end = (ok) => {
      if (ended) return;
      ended = true;
      clearInterval(timer);
      if (currentJob === jobId) setJob(null);
      onDone && onDone(ok);
    };
    const st = await send({ type: "STATUS", jobId });
    if (!st || !st.ok) {
      if (Date.now() - started > 8000) {
        statusEl.textContent = t("lost");
        end(false);
      }
      return;
    }
    const d = st.data || {};
    const pct = parseFloat(d.progress);
    if (currentJob === jobId && isFinite(pct)) bar.style.width = Math.min(100, pct) + "%";
    if (d.status === "queued") statusEl.textContent = t("queue");
    else if (d.status === "downloading") statusEl.textContent = d.progress ? t("downloading", d.progress) : t("extracting");
    else if (d.status === "merging") statusEl.textContent = t("merging");
    else if (d.status === "done") {
      statusEl.textContent = t("savedIn", prettyFolder(d.output_dir || (cfg && cfg.output_dir))) + (d.warning ? " — " + t("ffWarn") : "");
      end(true);
    } else if (d.status === "canceled") {
      statusEl.textContent = t("canceledMsg");
      end(false);
    } else if (d.status === "error") {
      statusEl.textContent = t("errX", String(d.error || "-").slice(0, 70));
      end(false);
    }
  }, 700);
}

async function startDownload(targetUrl, quality, fallbackStream, onDone) {
  const url = (targetUrl || "").trim();
  if (!/^https?:/i.test(url)) {
    statusEl.textContent = t("openPage");
    onDone && onDone(false);
    return;
  }
  statusEl.textContent = t("starting");
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
    statusEl.textContent = res && res.error === "forbidden" ? t("forbiddenMsg")
      : res && res.error && res.error !== "Servidor local offline" ? String(res.error).slice(0, 70)
      : t("startFail");
    const keep = statusEl.textContent;
    await checkHealth();
    if (serverOnline) statusEl.textContent = keep;      // o aviso do erro vale mais que o "online"
    onDone && onDone(false);
    return;
  }
  if (res.duplicate) statusEl.textContent = t("dupNote");
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
    statusEl.textContent = t("enqueueFail");
    await checkHealth();
    return;
  }
  statusEl.textContent = res.queued ? t("queuedN", res.queued) : t("nothing");
}

/* ---------------------------------------------------------------- atualizar -- */
/* A extensão em modo desenvolvedor não se atualiza sozinha: quem baixa e troca os arquivos é o servidor local (confere o SHA-256);
   aqui só se pergunta, se confirma e se recarrega a extensão quando o servidor novo sobe. */
const updRow = $("updRow"), updMsg = $("updMsg"), updBtn = $("updBtn");
let updInfo = null, updBusy = false;

// 1.2.3 -> [1,2,3]; > 0 quando a é mais nova que b
function verCmp(a, b) {
  const x = String(a || "").split(".").map(Number), y = String(b || "").split(".").map(Number);
  for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}
const extVersion = chrome.runtime.getManifest().version;

// mode "reload": o app local JÁ foi atualizado (por este ou por outro perfil do navegador) e esta extensão ainda é a antiga
function showUpd(msg, canApply, mode) {
  updRow.hidden = false;
  updMsg.textContent = msg;
  updBtn.hidden = !canApply;
  updBtn.dataset.mode = mode || "apply";
  if (canApply) updBtn.textContent = mode === "reload" ? t("updReload") : t("updApply");
}
function showReloadIfBehind(serverVer) {
  if (verCmp(serverVer, extVersion) > 0) { showUpd(t("updReloadMsg", serverVer, extVersion), true, "reload"); return true; }
  return false;
}

async function checkUpdate(manual) {
  if (updBusy) return;
  if (manual) showUpd(t("updChecking"), false);
  const r = await send({ type: "UPDATE_CHECK", force: !!manual });
  if (!r || !r.ok) { if (manual) showUpd(r && r.error ? r.error : t("updFail"), false); return; }
  updInfo = r;
  if (showReloadIfBehind(r.current)) return;
  if (r.newer) {
    showUpd(t("updNew", r.latest) + (!r.can_apply && r.reason ? " — " + r.reason : ""), r.can_apply);
  } else if (manual) {
    showUpd(t("updLatest", r.current), false);
    setTimeout(() => { if (!updBusy && updInfo && !updInfo.newer) updRow.hidden = true; }, 5000);
  }
}

async function applyUpdate() {
  if (updBtn.dataset.mode === "reload") { chrome.runtime.reload(); return; }
  if (updBusy || !updInfo || !updInfo.newer) return;
  if (!confirm(t("updConfirm", updInfo.latest))) return;
  updBusy = true;
  showUpd(t("updApplying"), false);
  const r = await send({ type: "UPDATE_APPLY" });
  if (!r || !r.ok) { updBusy = false; showUpd(r && r.error ? r.error : t("updFail"), updInfo.can_apply); return; }
  showUpd(t("updRestarting"), false);
  for (let i = 0; i < 40; i++) {                      // espera o servidor novo subir (a versão do /health muda)
    await new Promise((x) => setTimeout(x, 1000));
    const h = await send({ type: "HEALTH" });
    if (h && h.ok && h.data && h.data.version === r.version) break;
  }
  chrome.runtime.reload();
}

if (verEl) verEl.addEventListener("click", () => checkUpdate(true));
if (updBtn) updBtn.addEventListener("click", applyUpdate);

/* ------------------------------------------------------------------ boot -- */
async function boot() {
  urlInput.setAttribute("aria-label", t("urlPh"));
  // config, aba ativa e saúde do servidor ao mesmo tempo (antes eram 4 esperas em fila)
  const [tabs] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    loadConfig(true),
    checkHealth()
  ]);
  currentTab = tabs[0] || null;
  if (serverOnline && !showReloadIfBehind(srvVersion)) checkUpdate(false);      // em silêncio: só aparece a faixa se houver versão nova
  const u = (currentTab && currentTab.url) || "";
  if (u.startsWith("http")) urlInput.value = u;

  if (currentTab && currentTab.id != null) {
    const r = await send({ type: "GET_TAB_STREAMS", tabId: currentTab.id });
    if (r && r.streams && r.streams.length) applyStreams(r.streams);
  }
  refreshStreams(false);

  // segunda chance: a página pode publicar os streams logo depois que o popup abre
  setTimeout(async () => {
    if (streams.length || !currentTab || currentTab.id == null) return;
    const r = await send({ type: "GET_TAB_STREAMS", tabId: currentTab.id });
    if (r && r.streams && r.streams.length) applyStreams(r.streams);
  }, 800);

  // atualização automática enquanto o popup está aberto: a página troca de vídeo, o player carrega depois, etc.
  let urlEdited = false;
  urlInput.addEventListener("input", () => { urlEdited = true; });
  setInterval(async () => {
    if (document.hidden || !currentTab || currentTab.id == null) return;
    try {
      const [tb] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tb && tb.id === currentTab.id && tb.url && tb.url !== currentTab.url) {
        currentTab = tb;
        if (!urlEdited && tb.url.startsWith("http")) urlInput.value = tb.url;
      }
      const rr = await send({ type: "RESCAN_TAB", tabId: currentTab.id });
      if (rr && rr.ok && rr.streams) applyStreams(rr.streams);
    } catch (_) {}
  }, 1800);
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

$("compatBox").addEventListener("change", async (e) => {
  const on = e.target.checked;
  const r = await send({ type: "SAVE_CONFIG", patch: { compat_h264: on } });
  if (r && r.ok && r.config) {
    applyConfig(r.config);
    statusEl.textContent = on ? t("compatOnMsg") : t("compatOffMsg");
  } else {
    e.target.checked = !on;
    statusEl.textContent = t("saveFailMsg");
  }
});

fabBtn.addEventListener("click", async () => {
  const turningOn = !(cfg && cfg.fab_enabled !== false);
  const r = await send({ type: "SAVE_CONFIG", patch: { fab_enabled: turningOn } });
  if (r && r.ok && r.config) {
    applyConfig(r.config);
    statusEl.textContent = turningOn ? t("iconOnMsg") : t("iconOffMsg");
  } else {
    statusEl.textContent = t("saveFailMsg");
  }
});

openFolderBtn.addEventListener("click", async () => {
  const r = await send({ type: "OPEN_FOLDER", path: (cfg && cfg.output_dir) || "" });
  if (!r || !r.ok) statusEl.textContent = t("openFolderFail");
});

allBtn.addEventListener("click", downloadAll);

cancelBtn.addEventListener("click", async () => {
  if (!currentJob) return;
  const r = await send({ type: "CANCEL", jobId: currentJob });
  statusEl.textContent = r && r.ok ? t("canceledMsg") : t("cancelFail");
});

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
