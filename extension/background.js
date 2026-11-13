/* ============================================================================
   Noe VFX Downloader — Service Worker v3.0.15  (noevfx.com)
   - Detecção persistente (sobrevive à suspensão do service worker)
   - Detecta por extensão de arquivo E pelo tipo do conteúdo (Content-Type)
   - Badge vermelho com número branco = vídeos encontrados na aba
   - Fila de downloads individuais, "baixar todos" e cancelar
   - Só aceita pedidos sensíveis (config, pasta) vindos das páginas da extensão
   ========================================================================== */
"use strict";

// i18n dos menus de contexto
try { importScripts("i18n.js"); } catch (_) {}
const t = (k, ...s) => (globalThis.__nvfT ? globalThis.__nvfT(k, ...s) : k);

const SERVER = "http://127.0.0.1:8765";
const HDRS = { "Content-Type": "application/json", "X-NoeVFX-Client": "1" };
const REQUIRED_API = 2;               // versão mínima do protocolo do servidor local
const MAX_STREAMS = 80;
const MAX_CT_STREAMS = 12;            // itens achados só pelo Content-Type (evita encher com segmentos)
const SESSION = chrome.storage && chrome.storage.session;
const EXT_URL = chrome.runtime.getURL("");
const QUALITIES = ["best", "1080", "720", "audio"];

const DEFAULT_CONFIG = {
  output_dir: "",
  hover_action: "menu",        // "menu" = confirmar pasta | "direct" = salvar direto
  default_quality: "best",
  use_cookies: true,
  organize_by_site: false,
  fab_enabled: true,           // ícone flutuante sobre os vídeos
  onboarded: false
};

const IGNORE_RE = /\/range\/prot\/|[?&](bytestart|byteend)=|\/drm\/(cenc|widevine|playready|fairplay)|(\/|[-_.])(segment|seg|frag|fragment|chunk|init)[-_\d]*\.(mp4|m4v|m4a|webm)(\?|#|$)|\.(ts|m4s|m4f|aac|vtt|srt|jpg|jpeg|png|gif|webp|avif|svg|css|js|json|woff2?|ico|txt|xml|webmanifest)(\?|#|$)|doubleclick|googlesyndication|adsystem|scorecardresearch|googletagmanager|google-analytics|adservice|pubmatic|rubiconproject/i;

const MEDIA_EXT_RE = /\.(m3u8|mpd|mp4|webm|m4v|mov|m4a|mkv|flv|ogv)(\?|#|$)/i;

// vídeo/áudio/manifesto reconhecido pelo cabeçalho Content-Type (URLs sem extensão)
const CT_RE = /^(video\/|audio\/(mp4|mpeg|aac|ogg|webm|x-m4a)|application\/(vnd\.apple\.mpegurl|x-mpegurl|dash\+xml))/i;
// o YouTube é baixado pela URL da página (yt-dlp); pedaços de "videoplayback" não servem
const SKIP_CT_HOST_RE = /(^|\.)(googlevideo\.com|youtube\.com|ytimg\.com|cdninstagram\.com|fbcdn\.net|tiktokcdn(-us|-eu)?\.com|tiktokv\.com|tiktok\.com|byteoversea\.com|ibytedtos\.com|ttwstatic\.com|tiktokw\.us|ibyteimg\.com|twimg\.com|pinimg\.com)$/i;
// Instagram/Facebook: o vídeo vem em pedaços (video-only/audio-only, bytestart/byteend) que não tocam sozinhos.
// O download certo é pela URL do post/página (yt-dlp), que o content script informa.
const FRAG_HOST_RE = /(^|\.)(cdninstagram\.com|fbcdn\.net|tiktokcdn(-us|-eu)?\.com|tiktokv\.com|tiktok\.com|byteoversea\.com|ibytedtos\.com|ttwstatic\.com|tiktokw\.us|ibyteimg\.com|twimg\.com|pinimg\.com)$/i;

/* ---------------------------------------------------------------- util ---- */
const now = () => Date.now();
const isHttp = (u) => typeof u === "string" && u.length < 4096 && /^https?:\/\//i.test(u);

async function fetchJson(url, opts = {}, timeout = 9000) {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal, cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(tm);
  }
}

function classify(url) {
  if (/\.m3u8/i.test(url)) return "HLS";
  if (/\.mpd/i.test(url)) return "DASH";
  if (/\.mp4/i.test(url)) return "MP4";
  if (/\.webm/i.test(url)) return "WebM";
  if (/\.(m4a|mp3)/i.test(url)) return "Áudio";
  if (/youtube\.com\/watch/i.test(url)) return "YouTube";
  if (/vimeo\.com/i.test(url)) return "Vimeo";
  return "Player";
}

function kindFromContentType(ct) {
  if (/mpegurl/i.test(ct)) return "HLS";
  if (/dash\+xml/i.test(ct)) return "DASH";
  if (/^audio\//i.test(ct)) return "Áudio";
  if (/webm/i.test(ct)) return "WebM";
  return "MP4";
}

/* Agrupa variantes de qualidade do MESMO vídeo (uma pasta = um vídeo). */
function groupKey(url, collapseDigits) {
  try {
    const u = new URL(url);
    let p = u.pathname;
    if (/\.(m3u8|mpd)$/i.test(p)) p = p.replace(/\/[^/]*$/, "");
    if (collapseDigits) p = p.replace(/\d+/g, "#");
    return u.hostname + p;
  } catch (_) {
    return url;
  }
}

/* Quem pediu o arquivo (a página/iframe do player). Muitos players (Hotmart, Vimeo privado...) só liberam o
   vídeo com o Referer do iframe do player, não o da página de fora. */
function refFrom(d) {
  try {
    if (d && isHttp(d.documentUrl)) return d.documentUrl.slice(0, 2000);
    const o = (d && d.initiator) || "";
    return /^https?:/i.test(o) ? new URL(o).origin + "/" : "";
  } catch (_) {
    return "";
  }
}

function findItem(url) {
  for (const list of MEM.values()) {
    const hit = list.find((x) => x.url === url);
    if (hit) return hit;
  }
  return null;
}

/* Quem mandou a mensagem: página da própria extensão (popup/opções) ou content script? */
const isExtPage = (s) => !!(s && s.id === chrome.runtime.id && typeof s.url === "string" && s.url.startsWith(EXT_URL));

/* ------------------------------------------------------- store por aba ---- */
const MEM = new Map();          // tabId -> [streams]
const THUMB = new Map();        // tabId -> thumb da página
const PAGE_TITLE = new Map();   // tabId -> título
const dirty = new Set();
const dirtyBadge = new Set();
let flushTimer = null;
let badgeTimer = null;

function sessionGet(keys) {
  return new Promise((res) => {
    if (!SESSION) return res({});
    try {
      SESSION.get(keys).then((r) => res(r || {})).catch(() => res({}));
    } catch (_) {
      res({});
    }
  });
}

function scheduleFlush(tabId) {
  dirty.add(tabId);
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    const ids = [...dirty];
    dirty.clear();
    if (!SESSION) return;
    const patch = {};
    ids.forEach((id) => {
      patch["t" + id] = MEM.get(id) || [];
      patch["m" + id] = { thumb: THUMB.get(id) || "", title: PAGE_TITLE.get(id) || "" };
    });
    try { await SESSION.set(patch); } catch (_) {}
  }, 250);
}

async function hydrate(tabId) {
  const r = await sessionGet(["t" + tabId, "m" + tabId]);
  const meta = r["m" + tabId];
  if (meta && typeof meta === "object") {
    if (meta.thumb && !THUMB.has(tabId)) THUMB.set(tabId, meta.thumb);
    if (meta.title && !PAGE_TITLE.has(tabId)) PAGE_TITLE.set(tabId, meta.title);
  }
  const seed = r["t" + tabId];
  if (!Array.isArray(seed) || !seed.length) return;
  const cur = MEM.get(tabId);
  if (!cur || !cur.length) { MEM.set(tabId, seed); return; }
  const seen = new Set(cur.map((x) => x.url));
  const extra = seed.filter((x) => !seen.has(x.url));
  if (extra.length) cur.push(...extra);
}

function listOf(tabId) {
  let l = MEM.get(tabId);
  if (!l) {
    l = [];
    MEM.set(tabId, l);
    hydrate(tabId);
  }
  return l;
}

// cores uma vez só (valem para todas as abas); por aba só o número
try {
  chrome.action.setBadgeBackgroundColor({ color: "#E01B24" });
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
} catch (_) {}


/* A miniatura da página (og:image) só serve quando há UM vídeo na aba. Com vários, repeti-la em todos os itens
   faz parecer que são o mesmo vídeo (e o usuário baixa o errado). */
function withThumbs(tabId) {
  const list = listOf(tabId);
  const single = new Set(list.map((x) => x.group || groupKey(x.url))).size <= 1;
  const pageThumb = single ? THUMB.get(tabId) || "" : "";
  return list.map((x) => (x.thumb ? x : pageThumb ? { ...x, thumb: pageThumb } : x));
}

function scheduleBadge(tabId) {
  dirtyBadge.add(tabId);
  if (badgeTimer) return;
  badgeTimer = setTimeout(() => {
    badgeTimer = null;
    const ids = [...dirtyBadge];
    dirtyBadge.clear();
    ids.forEach(paintBadge);
  }, 120);
}

function paintBadge(tabId) {
  const list = MEM.get(tabId) || [];
  // o mesmo vídeo do G1 chega pelo player (/v/ID/) e pelo HLS de rede (…/ID.m3u8): conta uma vez só (igual ao popup)
  const gids = list.map((x) => (x.kind === "Globo/G1" && (String(x.url).match(/\/v\/(\d{7,})/) || [])[1]) || "").filter(Boolean);
  const keyOf = (x) => {
    const own = x.kind === "Globo/G1" && (String(x.url).match(/\/v\/(\d{7,})/) || [])[1];
    if (own) return "globo:" + own;
    for (const id of gids) if (new RegExp("(^|[^\d])" + id + "([^\d]|$)").test(String(x.url).split("?")[0])) return "globo:" + id;
    return x.group || groupKey(x.url);
  };
  const n = new Set(list.map(keyOf)).size;
  try { chrome.action.setBadgeText({ tabId, text: n ? String(n) : "" }).catch(() => {}); } catch (_) {}
}

/* Pinterest: os vídeos do feed chegam por HLS/MP4 de pinimg.com (não vão para a lista: a lista mostra o PIN). Guarda só o endereço
   por "hash" do vídeo (32 hex, o mesmo do pôster do <video>) para o ícone baixar o vídeo certo quando o cartão não tem link de pin. */
const PIN_MEDIA_RE = /^https:\/\/[\w.-]*pinimg\.com(?::\d+)?\/videos\/.*?([0-9a-f]{32})[^/?#]*\.(m3u8|mp4)(\?|#|$)/i;
const PIN_MEDIA = new Map();            // tabId -> Map(hash -> { mp4, hls })
function notePinMedia(tabId, url) {
  const m = PIN_MEDIA_RE.exec(url);
  if (!m) return;
  let tm = PIN_MEDIA.get(tabId);
  if (!tm) PIN_MEDIA.set(tabId, (tm = new Map()));
  const h = m[1].toLowerCase();
  const e = tm.get(h) || {};
  if (m[2].toLowerCase() === "mp4") { if (!e.mp4 || /_720w\./i.test(url)) e.mp4 = url; }
  else if (!e.hls) e.hls = url;
  tm.set(h, e);
  if (tm.size > 400) tm.delete(tm.keys().next().value);
}
function pinStreamUrl(tabId, hash) {
  const h = String(hash || "").toLowerCase();
  let e = PIN_MEDIA.get(tabId) && PIN_MEDIA.get(tabId).get(h);
  if (!e) for (const tm of PIN_MEDIA.values()) { if (tm.has(h)) { e = tm.get(h); break; } }
  if (!e) return "";
  // várias qualidades do HLS ficam lado a lado (<hash>_360w.m3u8, <hash>_audio.m3u8): a principal é <hash>.m3u8
  return e.mp4 || (e.hls ? e.hls.replace(/_(\d+w|audio)(\.m3u8)/i, "$2") : "");
}

function addStream(tabId, url, kind, extra) {
  if (tabId == null || tabId < 0 || !url) return;
  notePinMedia(tabId, url);
  if (!/^https?:/i.test(url)) return;
  if (IGNORE_RE.test(url)) return;
  if (!(extra && extra.pg)) { try { if (FRAG_HOST_RE.test(new URL(url).hostname)) return; } catch (_) { return; } }
  // veio do padrão de URL: exige extensão de mídia de verdade (evita site.webmanifest etc.)
  if (!kind && !MEDIA_EXT_RE.test(url)) return;

  const list = listOf(tabId);
  const hit = list.find((x) => x.url === url);
  if (hit) {
    let changed = false;
    if (extra && isHttp(extra.ref) && !hit.ref) { hit.ref = extra.ref; changed = true; }
    if (extra && extra.thumb && !hit.thumb && extra.thumb !== THUMB.get(tabId)) { hit.thumb = extra.thumb; changed = true; }
    if (extra && extra.title && !hit.title) { hit.title = extra.title; changed = true; }
    if (extra && extra.pri != null && (hit.pri || 0) !== extra.pri) { hit.pri = extra.pri; changed = true; }
    if (changed) scheduleFlush(tabId);
    return;
  }

  const byType = !!(extra && extra.ct);
  const group = groupKey(url, byType);
  if (byType) {
    // segmentos numerados (seg_1, seg_2...) viram um só item
    if (list.some((x) => x.group === group)) return;
    if (list.filter((x) => x.ct).length >= MAX_CT_STREAMS) return;
  }

  const item = {
    url,
    kind: kind || classify(url),
    group,
    ts: now(),
    title: (extra && extra.title) || PAGE_TITLE.get(tabId) || ""
  };
  if (byType) item.ct = 1;
  if (extra && isHttp(extra.ref)) item.ref = extra.ref;
  if (extra && extra.pri) item.pri = extra.pri;
  if (extra && extra.pg) item.pg = 1;
  // miniatura da página fica UMA vez por aba (THUMB); o item só guarda a sua se for diferente
  if (extra && extra.thumb && extra.thumb !== THUMB.get(tabId)) item.thumb = extra.thumb;
  list.unshift(item);
  if (list.length > MAX_STREAMS) list.length = MAX_STREAMS;
  scheduleFlush(tabId);
  scheduleBadge(tabId);
}

function setThumb(tabId, thumb, title) {
  if (tabId == null || tabId < 0) return;
  let changed = false;
  if (thumb && typeof thumb === "string" && thumb.length < 200000 && THUMB.get(tabId) !== thumb) {
    THUMB.set(tabId, thumb);
    changed = true;
  }
  if (title && typeof title === "string") {
    const ti = title.slice(0, 300);
    if (PAGE_TITLE.get(tabId) !== ti) PAGE_TITLE.set(tabId, ti);
    const list = listOf(tabId);
    list.forEach((x) => { if (!x.title) { x.title = ti; changed = true; } });
  }
  if (changed) scheduleFlush(tabId);
}

function clearTab(tabId) {
  PIN_MEDIA.delete(tabId);
  MEM.delete(tabId);
  THUMB.delete(tabId);
  PAGE_TITLE.delete(tabId);
  dirty.delete(tabId);
  try { SESSION.remove(["t" + tabId, "m" + tabId]).catch(() => {}); } catch (_) {}
  paintBadge(tabId);
}

/* ------------------------------------------------------- sniffer de rede -- */
// 1) URLs com extensão de mídia conhecida
chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.tabId < 0) return;
    addStream(d.tabId, d.url, null, { ref: refFrom(d) });
  },
  { urls: ["*://*/*.m3u8*", "*://*/*.mpd*", "*://*/*.mp4*", "*://*/*.webm*", "*://*/*.m4v*", "*://*/*.mov*", "*://*/*.m4a*", "*://*/*.mkv*", "*://*/*.flv*"] }
);

// 2) <video src> / áudio SEM extensão na URL: reconhece pelo Content-Type da resposta
chrome.webRequest.onHeadersReceived.addListener(
  (d) => {
    if (d.tabId < 0 || (d.statusCode !== 200 && d.statusCode !== 206)) return;
    let ct = "";
    for (const h of d.responseHeaders || []) {
      if (h.name && h.name.toLowerCase() === "content-type") { ct = h.value || ""; break; }
    }
    if (!CT_RE.test(ct)) return;
    try { if (SKIP_CT_HOST_RE.test(new URL(d.url).hostname)) return; } catch (_) { return; }
    addStream(d.tabId, d.url, kindFromContentType(ct), { ct: 1, ref: refFrom(d) });
  },
  { urls: ["<all_urls>"], types: ["media"] },
  ["responseHeaders"]
);

chrome.tabs.onRemoved.addListener((tabId) => clearTab(tabId));
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "loading") clearTab(tabId);
  if (info.title && tab && tab.title) {
    PAGE_TITLE.set(tabId, tab.title);
    const list = MEM.get(tabId) || [];
    let ch = false;
    list.forEach((x) => { if (!x.title) { x.title = tab.title; ch = true; } });
    if (ch) scheduleFlush(tabId);
  }
});

/* ----------------------------------------------------------- configuração */
let CFG = null;
let CFG_AT = 0;
let CFG_ERR = null;

async function getConfig(force) {
  if (!force && CFG && now() - CFG_AT < 20000) return CFG;
  try {
    const r = await fetchJson(SERVER + "/config", { headers: HDRS }, 4000);
    if (r.ok && r.data && typeof r.data === "object") {
      CFG = { ...DEFAULT_CONFIG, ...r.data };
      CFG_AT = now();
      CFG_ERR = null;
      return CFG;
    }
    throw new Error(r.status === 403 ? "forbidden" : "bad");
  } catch (e) {
    CFG_ERR = String(e);
    if (!CFG) {
      try {
        const st = await chrome.storage.local.get("cfg");
        CFG = { ...DEFAULT_CONFIG, ...(st.cfg || {}) };
      } catch (_) {
        CFG = { ...DEFAULT_CONFIG };
      }
    }
    return CFG;
  }
}

async function saveConfig(patch) {
  const r = await fetchJson(SERVER + "/config", {
    method: "POST",
    headers: HDRS,
    body: JSON.stringify(patch)
  }, 8000);
  if (!r.ok) throw new Error((r.data && r.data.error) || "Falha ao salvar");
  CFG = { ...DEFAULT_CONFIG, ...r.data };
  CFG_AT = now();
  try { await chrome.storage.local.set({ cfg: CFG }); } catch (_) {}
  broadcastConfig();
  try { buildMenus(CFG.fab_enabled !== false); } catch (_) {}
  return CFG;
}

/* Quem não é página da extensão só pode ligar/desligar o ícone. */
function sanitizePatch(patch, fromExtPage) {
  if (!patch || typeof patch !== "object") return {};
  if (fromExtPage) return patch;                    // o servidor valida o resto
  return typeof patch.fab_enabled === "boolean" ? { fab_enabled: patch.fab_enabled } : {};
}

function broadcastConfig() {
  try {
    chrome.tabs.query({}).then((tabs) => {
      tabs.forEach((tb) => {
        if (tb.id == null) return;
        try {
          chrome.tabs.sendMessage(tb.id, { type: "CONFIG_CHANGED" }, () => {
            if (chrome.runtime.lastError) { /* aba sem content script */ }
          });
        } catch (_) {}
      });
    }).catch(() => {});
  } catch (_) {}
}

/* --------------------------------------------------------------- servidor -- */
let API = { checked: 0, outdated: false };

async function health() {
  const r = await fetchJson(SERVER + "/health", { headers: HDRS }, 4000);
  if (r.status === 403) return { ok: false, forbidden: true };
  const d = r.data || {};
  const outdated = !(Number(d.api_version) >= REQUIRED_API);
  API = { checked: now(), outdated };
  return { ok: r.ok, data: d, outdated };
}

/* --------------------------------------------------------------- cookies - */
async function cookieTxt(urls) {
  const seen = new Set();
  const lines = ["# Netscape HTTP Cookie File"];
  for (const u of urls) {
    if (!u || !/^https?:/i.test(u)) continue;
    let list = [];
    try { list = await chrome.cookies.getAll({ url: u }); } catch (_) { continue; }
    for (const c of list) {
      const id = c.domain + "|" + c.path + "|" + c.name;
      if (seen.has(id)) continue;
      seen.add(id);
      const val = String(c.value).replace(/[\t\r\n]/g, "");   // um TAB/quebra no valor desalinharia as colunas
      const pref = c.httpOnly ? "#HttpOnly_" : "";
      const sub = c.hostOnly ? "FALSE" : "TRUE";
      const exp = c.expirationDate ? Math.floor(c.expirationDate) : Math.floor(now() / 1000) + 86400 * 30;
      lines.push(`${pref}${c.domain}\t${sub}\t${c.path}\t${c.secure ? "TRUE" : "FALSE"}\t${exp}\t${c.name}\t${val}`);
    }
  }
  return lines.length > 1 ? lines.join("\n") + "\n" : "";
}

/* -------------------------------------------------------------- downloads - */
async function startDownload(payload, sender) {
  if (!payload || !isHttp(payload.url)) return { ok: false, error: "URL inválida" };
  const cfg = await getConfig();
  const tabId = sender && sender.tab ? sender.tab.id : undefined;
  const pageUrl = [payload.pageUrl, sender && sender.tab ? sender.tab.url : ""].find(isHttp) || "";
  const list = tabId != null ? listOf(tabId) : [];
  const best = isHttp(payload.fallbackStream) ? payload.fallbackStream : (list[0] ? list[0].url : "");
  const useCookies = payload.useCookies !== false && cfg.use_cookies !== false;

  const fallbackUrl = isHttp(payload.fallbackStream) ? payload.fallbackStream : (payload.url === pageUrl ? best : "");
  const primItem = findItem(payload.url);
  const fbItem = fallbackUrl ? findItem(fallbackUrl) : null;
  const cookies = useCookies ? await cookieTxt([payload.url, fallbackUrl, pageUrl]) : "";

  const body = {
    url: payload.url,
    fallbackStream: fallbackUrl,
    // Referer: o do iframe que pediu aquele stream (se conhecido); senão o da página
    referer: (primItem && primItem.ref) || (isHttp(payload.referer) ? payload.referer : pageUrl),
    fallbackReferer: (fbItem && fbItem.ref) || "",
    userAgent: navigator.userAgent,
    quality: QUALITIES.includes(payload.quality) ? payload.quality : (cfg.default_quality || "best"),
    title: String(payload.title || (tabId != null ? PAGE_TITLE.get(tabId) : "") || "").slice(0, 300),
    cookies,
    organizeBySite: !!cfg.organize_by_site,
    single: payload.single !== false
  };

  const r = await fetchJson(SERVER + "/download", {
    method: "POST",
    headers: HDRS,
    body: JSON.stringify(body)
  }, 15000);

  if (r.status === 403) return { ok: false, error: "forbidden" };
  if (!r.ok || !r.data || !r.data.job_id) {
    return { ok: false, error: (r.data && r.data.error) || "Servidor local offline" };
  }
  return { ok: true, job_id: r.data.job_id, duplicate: !!r.data.duplicate, output_dir: r.data.output_dir || cfg.output_dir };
}

/* Mensagens */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string" || sender.id !== chrome.runtime.id) return;
  const fromExt = isExtPage(sender);
  const ownTab = sender && sender.tab ? sender.tab.id : null;
  const targetTab = (v) => {
    // content script só mexe na própria aba; popup/opções em qualquer uma
    if (fromExt) return Number.isInteger(v) ? v : null;
    return ownTab;
  };

  const run = async () => {
    switch (msg.type) {
      case "DOM_MEDIA_FOUND": {
        if (ownTab == null) return { ok: false };
        if (msg.thumb) setThumb(ownTab, msg.thumb, msg.title);
        // vindo de um iframe (player embutido): o Referer certo é o do iframe
        let frameRef = "";
        if (sender.frameId && isHttp(sender.url)) frameRef = sender.url.slice(0, 2000);
        if (Array.isArray(msg.items)) msg.items.slice(0, 120).forEach((it) => it && addStream(ownTab, it.url, it.kind, { ...it, ref: frameRef }));
        return { ok: true, count: listOf(ownTab).length };
      }

      case "PAGE_THUMB": {
        if (ownTab != null) setThumb(ownTab, msg.thumb, msg.title);
        return { ok: true };
      }

      case "GET_TAB_STREAMS": {
        const tabId = targetTab(msg.tabId);
        if (tabId == null) return { ok: false };
        if (!MEM.has(tabId)) {
          MEM.set(tabId, []);
          await hydrate(tabId);
        }
        const pageThumb = THUMB.get(tabId) || "";
        return {
          ok: true,
          streams: withThumbs(tabId),
          thumb: pageThumb,
          title: PAGE_TITLE.get(tabId) || ""
        };
      }

      case "RESCAN_TAB": {
        const tabId = targetTab(msg.tabId);
        if (tabId == null) return { ok: false };
        const ask = (frameId) =>
          new Promise((resolve) => {
            const opts = frameId == null ? undefined : { frameId };
            try {
              chrome.tabs.sendMessage(tabId, { type: "RESCAN" }, opts, (r) => {
                if (chrome.runtime.lastError) return resolve(null);
                resolve(r || null);
              });
            } catch (_) {
              resolve(null);
            }
          });

        // sempre prioriza o frame principal (iframes de anúncio respondem vazio)
        let res = await ask(0);
        if (!res || !res.ok) res = await ask(null);

        if (res && Array.isArray(res.items)) {
          if (res.thumb) setThumb(tabId, res.thumb, res.title);
          res.items.forEach((it) => addStream(tabId, it.url, it.kind, it));
        }
        return {
          ok: true,
          streams: withThumbs(tabId),
          added: res && res.items ? res.items.length : 0
        };
      }

      case "RESET_TAB": {                    // o content script pede para zerar a PRÓPRIA aba (troca de vídeo no YouTube)
        if (ownTab != null) clearTab(ownTab);
        return { ok: true };
      }

      case "CLEAR_TAB": {
        if (!fromExt) return { ok: false };
        const tabId = targetTab(msg.tabId);
        if (tabId != null) clearTab(tabId);
        return { ok: true };
      }

      case "GET_CONFIG":
        return { ok: true, config: await getConfig(!!msg.force), offline: !!CFG_ERR, forbidden: CFG_ERR === "Error: forbidden" };

      case "SAVE_CONFIG": {
        try {
          const patch = sanitizePatch(msg.patch, fromExt);
          const cfg = await saveConfig(patch);
          return { ok: true, config: cfg };
        } catch (e) {
          return { ok: false, error: String(e && e.message ? e.message : e) };
        }
      }

      case "OPEN_OPTIONS": {
        chrome.runtime.openOptionsPage();
        return { ok: true };
      }

      case "PICK_FOLDER": {
        if (!fromExt) return { ok: false, error: "forbidden" };
        try {
          const r = await fetchJson(SERVER + "/pick-folder", { method: "POST", headers: HDRS, body: "{}" }, 300000);
          return { ok: !!(r.data && r.data.path), path: (r.data && r.data.path) || "", error: (r.data && r.data.error) || "" };
        } catch (e) {
          return { ok: false, error: "Servidor local offline" };
        }
      }

      case "OPEN_FOLDER": {
        try {
          const r = await fetchJson(SERVER + "/open-folder", {
            method: "POST",
            headers: HDRS,
            body: JSON.stringify({ path: fromExt && typeof msg.path === "string" ? msg.path : "" })
          }, 8000);
          return { ok: r.ok, data: r.data };
        } catch (_) {
          return { ok: false };
        }
      }

      case "HEALTH": {
        try {
          return await health();
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }

      case "PIN_STREAM": {
        const u = pinStreamUrl(sender && sender.tab ? sender.tab.id : -1, msg.hash);
        return u ? { ok: true, url: u } : { ok: false };
      }

      case "UPDATE_CHECK": {
        try {
          const r = await fetchJson(SERVER + "/update/check" + (msg.force ? "?force=1" : ""), { headers: HDRS }, 20000);
          return r.ok ? { ok: true, ...r.data } : { ok: false, error: (r.data && r.data.error) || "" };
        } catch (e) {
          return { ok: false, error: "" };
        }
      }

      case "UPDATE_APPLY": {
        try {
          const r = await fetchJson(SERVER + "/update/apply", { method: "POST", headers: HDRS, body: "{}" }, 180000);
          return r.ok ? { ok: true, ...r.data } : { ok: false, error: (r.data && r.data.error) || "" };
        } catch (e) {
          return { ok: false, error: "" };
        }
      }

      case "DOWNLOAD":
        try {
          return await startDownload(msg, sender);
        } catch (e) {
          return { ok: false, error: String(e && e.message ? e.message : e) };
        }

      case "DOWNLOAD_MANY": {
        const urls = [...new Set(Array.isArray(msg.urls) ? msg.urls.filter(isHttp) : [])].slice(0, 30);
        const out = [];
        for (const u of urls) {
          try {
            const r = await startDownload({
              url: u,
              fallbackStream: msg.fallbackStream || "",
              referer: msg.referer,
              quality: msg.quality,
              title: msg.title,
              pageUrl: msg.referer,
              single: false
            }, sender);
            out.push(r);
          } catch (e) {
            out.push({ ok: false, error: String(e) });
          }
        }
        return { ok: true, results: out, queued: out.filter((x) => x.ok).length };
      }

      case "STATUS": {
        try {
          const r = await fetchJson(SERVER + "/status?id=" + encodeURIComponent(String(msg.jobId || "")), { headers: HDRS }, 5000);
          return { ok: r.ok, data: r.data };
        } catch (_) {
          return { ok: false };
        }
      }

      case "CANCEL": {
        try {
          const r = await fetchJson(SERVER + "/cancel", {
            method: "POST", headers: HDRS, body: JSON.stringify({ id: String(msg.jobId || "") })
          }, 6000);
          return { ok: r.ok };
        } catch (_) {
          return { ok: false };
        }
      }

      case "THUMB": {
        if (!isHttp(msg.url)) return { ok: false };
        try {
          const u =
            SERVER + "/thumb?url=" + encodeURIComponent(msg.url) +
            "&referer=" + encodeURIComponent(isHttp(msg.referer) ? msg.referer : "") +
            "&ua=" + encodeURIComponent(navigator.userAgent);
          const r = await fetch(u, { headers: { "X-NoeVFX-Client": "1" }, cache: "force-cache" });
          if (!r.ok) return { ok: false };
          const buf = new Uint8Array(await r.arrayBuffer());
          let bin = "";
          const CHUNK = 0x8000;
          for (let i = 0; i < buf.length; i += CHUNK) {
            bin += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
          }
          return { ok: true, data: "data:image/jpeg;base64," + btoa(bin) };
        } catch (_) {
          return { ok: false };
        }
      }

      default:
        return { ok: false, error: "unknown" };
    }
  };

  run().then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

/* ------------------------------------------------------------- menu extra - */
function isPlayerUrl(u) {
  try {
    const h = new URL(u).hostname;
    return /(^|\.)youtube\.com$|vimeo\.com|globoplay|globo\.com|dailymotion|twitch/.test(h);
  } catch (_) {
    return false;
  }
}

function buildMenus(fabEnabled) {
  const on = fabEnabled !== false;
  chrome.contextMenus.removeAll(() => {
    const ctx = ["page", "link", "video", "image"];
    chrome.contextMenus.create({
      id: "noevfx-download-best",
      title: t("menuBest"),
      contexts: ctx
    });
    chrome.contextMenus.create({
      id: "noevfx-download-all",
      title: t("menuAll"),
      contexts: ctx
    });
    chrome.contextMenus.create({ id: "noevfx-sep1", type: "separator", contexts: ctx });
    chrome.contextMenus.create({
      id: "noevfx-icon-on", type: "radio",
      title: t("menuIconOn"), checked: on, contexts: ctx
    });
    chrome.contextMenus.create({
      id: "noevfx-icon-off", type: "radio",
      title: t("menuIconOff"), checked: !on, contexts: ctx
    });
    chrome.contextMenus.create({ id: "noevfx-sep2", type: "separator", contexts: ctx });
    chrome.contextMenus.create({
      id: "noevfx-open-folder",
      title: t("menuOpenFolder"),
      contexts: ctx
    });
    chrome.contextMenus.create({
      id: "noevfx-options",
      title: t("menuOptions"),
      contexts: ["page", "action", "video", "link", "image"]
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  getConfig(true).then((c) => buildMenus(c.fab_enabled !== false)).catch(() => buildMenus(true));
  if (details.reason === "install") {
    chrome.storage.local.set({ onboarded: false });
    chrome.tabs.create({ url: "options.html?firstrun=1" }).catch(() => {});
  }
});
chrome.runtime.onStartup.addListener(() => {
  getConfig(true).then((c) => buildMenus(c.fab_enabled !== false)).catch(() => buildMenus(true));
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = String(info.menuItemId);
  const pageUrl = (tab && tab.url) || "";

  if (id === "noevfx-options") {
    chrome.runtime.openOptionsPage();
    return;
  }

  if (id === "noevfx-open-folder") {
    try {
      await fetchJson(SERVER + "/open-folder", {
        method: "POST", headers: HDRS, body: JSON.stringify({ path: "" })
      }, 8000);
    } catch (_) {}
    return;
  }

  if (id === "noevfx-icon-on" || id === "noevfx-icon-off") {
    try { await saveConfig({ fab_enabled: id === "noevfx-icon-on" }); } catch (_) {}
    return;
  }

  if (id === "noevfx-download-all") {
    const tabId = tab && tab.id;
    let urls = tabId != null ? listOf(tabId).map((x) => x.url).slice(0, 20) : [];
    if (isPlayerUrl(pageUrl) || !urls.length) {
      if (pageUrl.startsWith("http") && !urls.includes(pageUrl)) urls.unshift(pageUrl);
    }
    urls = [...new Set(urls)];
    if (!urls.length) return;
    for (const u of urls) {
      try {
        await startDownload({
          url: u,
          referer: pageUrl,
          title: (tab && tab.title) || "",
          quality: "best",
          pageUrl,
          single: false
        }, { tab });
      } catch (_) {}
    }
    return;
  }

  if (id !== "noevfx-download-best") return;
  const target = info.srcUrl || info.linkUrl || info.pageUrl || pageUrl;
  if (!/^https?:/i.test(target)) return;
  try {
    await startDownload({
      url: target,
      referer: pageUrl,
      title: (tab && tab.title) || "",
      quality: "best",
      pageUrl
    }, { tab });
  } catch (_) {}
});

/* Pré-carrega configuração quando o service worker acorda */
getConfig().catch(() => {});
