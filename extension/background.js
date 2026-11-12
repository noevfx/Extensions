/* ============================================================================
   NOÉ VFX Downloader — Service Worker v3.0  (noevfx.com)
   - Detecção persistente (sobrevive à suspensão do service worker)
   - Badge vermelho com número branco = vídeos encontrados na aba
   - Fila de downloads individuais e "baixar todos"
   ========================================================================== */
"use strict";

const SERVER = "http://127.0.0.1:8765";
const HDRS = { "Content-Type": "application/json", "X-NoeVFX-Client": "1" };
const MAX_STREAMS = 80;
const SESSION = chrome.storage && chrome.storage.session;

const DEFAULT_CONFIG = {
  output_dir: "",
  hover_action: "menu",        // "menu" = confirmar pasta | "direct" = salvar direto
  default_quality: "best",
  use_cookies: true,
  organize_by_site: false,
  fab_enabled: true,           // ícone flutuante sobre os vídeos
  onboarded: false
};

const IGNORE_RE = /\.(ts|m4s|m4f|aac|vtt|srt|jpg|jpeg|png|gif|webp|avif|svg|css|js|json|woff2?|ico|txt|xml)(\?|#|$)|doubleclick|googlesyndication|adsystem|scorecardresearch|googletagmanager|google-analytics|adservice|pubmatic|rubiconproject/i;

/* ---------------------------------------------------------------- util ---- */
const now = () => Date.now();

async function fetchJson(url, opts = {}, timeout = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal, cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(t);
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

/* Agrupa variantes de qualidade do MESMO vídeo (uma pasta = um vídeo). */
function groupKey(url) {
  try {
    const u = new URL(url);
    let p = u.pathname;
    if (/\.(m3u8|mpd)$/i.test(p)) p = p.replace(/\/[^/]*$/, "");
    return u.hostname + p;
  } catch (_) {
    return url;
  }
}

/* ------------------------------------------------------- store por aba ---- */
const MEM = new Map();          // tabId -> [streams]
const THUMB = new Map();        // tabId -> thumb da página
const PAGE_TITLE = new Map();   // tabId -> título
const dirty = new Set();
let flushTimer = null;
let badgeTimer = null;

function sessionGet(key) {
  return new Promise((res) => {
    if (!SESSION) return res({});
    try {
      SESSION.get(key).then((r) => res(r || {})).catch(() => res({}));
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
    ids.forEach((id) => (patch["t" + id] = MEM.get(id) || []));
    try { await SESSION.set(patch); } catch (_) {}
  }, 250);
}

async function hydrate(tabId) {
  const key = "t" + tabId;
  const r = await sessionGet(key);
  const seed = r[key];
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

function scheduleBadge(tabId) {
  if (badgeTimer) return;
  badgeTimer = setTimeout(() => {
    badgeTimer = null;
    MEM.forEach((_v, id) => paintBadge(id));
  }, 120);
}

function paintBadge(tabId) {
  const list = MEM.get(tabId) || [];
  const n = new Set(list.map((x) => x.group || groupKey(x.url))).size;
  const apply = (obj) => {
    try { chrome.action[obj.fn]({ tabId, ...obj.arg }).catch(() => {}); } catch (_) {}
  };
  apply({ fn: "setBadgeBackgroundColor", arg: { color: "#E01B24" } });
  apply({ fn: "setBadgeTextColor", arg: { color: "#FFFFFF" } });
  apply({ fn: "setBadgeText", arg: { text: n ? String(n) : "" } });
}

function addStream(tabId, url, kind, extra) {
  if (tabId == null || tabId < 0 || !url) return;
  if (!/^https?:/i.test(url)) return;
  if (IGNORE_RE.test(url)) return;

  const list = listOf(tabId);
  const hit = list.find((x) => x.url === url);
  if (hit) {
    let changed = false;
    if (extra && extra.thumb && !hit.thumb) { hit.thumb = extra.thumb; changed = true; }
    if (extra && extra.title && !hit.title) { hit.title = extra.title; changed = true; }
    if (changed) scheduleFlush(tabId);
    return;
  }

  const item = {
    url,
    kind: kind || classify(url),
    group: groupKey(url),
    ts: now(),
    thumb: (extra && extra.thumb) || THUMB.get(tabId) || "",
    title: (extra && extra.title) || PAGE_TITLE.get(tabId) || ""
  };
  list.unshift(item);
  if (list.length > MAX_STREAMS) list.length = MAX_STREAMS;
  scheduleFlush(tabId);
  scheduleBadge(tabId);
}

function setThumb(tabId, thumb, title) {
  if (!thumb || tabId == null || tabId < 0) return;
  if (THUMB.get(tabId) === thumb && (!title || PAGE_TITLE.get(tabId) === title)) return;
  THUMB.set(tabId, thumb);
  if (title) PAGE_TITLE.set(tabId, title);
  const list = listOf(tabId);
  let changed = false;
  list.forEach((x) => {
    if (!x.thumb) { x.thumb = thumb; changed = true; }
    if (title && !x.title) { x.title = title; changed = true; }
  });
  if (changed) scheduleFlush(tabId);
}

function clearTab(tabId) {
  MEM.delete(tabId);
  THUMB.delete(tabId);
  PAGE_TITLE.delete(tabId);
  try { SESSION.remove("t" + tabId).catch(() => {}); } catch (_) {}
  paintBadge(tabId);
}

/* ------------------------------------------------------- sniffer de rede -- */
chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.tabId < 0) return;
    addStream(d.tabId, d.url, null, null);
  },
  { urls: ["*://*/*.m3u8*", "*://*/*.mpd*", "*://*/*.mp4*", "*://*/*.webm*", "*://*/*.m4v*", "*://*/*.mov*", "*://*/*.m4a*"] }
);

chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.tabId < 0) return;
    addStream(d.tabId, d.url, null, null);
  },
  { urls: ["<all_urls>"], types: ["media"] }
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
    throw new Error("bad");
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

function broadcastConfig() {
  try {
    chrome.tabs.query({}).then((tabs) => {
      tabs.forEach((t) => {
        if (t.id == null) return;
        try {
          chrome.tabs.sendMessage(t.id, { type: "CONFIG_CHANGED" }, () => {
            if (chrome.runtime.lastError) { /* aba sem content script */ }
          });
        } catch (_) {}
      });
    }).catch(() => {});
  } catch (_) {}
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
      const pref = c.httpOnly ? "#HttpOnly_" : "";
      const sub = c.hostOnly ? "FALSE" : "TRUE";
      const exp = c.expirationDate ? Math.floor(c.expirationDate) : Math.floor(now() / 1000) + 86400 * 30;
      lines.push(`${pref}${c.domain}\t${sub}\t${c.path}\t${c.secure ? "TRUE" : "FALSE"}\t${exp}\t${c.name}\t${c.value}`);
    }
  }
  return lines.length > 1 ? lines.join("\n") + "\n" : "";
}

/* -------------------------------------------------------------- downloads - */
async function startDownload(payload, sender) {
  const cfg = await getConfig();
  const tabId = sender && sender.tab ? sender.tab.id : undefined;
  const pageUrl = payload.pageUrl || (sender && sender.tab ? sender.tab.url : "") || "";
  const list = tabId != null ? listOf(tabId) : [];
  const best = payload.fallbackStream || (list[0] ? list[0].url : "");
  const useCookies = payload.useCookies !== false && cfg.use_cookies !== false;

  const cookies = useCookies ? await cookieTxt([payload.url, pageUrl]) : "";

  const body = {
    url: payload.url,
    fallbackStream: payload.fallbackStream || (payload.url === pageUrl ? best : ""),
    referer: payload.referer || pageUrl,
    userAgent: payload.userAgent || navigator.userAgent,
    quality: payload.quality || cfg.default_quality || "best",
    title: payload.title || (tabId != null ? PAGE_TITLE.get(tabId) : "") || "",
    cookies,
    outputDir: cfg.output_dir || "",
    organizeBySite: !!cfg.organize_by_site,
    single: payload.single !== false
  };

  const r = await fetchJson(SERVER + "/download", {
    method: "POST",
    headers: HDRS,
    body: JSON.stringify(body)
  }, 15000);

  if (!r.ok || !r.data || !r.data.job_id) {
    return { ok: false, error: (r.data && r.data.error) || "Servidor local offline" };
  }
  return { ok: true, job_id: r.data.job_id, output_dir: r.data.output_dir || cfg.output_dir };
}

/* Mensagens */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const run = async () => {
    switch (msg && msg.type) {
      case "DOM_MEDIA_FOUND": {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (tabId == null) return { ok: false };
        if (msg.thumb) setThumb(tabId, msg.thumb, msg.title);
        if (Array.isArray(msg.items)) msg.items.forEach((it) => addStream(tabId, it.url, it.kind, it));
        return { ok: true, count: listOf(tabId).length };
      }

      case "PAGE_THUMB": {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (tabId != null) setThumb(tabId, msg.thumb, msg.title);
        return { ok: true };
      }

      case "GET_TAB_STREAMS": {
        const tabId = msg.tabId;
        if (!MEM.has(tabId)) {
          MEM.set(tabId, []);
          await hydrate(tabId);
        }
        return {
          ok: true,
          streams: listOf(tabId).slice(),
          thumb: THUMB.get(tabId) || "",
          title: PAGE_TITLE.get(tabId) || ""
        };
      }

      case "RESCAN_TAB": {
        const tabId = msg.tabId;
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
        return { ok: true, streams: listOf(tabId).slice(), added: res && res.items ? res.items.length : 0 };
      }

      case "CLEAR_TAB": {
        clearTab(msg.tabId);
        return { ok: true };
      }

      case "GET_CONFIG":
        return { ok: true, config: await getConfig(!!msg.force), offline: !!CFG_ERR };

      case "SAVE_CONFIG": {
        try {
          const cfg = await saveConfig(msg.patch || {});
          try { await chrome.storage.local.set({ cfg }); } catch (_) {}
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
            body: JSON.stringify({ path: msg.path || "" })
          }, 8000);
          return { ok: r.ok, data: r.data };
        } catch (_) {
          return { ok: false };
        }
      }

      case "HEALTH": {
        try {
          const r = await fetchJson(SERVER + "/health", { headers: HDRS }, 4000);
          return { ok: true, data: r.data };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }

      case "DOWNLOAD":
        try {
          return await startDownload(msg, sender);
        } catch (e) {
          return { ok: false, error: String(e && e.message ? e.message : e) };
        }

      case "DOWNLOAD_MANY": {
        const urls = Array.isArray(msg.urls) ? msg.urls.slice(0, 30) : [];
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
          const r = await fetchJson(SERVER + "/status?id=" + encodeURIComponent(msg.jobId), { headers: HDRS }, 5000);
          return { ok: true, data: r.data };
        } catch (_) {
          return { ok: false };
        }
      }

      case "THUMB": {
        if (!msg.url) return { ok: false };
        try {
          const u =
            SERVER + "/thumb?url=" + encodeURIComponent(msg.url) +
            "&referer=" + encodeURIComponent(msg.referer || "") +
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
      title: "Baixar na qualidade nativa — NOÉ VFX",
      contexts: ctx
    });
    chrome.contextMenus.create({
      id: "noevfx-download-all",
      title: "Baixar TODOS os vídeos desta página",
      contexts: ctx
    });
    chrome.contextMenus.create({ id: "noevfx-sep1", type: "separator", contexts: ctx });
    chrome.contextMenus.create({
      id: "noevfx-icon-on", type: "radio",
      title: "Ícone nos vídeos: ativado", checked: on, contexts: ctx
    });
    chrome.contextMenus.create({
      id: "noevfx-icon-off", type: "radio",
      title: "Ícone nos vídeos: desativado", checked: !on, contexts: ctx
    });
    chrome.contextMenus.create({ id: "noevfx-sep2", type: "separator", contexts: ctx });
    chrome.contextMenus.create({
      id: "noevfx-open-folder",
      title: "Abrir pasta de downloads",
      contexts: ctx
    });
    chrome.contextMenus.create({
      id: "noevfx-options",
      title: "Configurações (pasta padrão)…",
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
