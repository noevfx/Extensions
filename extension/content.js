/* ============================================================================
   Noe VFX Downloader — Content Script v3.0  (noevfx.com)
   - Ícone flutuante sobre QUALQUER <video> (Shadow DOM, sem conflito)
   - Arrastável dentro da área do vídeo (posição salva por site)
   - Some sozinho após 2 s com o mouse parado
   - Liga/desliga pelo cartão do vídeo, pelo popup ou pelo botão direito
   ========================================================================== */
(() => {
  "use strict";
  if (window.__noevfxV3) return;
  window.__noevfxV3 = true;

  const t = (k, ...s) => (globalThis.__nvfT ? globalThis.__nvfT(k, ...s) : k);

  const BRAND_SVG = `<svg viewBox="0 0 722.36 722.36" width="20" height="20" aria-hidden="true">
    <rect fill="#0066FF" width="722.36" height="722.36" rx="102.3" ry="102.3"/>
    <path fill="#FFFFFF" d="M550.64,561.37H168.59c-4.19,0-7.59-3.4-7.59-7.59V171.73l389.63,389.63ZM553.77,161H171.72l389.63,389.63V168.58c0-4.17-3.39-7.59-7.59-7.59Z"/>
  </svg>`;

  const FAB_SIZE = 40;

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Segoe UI", Roboto, system-ui, -apple-system, sans-serif; }
    .fab {
      position: fixed; z-index: 2147483647; display: none;
      width: 40px; height: 40px; padding: 0; border: 1px solid rgba(0,102,255,.65);
      border-radius: 12px; background: rgba(10,12,18,.86);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 6px 20px rgba(0,0,0,.45);
      align-items: center; justify-content: center; cursor: grab;
      touch-action: none; user-select: none;
      transition: background .12s ease, border-color .12s ease;
    }
    .fab:hover { background: #0066FF; border-color: #4d94ff; }
    .fab svg { width: 22px; height: 22px; display: block; pointer-events: none; }
    .panel {
      position: fixed; z-index: 2147483647; display: none; width: 268px;
      padding: 10px; border-radius: 14px; border: 1px solid rgba(0,102,255,.35);
      background: rgba(15,17,23,.97); color: #f3f4f8;
      box-shadow: 0 14px 40px rgba(0,0,0,.6);
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      font-size: 12px; line-height: 1.35;
    }
    .panel .head { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
    .panel .head b { font-size: 12.5px; font-weight: 700; letter-spacing:.2px; }
    .panel .head span.brand { color:#4d94ff; font-size:10px; font-weight:700; letter-spacing:.6px; text-transform:uppercase; }
    .panel .dest {
      display:flex; align-items:center; gap:6px; padding:6px 8px; margin-bottom:8px;
      border-radius:8px; background: rgba(0,102,255,.12); border:1px solid rgba(0,102,255,.22);
      font-size:10.5px; color:#c9d3e8;
    }
    .panel .dest .path { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; text-align:left; }
    .panel .dest button {
      all: unset; cursor:pointer; color:#7fb0ff; font-size:10.5px; font-weight:700; white-space:nowrap;
    }
    .panel .grid { display:grid; grid-template-columns: 1fr 1fr; gap:6px; }
    .panel button.opt {
      all: unset; display:flex; align-items:center; justify-content:center; gap:6px;
      padding:8px 6px; border-radius:9px; cursor:pointer; font-size:11.5px; font-weight:600;
      background:#1b2030; color:#eef2fb; border:1px solid #2a3348; text-align:center;
    }
    .panel button.opt:hover { background:#0066FF; border-color:#0066FF; color:#fff; }
    .panel button.opt.main { grid-column: span 2; background:#0066FF; border-color:#0066FF; color:#fff; font-size:12.5px; }
    .panel button.opt.main:hover { background:#0052cc; }
    .panel .all { margin-top:8px; }
    .panel .all button {
      all: unset; display:block; width:100%; text-align:center; cursor:pointer;
      padding:7px; border-radius:9px; font-size:11px; font-weight:700;
      color:#9fc0ff; border:1px dashed rgba(0,102,255,.45);
    }
    .panel .all button:hover { background: rgba(0,102,255,.16); }
    .panel .compat {
      display:flex; align-items:center; gap:7px; margin-top:9px; font-size:10.5px; color:#b3bdd1; cursor:pointer; user-select:none;
    }
    .panel .compat input { width:14px; height:14px; margin:0; accent-color:#0066ff; cursor:pointer; }
    .panel .compat:hover { color:#fff; }
    .panel .foot {
      display:flex; align-items:center; justify-content:space-between; gap:8px;
      margin-top:9px; padding-top:8px; border-top:1px solid rgba(255,255,255,.08);
      font-size:10px; color:#8d98ae;
    }
    .panel .foot .hint { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .panel button.tgl {
      all: unset; cursor:pointer; padding:3px 8px; border-radius:7px; font-size:9.5px;
      font-weight:800; letter-spacing:.5px; white-space:nowrap;
      background: rgba(0,102,255,.18); color:#7fb0ff; border:1px solid rgba(0,102,255,.4);
    }
    .panel button.tgl.off { background: rgba(255,255,255,.06); color:#8892a8; border-color: rgba(255,255,255,.14); }
    .toast {
      position: fixed; z-index: 2147483647; left: 50%; bottom: 26px; transform: translateX(-50%);
      display:none; max-width: min(440px, 88vw); padding:9px 14px; border-radius: 999px;
      background: rgba(12,15,22,.96); color:#fff; font-size:12px; font-weight:600;
      border:1px solid rgba(0,102,255,.5); box-shadow:0 10px 30px rgba(0,0,0,.55);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .toast.err { border-color: rgba(239,68,68,.65); }
    .toast.ok { border-color: rgba(16,185,129,.6); }
    .fab:focus-visible, .panel button:focus-visible { outline: 2px solid #7fb0ff; outline-offset: 2px; }
  `;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const state = {
    cfg: null,
    host: null,
    root: null,
    fab: null,
    panel: null,
    toastEl: null,
    toastT: 0,
    video: null,
    hideT: 0,
    idleT: 0,
    panelOpen: false,
    lastMove: 0,
    thumb: "",
    sent: new Map(),            // url -> assinatura (miniatura? prioridade): reenvia quando algo MUDA
    busy: false,
    pos: null,
    dragMoved: false,
    dragging: false,
    posLoaded: false,
    posReady: false      // só grava a posição padrão depois de ler a salva (senão sobrescreveria)
  };

  const sigOf = (it) => (it.thumb ? 1 : 0) + "|" + (it.pri || 0) + (it.kind === "Pinterest" ? "|" + it.title : "");     // Pinterest: o nome chega depois (API do pin)
  const isYT = () => /(^|\.)youtube\.com$/.test(location.hostname);
  const isIG = () => /(^|\.)instagram\.com$/.test(location.hostname);
  const isFB = () => /(^|\.)facebook\.com$/.test(location.hostname);
  // CDNs do Instagram/Facebook entregam o vídeo em pedaços (video-only / audio-only): nunca servem como arquivo
  const FRAG_HOST_RE = /(^|\.)(cdninstagram\.com|fbcdn\.net|tiktokcdn(-us|-eu)?\.com|tiktokv\.com|tiktok\.com|byteoversea\.com|ibytedtos\.com|ttwstatic\.com|tiktokw\.us|ibyteimg\.com|twimg\.com|pinimg\.com)$/i;
  const isTT = () => /(^|\.)tiktok\.com$/.test(location.hostname);
  const isX = () => /(^|\.)(x|twitter)\.com$/.test(location.hostname);
  const fabOn = () => !state.cfg || state.cfg.fab_enabled !== false;

  /* -------------------------------------------------------------- mensagens */
  function sendMsg(payload, timeout = 25000) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        resolve(v || { ok: false });
      };
      const t = setTimeout(() => finish({ ok: false, timeout: true }), timeout);
      try {
        chrome.runtime.sendMessage(payload, (r) => {
          clearTimeout(t);
          finish(r);
        });
      } catch (_) {
        clearTimeout(t);
        finish({ ok: false });
      }
    });
  }

  async function loadCfg() {
    const r = await sendMsg({ type: "GET_CONFIG" });
    if (r && r.config) state.cfg = r.config;
    if (!fabOn()) hideFab();
    return state.cfg;
  }

  /* -------------------------------------------------- posição salva (por site) */
  function loadPos() {
    if (state.posLoaded) return;
    state.posLoaded = true;
    try {
      chrome.storage.local.get("fabPos", (res) => {
        const map = (res && res.fabPos) || {};
        const p = map[location.hostname];
        if (Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1])) state.pos = p;
        state.posReady = true;
      });
    } catch (_) { state.posReady = true; }
  }

  function savePos() {
    if (!state.video || !state.fab) return;
    const vr = state.video.getBoundingClientRect();
    const fr = state.fab.getBoundingClientRect();
    const availW = Math.max(1, vr.width - FAB_SIZE);
    const availH = Math.max(1, vr.height - FAB_SIZE);
    persistPos([
      Math.min(1, Math.max(0, (fr.left - vr.left) / availW)),
      Math.min(1, Math.max(0, (fr.top - vr.top) / availH))
    ]);
  }

  function persistPos(pos) {
    state.pos = pos;
    try {
      chrome.storage.local.get("fabPos", (res) => {
        const map = (res && res.fabPos) || {};
        map[location.hostname] = pos;
        chrome.storage.local.set({ fabPos: map });
      });
    } catch (_) {}
  }

  /* -------------------------------------------------------------- utilidades */
  const folderName = (p) => {
    if (!p) return t("folderLabel");
    const parts = String(p).split(/[\\/]+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : p;
  };

  function ytId() {
    if (!isYT()) return "";
    const p = new URLSearchParams(location.search).get("v");
    if (p && /^[\w-]{6,}$/.test(p)) return p;
    const m = location.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{6,})/);      // Shorts, lives e embeds
    return m ? m[1] : "";
  }

  /* Instagram: cada vídeo é baixado pela URL do POST (yt-dlp), não pelos pedaços de rede do CDN.
     Procura o link do post (/p/, /reel/, /tv/) subindo a partir do <video>; no feed, o mais próximo é o do próprio post. */
  const IG_POST_RE = /^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]{5,})/;
  function igPostUrl(v) {
    const toUrl = (m) => `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/`;
    const BAD = new Set(["audio", "explore", "tagged", "saved", "liked_by"]);       // /reels/audio/123/ é a página do áudio, não o post
    const find = (root) => {
      // 1º o link da DATA do post (<time>), que é sempre o do próprio post; depois qualquer link de post válido
      const t = root.querySelector("time");
      const ta = t && t.closest("a");
      const cands = [ta, ...root.querySelectorAll('a[href*="/p/"],a[href*="/reel/"],a[href*="/reels/"],a[href*="/tv/"]')].filter(Boolean);
      for (const a of cands) {
        const m = new URL(a.getAttribute("href"), location.href).pathname.match(IG_POST_RE);
        if (m && !BAD.has(m[2])) return toUrl(m);
      }
      return "";
    };
    try {
      // o <video> fica dezenas de níveis dentro do <article> do post (ou do diálogo do post aberto): procura nele todo
      const box = v.closest && (v.closest("article") || v.closest('[role="dialog"]'));
      if (box) { const u = find(box); if (u) return u; }
      for (let el = v, d = 0; el && el !== document.body && d < 30; el = el.parentElement, d++) {
        const u = find(el);
        if (u) return u;
      }
      const m = location.pathname.match(IG_POST_RE);
      if (m) return toUrl(m);
      if (/^\/stories\//.test(location.pathname)) return location.origin + location.pathname;
    } catch (_) {}
    return "";
  }

  /* Facebook: o vídeo vem em pedaços de fbcdn.net (video e áudio separados). Baixa-se pelo link do VÍDEO/REEL do post
     (/pagina/videos/ID, /reel/ID, /watch/?v=ID, /share/v/CÓDIGO...), que o yt-dlp resolve com áudio e vídeo juntos. */
  function fbCandidate(href) {
    let u;
    try { u = new URL(href, location.href); } catch (_) { return null; }
    if (!/(^|\.)facebook\.com$/.test(u.hostname)) return null;
    const p = u.pathname;
    let m;
    if ((m = p.match(/^\/reel\/(\d+)/))) return { rank: 1, url: `https://www.facebook.com/reel/${m[1]}` };
    if ((m = p.match(/^\/(?:[^/]+\/)*videos\/(?:[^/]+\/)?(\d{8,})/))) return { rank: 1, url: `https://www.facebook.com${p.replace(/\/$/, "")}` };
    if (/^\/watch\/?$/.test(p) && u.searchParams.get("v")) return { rank: 1, url: `https://www.facebook.com/watch/?v=${u.searchParams.get("v")}` };
    if ((m = p.match(/^\/share\/[vr]\/([\w-]+)/))) return { rank: 1, url: `https://www.facebook.com${m[0]}/` };
    if (/^\/video\.php$/.test(p) && u.searchParams.get("v")) return { rank: 1, url: `https://www.facebook.com/watch/?v=${u.searchParams.get("v")}` };
    if (/^\/[^/]+\/posts\/[\w-]{6,}/.test(p)) return { rank: 2, url: `https://www.facebook.com${p.replace(/\/$/, "")}` };
    if (/^\/permalink\.php$/.test(p) && u.searchParams.get("story_fbid")) return { rank: 2, url: `https://www.facebook.com/permalink.php?story_fbid=${u.searchParams.get("story_fbid")}&id=${u.searchParams.get("id") || ""}` };
    return null;
  }

  function fbVideoUrl(v) {
    const best = (root) => {
      let b = null;
      root.querySelectorAll("a[href]").forEach((a) => {
        const c = fbCandidate(a.getAttribute("href"));
        if (c && (!b || c.rank < b.rank)) b = c;
      });
      return b ? b.url : "";
    };
    try {
      const box = v.closest && (v.closest('[role="article"]') || v.closest('[role="dialog"]'));
      if (box) { const u = best(box); if (u) return u; }
      const here = fbCandidate(location.href);                        // página do próprio vídeo / reel / watch
      if (here) return here.url;
      for (let el = v, d = 0; el && el !== document.body && d < 30; el = el.parentElement, d++) {
        const u = best(el);
        if (u) return u;
      }
    } catch (_) {}
    return "";
  }

  function fbTitle(v) {
    try {
      const box = v.closest('[role="article"]');
      const h = box && box.querySelector("h2, h3, h4");
      const t = h ? h.innerText.replace(/\s+/g, " ").trim().slice(0, 80) : "";
      if (t) return t + " - Facebook";
    } catch (_) {}
    return document.title;
  }

  /* X/Twitter: o vídeo vem em pedaços de video.twimg.com (um pedaço de 1 KB não toca). Baixa-se pelo link do TWEET
     (/usuario/status/ID): o yt-dlp resolve, junta vídeo e áudio e pega todos os vídeos do tweet. */
  const X_STATUS_RE = /^\/(\w{1,30})\/status\/(\d{5,})/;
  function xTweetUrl(v) {
    const toUrl = (m) => `https://x.com/${m[1]}/status/${m[2]}`;
    try {
      const art = v.closest && v.closest("article");
      if (art) {
        // o link da DATA do tweet é sempre o do próprio tweet (os outros links do cartão levam a /analytics, /photo/1...)
        const t = art.querySelector("time");
        const ta = t && t.closest("a");
        const cands = [ta, ...art.querySelectorAll('a[href*="/status/"]')].filter(Boolean);
        for (const a of cands) {
          const m = new URL(a.getAttribute("href"), location.href).pathname.match(X_STATUS_RE);
          if (m) return toUrl(m);
        }
      }
      const m = location.pathname.match(X_STATUS_RE);          // página do próprio tweet
      if (m) return toUrl(m);
    } catch (_) {}
    return "";
  }

  function xTitle(v) {
    try {
      const art = v.closest("article");
      const nm = art && art.querySelector('[data-testid="User-Name"]');
      const tx = art && art.querySelector('[data-testid="tweetText"]');
      const user = nm ? nm.innerText.split("\n")[0].trim() : "";
      const text = tx ? tx.innerText.replace(/\s+/g, " ").trim().slice(0, 70) : "";
      if (user || text) return ((user ? user + " - " : "") + (text || "X")).slice(0, 110);
    } catch (_) {}
    return document.title;
  }

  /* Pinterest: o vídeo do pin chega por blob:/HLS e a página carrega dezenas de vídeos de pins RELACIONADOS (antes todos viravam
     itens iguais, "Pin em ...", sem miniatura). Agora cada pin é UM item, com o link do PIN (/pin/ID/): o servidor resolve todos os
     vídeos dele (carrossel com vários vídeos incluso). Nome e miniatura vêm da API do próprio Pinterest (mesma origem). */
  const isPin = () => /(^|\.)pinterest\.[a-z.]+$/.test(location.hostname);
  const PIN_PATH_RE = /^\/pin\/(\d{6,})/;
  const PIN_LINK_RE = /^\/pin\/(\d{6,})\/?$/;
  const pinCache = new Map();          // id -> null (buscando) | {n, title, thumb} | "-" (sem vídeo / falhou)
  function pinInfo(id) {
    if (pinCache.has(id)) return pinCache.get(id);
    pinCache.set(id, null);
    const q = encodeURIComponent(JSON.stringify({ options: { id, field_set_key: "unauth_react_main_pin" } }));
    fetch("/resource/PinResource/get/?data=" + q, {
      credentials: "include",
      headers: { Accept: "application/json", "X-Pinterest-PWS-Handler": "www/[username]/[slug].js", "X-Requested-With": "XMLHttpRequest" },
    })
      .then((r) => r.json())
      .then((j) => {
        const d = (j && j.resource_response && j.resource_response.data) || {};
        const lists = [];
        const add = (vid, img) => { const vl = vid && vid.video_list; if (vl && Object.keys(vl).length) lists.push({ vl, img }); };
        add(d.videos, d.images);
        ((d.carousel_data && d.carousel_data.carousel_slots) || []).forEach((s) => add(s.videos, s.images));
        ((d.story_pin_data && d.story_pin_data.pages) || []).forEach((p) => (p.blocks || []).forEach((b) => add(b.video, null)));
        const pick = (o) => { const k = o && (o["736x"] || o["474x"] || o["564x"] || o.orig); return k && /^https?:/i.test(k.url || "") ? k.url : ""; };
        let thumb = "";
        if (lists.length) {
          const first = lists[0];
          for (const k of Object.keys(first.vl)) { const th = first.vl[k] && first.vl[k].thumbnail; if (/^https?:/i.test(th || "")) { thumb = th; break; } }
          thumb = thumb || pick(first.img) || pick(d.images);
        }
        const title = String(d.seo_title || d.title || d.grid_title || "").split(" | ")[0].replace(/\s+/g, " ").trim().slice(0, 80);
        pinCache.set(id, lists.length ? { n: lists.length, title, thumb } : "-");
        publish(true);
      })
      .catch(() => { pinCache.set(id, "-"); publish(true); });
    return null;
  }

  // link do PIN de um <video>: o do próprio cartão (feed) ou o da página (pin aberto). Nunca procura fora do cartão: o pin aberto
  // também tem links /pin/ID/... que não são deste vídeo.
  // O vídeo do PIN ABERTO. No Pinterest logado ele nem sempre está dentro de CloseupMainPin (às vezes o bloco de "relacionados" envolve a
  // página toda, e o pôster não tem o código do vídeo): vale também o vídeo grande, que é o maior da página.
  function pinIsMain(v) {
    if (!PIN_PATH_RE.test(location.pathname)) return false;
    if (v.closest('[data-test-id="CloseupMainPin"], [data-test-id="story-pin-closeup"], [data-test-id="closeup-body-landscape"]')) return true;
    const r = v.getBoundingClientRect();
    if (r.width < 380) return false;
    const area = r.width * r.height;
    return [...document.querySelectorAll("video")].every((o) => { if (o === v) return true; const q = o.getBoundingClientRect(); return q.width * q.height <= area; });
  }

  function pinCardUrl(v) {
    try {
      if (pinIsMain(v)) {
        const m = location.pathname.match(PIN_PATH_RE);
        return m ? `https://www.pinterest.com/pin/${m[1]}/` : "";
      }
      const card = v.closest('[role="listitem"], [data-grid-item], [data-test-id="pin"], [data-test-id="pinWrapper"]');
      if (card) {
        for (const a of card.querySelectorAll('a[href*="/pin/"]')) {
          const m = new URL(a.getAttribute("href"), location.href).pathname.match(PIN_LINK_RE);
          if (m) return `https://www.pinterest.com/pin/${m[1]}/`;
        }
      }
      // layout sem cartão conhecido: sobe a partir do vídeo e pega o 1º link /pin/ID/ que apareça, parando quando o bloco
      // já tem mais de um vídeo (aí o link seria de outro cartão)
      for (let el = v.parentElement, d = 0; el && el !== document.body && d < 16; el = el.parentElement, d++) {
        if (el.querySelectorAll("video").length > 1) break;
        for (const a of el.querySelectorAll('a[href*="/pin/"]')) {
          const m = new URL(a.getAttribute("href"), location.href).pathname.match(PIN_LINK_RE);
          if (m) return `https://www.pinterest.com/pin/${m[1]}/`;
        }
      }
      const here = location.pathname.match(PIN_PATH_RE);
      if (here && !v.closest('[data-test-id="relatedPins"]') && !card) return `https://www.pinterest.com/pin/${here[1]}/`;
    } catch (_) {}
    return "";
  }

  // Cartão do feed SEM link de pin (o Pinterest não põe link quando você não está logado): o vídeo se reconhece pelo "hash" do
  // pôster, e o endereço do stream (o que o player pediu) o fundo da extensão guarda por esse mesmo hash.
  const pinHashCache = new Map();      // hash -> { url, at }
  function pinFeedUrl(v) {
    const u = pinCardUrl(v);
    if (u) return u;
    const m = String(v.poster || "").match(/([0-9a-f]{32})\.\d+\.jpe?g/i);
    if (!m) return "";
    const h = m[1].toLowerCase();
    const c = pinHashCache.get(h);
    if (c && c.url) return c.url;
    if (c && Date.now() - c.at < 2500) return "";
    pinHashCache.set(h, { url: "", at: Date.now() });
    sendMsg({ type: "PIN_STREAM", hash: h }, 4000).then((r) => {
      if (r && r.ok && r.url) { pinHashCache.set(h, { url: r.url, at: Date.now() }); publish(true); }
    });
    return "";
  }

  function pinTitle(url, fallback) {
    const m = String(url).match(/\/pin\/(\d+)/);
    const i = m && pinCache.get(m[1]);
    return (i && i !== "-" && i.title) || fallback;
  }

  /* TikTok: idem, o vídeo é baixado pela URL da página do vídeo (/@usuario/video/ID). */
  const TT_RE = /^\/(@[\w.]+)\/video\/(\d+)/;
  function ttPostUrl(v) {
    const toUrl = (m) => `https://www.tiktok.com/${m[1]}/video/${m[2]}`;
    try {
      let m = location.pathname.match(TT_RE);
      if (m) return toUrl(m);
      for (let el = v, d = 0; el && el !== document.body && d < 12; el = el.parentElement, d++) {
        for (const a of el.querySelectorAll('a[href*="/video/"]')) {
          m = new URL(a.getAttribute("href"), location.href).pathname.match(TT_RE);
          if (m) return toUrl(m);
        }
      }
    } catch (_) {}
    return "";
  }

  // miniatura do TikTok pelo oEmbed do próprio site (mesma origem): vem certa para CADA vídeo
  const ttCache = new Map();           // url -> link da miniatura | "-" (falhou) | "" (buscando)
  function ttThumb(url) {
    if (ttCache.has(url)) return ttCache.get(url);
    ttCache.set(url, "");
    fetch("/oembed?url=" + encodeURIComponent(url), { credentials: "omit" })
      .then((r) => r.json())
      .then((j) => {
        const u = j && /^https?:/i.test(j.thumbnail_url || "") ? j.thumbnail_url : "-";
        ttCache.set(url, u);
        if (location.href) publish(true);
      })
      .catch(() => { ttCache.set(url, "-"); publish(true); });
    return "";
  }

  function igTitle(v) {
    try {
      const box = (v.closest && (v.closest("article") || v.closest('[role="dialog"]'))) || document;
      for (const a of box.querySelectorAll('a[href^="/"]')) {
        if (/^\/[\w.]+\/$/.test(a.getAttribute("href")) && a.textContent.trim()) return a.textContent.trim().slice(0, 60) + " - Instagram";
      }
    } catch (_) {}
    return document.title;
  }

  function resolveBestPageOrVideoUrl(videoEl) {
    if (isYT()) {
      const v = ytId();
      return v ? `https://www.youtube.com/watch?v=${v}` : location.href;
    }
    if (videoEl) {
      const holder = videoEl.closest && videoEl.closest("[data-video-id]");
      if (holder) {
        const vid = holder.getAttribute("data-video-id");
        if (vid && /^\d+$/.test(vid)) return `https://globoplay.globo.com/v/${vid}/`;
      }
      const src = videoEl.currentSrc || videoEl.src ||
        (videoEl.querySelector && videoEl.querySelector("source") && videoEl.querySelector("source").src) || "";
      if (src && src.startsWith("http")) return src;
    }
    return location.href;
  }

  /* ------------------------------------------------------------------- thumb */
  function pageThumb() {
    const yt = ytId();
    if (yt) return `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
    const meta = document.querySelector(
      'meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"], link[rel="image_src"]'
    );
    if (meta) {
      const c = meta.content || meta.href;
      if (c && /^https?:/i.test(c)) return c;
    }
    const v = document.querySelector("video");
    if (v && v.poster && /^https?:/i.test(v.poster)) return v.poster;
    return "";
  }

  function frameOf(videoEl) {
    try {
      if (!videoEl.videoWidth || !videoEl.videoHeight) return "";
      if (videoEl.readyState < 2) return "";
      const w = 200;
      const h = Math.round((w * videoEl.videoHeight) / videoEl.videoWidth) || 112;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(videoEl, 0, 0, w, h);
      return c.toDataURL("image/jpeg", 0.62);
    } catch (_) {
      return "";
    }
  }

  /* ------------------------------------------------------------------- scan - */
  const MEDIA_RE = /\.(m3u8|mpd|mp4|webm|m4v|mov|flv|mkv)(\?|#|$)/i;

  // Lista de mídia vista na rede, mantida por um PerformanceObserver: o buffer
  // padrão do navegador guarda só 250 recursos e depois deixa de registrar.
  const netList = [];
  const netSet = new Set();
  function noteNet(name) {
    if (!name || netSet.has(name) || !MEDIA_RE.test(name)) return;
    if (/\/range\/prot\/|[?&](bytestart|byteend)=/i.test(name)) return;                      // pedido por faixa de bytes: um pedaço, não o vídeo
    if (/\/drm\/(cenc|widevine|playready|fairplay)/i.test(name)) return;                      // manifesto com DRM: ninguém baixa
    if (/(\/|[-_.])(segment|seg|frag|fragment|chunk|init)[-_\d]*\.(mp4|m4v|m4a|webm)(\?|#|$)/i.test(name)) return;   // pedaço de DASH/HLS: não toca sozinho
    netSet.add(name);
    netList.push(name);
    if (netList.length > 300) netSet.delete(netList.shift());
  }
  try {
    performance.getEntriesByType("resource").forEach((e) => noteNet(e.name));
    new PerformanceObserver((l) => l.getEntries().forEach((e) => noteNet(e.name)))
      .observe({ type: "resource", buffered: true });
  } catch (_) {}

  function scan() {
    let thumb = state.thumb;
    if (!thumb && !isIG() && !isTT()) {      // no Instagram cada vídeo tem a própria miniatura (a do og:image é a mesma para todos)
      thumb = pageThumb();
      if (!thumb) {
        try {
          const v = document.querySelector("video");
          if (v) thumb = frameOf(v);
        } catch (_) {}
      }
      if (thumb) state.thumb = thumb;
    }
    const items = [];
    const seen = new Set();
    const push = (url, kind, own, title, pri) => {
      if (!url || !/^https?:/i.test(url)) return;
      if (seen.has(url)) return;
      const pg = kind === "TikTok" || kind === "Instagram" || kind === "Facebook" || kind === "Vimeo" || kind === "Página" || kind === "X" || kind === "Pinterest";      // URL da PÁGINA do vídeo (yt-dlp)
      if (!pg) { try { if (FRAG_HOST_RE.test(new URL(url).hostname)) return; } catch (_) { return; } }
      seen.add(url);
      const it = { url, kind: kind || "Player", title: title || document.title };
      if (pg) it.pg = 1;
      if (pri) it.pri = pri;
      if (own) it.thumb = own;       // miniatura PRÓPRIA do vídeo (a da página vai uma vez só, no nível da mensagem)
      items.push(it);
    };

    for (let i = netList.length - 1; i >= 0 && i > netList.length - 240; i--) push(netList[i], "Rede");

    let vids = [];
    try { vidCacheAt = 0; vids = allVideos(); } catch (_) {}

    vids.forEach((v) => {
      const src = v.currentSrc || v.src ||
        (v.querySelector("source") && v.querySelector("source").src) || "";
      if (src && /^https?:/i.test(src)) {
        const own = frameOf(v) || (/^https?:/i.test(v.poster || "") ? v.poster : "");
        push(src, "HTML5", own);
      }
    });

    if (isIG()) {
      vids.forEach((v) => {
        const r = v.getBoundingClientRect();
        if (r.width < 120 || r.height < 120) return;
        const u = igPostUrl(v);
        const own = frameOf(v) || (/^https?:/i.test(v.poster || "") ? v.poster : "");
        if (u) push(u, "Instagram", own, igTitle(v), v.paused ? 1 : 2);        // sem miniatura ainda: entra assim e ganha a imagem depois
      });
    }
    if (/(^|\.)player\.vimeo\.com$/.test(location.hostname) && /^\/video\/\d+/.test(location.pathname)) {
      const v = vids.find((x) => x.getBoundingClientRect().width >= 150);
      if (v) push(location.href, "Vimeo", frameOf(v) || (/^https?:/i.test(v.poster || "") ? v.poster : ""), document.title, v.paused ? 1 : 2);
    }
    // Player com blob:/MSE (Vimeo e muitos outros) em site SEM tratamento próprio: não existe URL de arquivo para listar,
    // então o item é o endereço da PÁGINA (o yt-dlp resolve), com o quadro do próprio vídeo de miniatura.
    if (!isIG() && !isTT() && !isX() && !isYT() && !isFB() && !isPin() && !items.some((i) => i.kind === "Rede" || i.kind === "HTML5" || i.kind === "Globo/G1" || i.kind === "Embed")) {
      const bv = vids.find((v) => {
        const r = v.getBoundingClientRect();
        const src = v.currentSrc || v.src || "";
        return r.width >= 150 && r.height >= 90 && v.readyState >= 1 && (src === "" || /^blob:/i.test(src));
      });
      if (bv) push(location.href, "Página", frameOf(bv) || (/^https?:/i.test(bv.poster || "") ? bv.poster : ""), document.title, bv.paused ? 1 : 2);
    }
    if (isX()) {
      vids.forEach((v) => {
        const r = v.getBoundingClientRect();
        if (r.width < 120 || r.height < 120) return;
        const u = xTweetUrl(v);
        if (u) push(u, "X", frameOf(v) || (/^https?:/i.test(v.poster || "") ? v.poster : ""), xTitle(v), v.paused ? 1 : 2);
      });
    }
    if (isTT()) {
      vids.forEach((v) => {
        const r = v.getBoundingClientRect();
        if (r.width < 120 || r.height < 120) return;
        const u = ttPostUrl(v);
        if (!u) return;
        let own = frameOf(v) || (/^https?:/i.test(v.poster || "") ? v.poster : "");
        if (!own) {
          const c = ttThumb(u);
          if (c === "") return;                  // buscando a miniatura: entra quando chegar
          own = c === "-" ? "" : c;
        }
        push(u, "TikTok", own, document.title, v.paused ? 1 : 2);
      });
    }
    if (isFB()) {
      vids.forEach((v) => {
        const r = v.getBoundingClientRect();
        if (r.width < 120 || r.height < 120) return;
        const u = fbVideoUrl(v);
        if (u) push(u, "Facebook", frameOf(v) || (/^https?:/i.test(v.poster || "") ? v.poster : ""), fbTitle(v), v.paused ? 1 : 2);
      });
    }
    if (isPin()) {
      const pm = location.pathname.match(PIN_PATH_RE);
      const mainUrl = pm ? `https://www.pinterest.com/pin/${pm[1]}/` : "";
      if (mainUrl) {
        const info = pinInfo(pm[1]);
        const mv = vids.find((v) => pinIsMain(v));
        if (info && info !== "-") push(mainUrl, "Pinterest", info.thumb, (info.title || "Pinterest") + (info.n > 1 ? ` (${info.n} vídeos)` : ""), 2);
        else if (info === "-" && mv) push(mainUrl, "Pinterest", frameOf(mv) || (/^https?:/i.test(mv.poster || "") ? mv.poster : ""), document.title, 2);
      }
      vids.forEach((v) => {
        const r = v.getBoundingClientRect();
        if (r.width < 120 || r.height < 120) return;
        const u = pinFeedUrl(v);
        if (!u || u === mainUrl) return;
        const pid = u.match(/pinterest\.com\/pin\/(\d+)/);
        const info = pid ? pinInfo(pid[1]) : null;
        const own = frameOf(v) || (/^https?:/i.test(v.poster || "") ? v.poster : "") || (info && info !== "-" ? info.thumb : "");
        push(u, "Pinterest", own, pinTitle(u, pid ? "Pinterest" : t("pinVideo")), v.paused ? 1 : 2);
      });
    }

    try {
      document.querySelectorAll("[data-video-id]").forEach((el) => {
        const vid = el.getAttribute("data-video-id");
        if (!vid || !/^\d{7,}$/.test(vid)) return;       // 6 dígitos = transmissão ao vivo: baixa-se pelo HLS da rede
        // SÓ conta como vídeo DA PÁGINA o bloco que tem um <video> (player de verdade). Outros blocos com data-video-id
        // são cartões de "veja também" / outras matérias: listá-los fazia baixar um vídeo que não tem nada a ver.
        const pv = el.tagName === "VIDEO" ? el : el.querySelector("video");
        if (!pv) return;
        let own = frameOf(pv) || (/^https?:/i.test(pv.poster || "") ? pv.poster : "");
        const r = pv.getBoundingClientRect();
        const seen = r.width > 60 && r.height > 60 && r.bottom > 0 && r.top < innerHeight;
        const pri = !pv.paused && seen ? 2 : seen ? 1 : 0;
        if (!own) {                                        // vídeo ainda sem quadro: usa a imagem do próprio player
          const im = el.querySelector("img[src^='http']");
          if (im && im.naturalWidth > 100) own = im.src;
        }
        push(`https://globoplay.globo.com/v/${vid}/`, "Globo/G1", own, undefined, pri);
      });
    } catch (_) {}

    try {
      document.querySelectorAll("iframe[src]").forEach((f) => {
        const s = f.src || "";
        // players embutidos que o yt-dlp entende (o iframe é baixado com a página de fora como Referer)
        if (/youtube(-nocookie)?\.com\/embed\/|player\.vimeo\.com|dailymotion\.com\/embed|players?\.globo\.com|play\.hotmart\.com|hotmart\.com\/.*embed|fast\.wistia\.(net|com)|wistia\.(net|com)\/embed|players?\.vturb|pandavideo|jwplatform\.com|brightcove|kaltura|loom\.com\/embed|streamable\.com\/e\/|player\.twitch\.tv|vidyard|mediadelivery\.net\/embed|iframe\.mediadelivery/i.test(s)) {
          push(s, "Embed");
        }
      });
    } catch (_) {}

    // Página de vídeo do YouTube: o vídeo entra SEMPRE na lista (antes só entrava se a URL tivesse algo além de
    // "watch?v=...", e na URL limpa o popup ficava com "0 vídeos detectados" e sem miniatura).
    const yv = ytId();
    if (yv) push(`https://www.youtube.com/watch?v=${yv}`, "YouTube");

    return { items, thumb, count: items.length };
  }

  let sendT = 0;
  function publish(force) {
    if (!force && Date.now() - sendT < 1200) return;
    sendT = Date.now();
    const { items, thumb } = scan();
    const fresh = items.filter((it) => state.sent.get(it.url) !== sigOf(it));    // novo OU ganhou miniatura/prioridade
    if (thumb) state.thumb = thumb;
    if (!fresh.length && !thumb) return;
    fresh.forEach((it) => state.sent.set(it.url, sigOf(it)));
    sendMsg({ type: "DOM_MEDIA_FOUND", items: fresh, thumb, title: document.title });
  }

  /* ------------------------------------------------------------ shadow host */
  function ensureHost() {
    const parent = document.fullscreenElement || document.documentElement || document.body;
    if (!parent) return null;
    if (state.host && state.host.isConnected && state.host.parentNode === parent) return state.host;
    if (!state.host) {
      const host = document.createElement("div");
      host.id = "noevfx-hover-host";
      host.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
      // "closed": o JavaScript da página não enxerga nem mexe no painel, nos botões e nos avisos
      const root = host.attachShadow({ mode: "closed" });
      root.innerHTML = `<style>${STYLE}</style>
        <button class="fab" type="button" title="${esc(t("fabTitle"))}" aria-label="${esc(t("fabTitle"))}">${BRAND_SVG}</button>
        <div class="panel" role="dialog" aria-label="Noe VFX Downloader"></div>
        <div class="toast" role="status" aria-live="polite"></div>`;
      state.host = host;
      state.root = root;
      state.fab = root.querySelector(".fab");
      state.panel = root.querySelector(".panel");
      state.toastEl = root.querySelector(".toast");

      state.fab.addEventListener("pointerdown", onFabDown, true);
      state.fab.addEventListener("click", onFabClick, true);
      state.fab.addEventListener("mouseenter", () => { clearTimeout(state.idleT); clearTimeout(state.hideT); });
      state.fab.addEventListener("mouseleave", () => { scheduleHide(); armIdle(); });
      state.panel.addEventListener("mouseenter", () => { clearTimeout(state.idleT); clearTimeout(state.hideT); });
      state.panel.addEventListener("mouseleave", () => { scheduleHide(); armIdle(); });
    }
    try { parent.appendChild(state.host); } catch (_) {}
    return state.host;
  }

  document.addEventListener("fullscreenchange", () => {
    if (state.host) { try { ensureHost(); } catch (_) {} }
  });

  function place(videoEl) {
    if (!fabOn()) return false;
    const rect = videoEl.getBoundingClientRect();
    if (!rect || rect.width < 150 || rect.height < 90) return false;
    if (rect.bottom < 0 || rect.top > innerHeight) return false;
    if (!ensureHost()) return false;

    const f = state.fab;
    f.style.display = "inline-flex";
    f.style.width = `${FAB_SIZE}px`;
    f.style.height = `${FAB_SIZE}px`;

    const availW = Math.max(0, rect.width - FAB_SIZE);
    const availH = Math.max(0, rect.height - FAB_SIZE);

    // primeira vez: define a posição inicial e JÁ GRAVA, para o ícone nunca "pular" depois
    let pos = state.pos;
    if (!pos) {
      const dTop = rect.top + (isYT() ? 62 : 12);
      const dLeft = rect.right - FAB_SIZE - 12;
      pos = [
        Math.min(1, Math.max(0, (dLeft - rect.left) / Math.max(1, availW))),
        Math.min(1, Math.max(0, (dTop - rect.top) / Math.max(1, availH)))
      ];
      if (state.posReady) persistPos(pos);
    }

    let left = rect.left + pos[0] * availW;
    let top = rect.top + pos[1] * availH;

    // não deixa o ícone sair da tela (vídeo cortado/rolado)
    left = Math.min(Math.max(8, left), Math.max(8, innerWidth - FAB_SIZE - 8));
    top = Math.min(Math.max(8, top), Math.max(8, innerHeight - FAB_SIZE - 8));

    f.style.left = `${Math.round(left)}px`;
    f.style.top = `${Math.round(top)}px`;

    if (state.panelOpen) positionPanel(f.getBoundingClientRect());
    return true;
  }

  function positionPanel(anchor) {
    const p = state.panel;
    const w = 268;
    const gap = 8;
    const h = p.offsetHeight || 240;

    let l = anchor.left - w - gap;
    if (l < 8) l = anchor.right + gap;
    l = Math.max(8, Math.min(l, innerWidth - w - 8));

    let t = anchor.top;
    if (t + h > innerHeight - 8) t = innerHeight - h - 8;
    t = Math.max(8, t);

    p.style.left = `${Math.round(l)}px`;
    p.style.top = `${Math.round(t)}px`;
  }

  function scheduleHide() {
    clearTimeout(state.hideT);
    state.hideT = setTimeout(() => {
      if (state.panelOpen) return;
      if (state.fab && state.fab.matches(":hover")) return;
      hideFab();
    }, 700);
  }

  function armIdle() {
    clearTimeout(state.idleT);
    state.idleT = setTimeout(() => {
      if (state.panelOpen || state.dragging) return;
      if (state.fab && (state.fab.matches(":hover") || state.panel.matches(":hover"))) return;
      hideFab();
    }, 2000);
  }

  function hideFab() {
    if (state.fab) state.fab.style.display = "none";
  }

  function closePanel() {
    state.panelOpen = false;
    if (state.panel) state.panel.style.display = "none";
  }

  /* ------------------------------------------------------------------ drag -- */
  function onFabDown(e) {
    if (!e.isTrusted || e.button !== 0) return;      // evento fabricado pela página não vale
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(state.idleT);
    clearTimeout(state.hideT);

    const fab = state.fab;
    const startX = e.clientX;
    const startY = e.clientY;
    const fr = fab.getBoundingClientRect();
    const offX = e.clientX - fr.left;
    const offY = e.clientY - fr.top;

    state.dragging = true;
    state.dragMoved = false;
    fab.style.cursor = "grabbing";

    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!state.dragMoved && Math.abs(dx) + Math.abs(dy) < 4) return;
      state.dragMoved = true;

      const vr = state.video ? state.video.getBoundingClientRect() : null;
      let left = ev.clientX - offX;
      let top = ev.clientY - offY;
      if (vr) {
        const maxL = vr.left + Math.max(0, vr.width - FAB_SIZE);
        const maxT = vr.top + Math.max(0, vr.height - FAB_SIZE);
        left = Math.min(Math.max(vr.left, left), maxL);
        top = Math.min(Math.max(vr.top, top), maxT);
      }
      fab.style.left = `${Math.round(left)}px`;
      fab.style.top = `${Math.round(top)}px`;
    };

    const up = () => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      fab.style.cursor = "grab";
      state.dragging = false;
      if (state.dragMoved) savePos();
      armIdle();
      setTimeout(() => { state.dragMoved = false; }, 60);
    };

    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
  }

  /* ---------------------------------------------------------------- overlay  */
  document.addEventListener(
    "mouseover",
    (e) => {
      const t = e.target;
      if (!t || t.nodeType !== 1) return;
      const v = t.tagName === "VIDEO" ? t : (t.closest && t.closest("video"));
      if (!v) return;
      state.video = v;
      publish(false);
      if (!fabOn()) { hideFab(); return; }
      clearTimeout(state.hideT);
      loadPos();
      if (place(v)) armIdle();
      else hideFab();
    },
    true
  );

  let vidCache = [];
  let vidCacheAt = 0;
  function allVideos() {
    const n = Date.now();
    if (n - vidCacheAt < 700) return vidCache;
    vidCacheAt = n;
    const out = new Set(document.querySelectorAll("video"));
    try {
      // players feitos com web components escondem o <video> dentro de um shadowRoot aberto
      const walk = (root, depth) => {
        if (depth > 4) return;
        root.querySelectorAll("*").forEach((el) => {
          const sr = el.shadowRoot;
          if (!sr) return;
          sr.querySelectorAll("video").forEach((v) => out.add(v));
          walk(sr, depth + 1);
        });
      };
      walk(document, 0);
    } catch (_) {}
    vidCache = Array.from(out);
    return vidCache;
  }

  /* O <video> do Instagram (e de vários players) fica COBERTO por camadas: o mouse nunca "está sobre" o <video>.
     Por isso acha o vídeo pela POSIÇÃO do ponteiro, não pelo alvo do evento. */
  // O vídeo vertical (G1, Reels, Shorts) é uma faixa estreita dentro de um player largo: o resto é fundo preto do
  // container. A área "do vídeo" inclui essa moldura (o ancestral próximo que o contém e não é muito maior).
  function hitRect(v) {
    const r = v.getBoundingClientRect();
    const va = r.width * r.height;
    let box = r;
    let el = v.parentElement;
    for (let d = 0; el && d < 4; d++, el = el.parentElement) {
      const pr = el.getBoundingClientRect();
      const pa = pr.width * pr.height;
      if (pa > va * 5 || pr.width > innerWidth * 0.98) break;
      if (pr.left <= r.left + 1 && pr.right >= r.right - 1 && pr.top <= r.top + 1 && pr.bottom >= r.bottom - 1) box = pr;
    }
    return box;
  }

  function videoAt(x, y) {
    let best = null;
    let area = Infinity;
    allVideos().forEach((v) => {
      const r = v.getBoundingClientRect();
      if (r.width < 150 || r.height < 90) return;
      const h = hitRect(v);
      if (x < h.left || x > h.right || y < h.top || y > h.bottom) return;
      const a = h.width * h.height;
      if (a < area) { best = v; area = a; }
    });
    return best;
  }

  document.addEventListener(
    "mousemove",
    (e) => {
      if (state.dragging || !fabOn()) return;
      const n = Date.now();
      if (n - state.lastMove < 110) return;
      state.lastMove = n;
      if (e.target === state.host) return;

      const v = videoAt(e.clientX, e.clientY);
      if (!v) {
        if (state.video && !state.panelOpen) scheduleHide();
        return;
      }
      if (v !== state.video) {
        if (state.panelOpen) return;              // não troca de vídeo com o menu aberto
        state.video = v;
        publish(true);
      }
      clearTimeout(state.hideT);
      loadPos();
      if (!state.panelOpen) {
        if (place(v)) armIdle();
        else hideFab();
      }
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (e) => {
      const t = e.target;
      if (!t || t.nodeType !== 1) return;
      const v = t.tagName === "VIDEO" ? t : (t.closest && t.closest("video"));
      if (!v) return;
      if (e.relatedTarget === state.host) return;
      scheduleHide();
    },
    true
  );

  let scrollRaf = 0;
  window.addEventListener("scroll", () => {
    if (state.dragging || scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {       // no máximo 1 reposicionamento por quadro
      scrollRaf = 0;
      if (state.video && state.fab && state.fab.style.display === "inline-flex") {
        place(state.video);
        armIdle();
      }
    });
  }, { passive: true });

  // painel fecha ao clicar fora ou com Esc
  document.addEventListener("pointerdown", (e) => {
    if (state.panelOpen && e.target !== state.host) { closePanel(); scheduleHide(); }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.panelOpen) { closePanel(); scheduleHide(); }
  }, true);

  /* --------------------------------------------------------------- painel UI */
  function renderPanel() {
    const cfg = state.cfg || {};
    const dest = cfg.output_dir || "";
    const direct = cfg.hover_action === "direct";
    const quality = cfg.default_quality || "best";
    const on = cfg.fab_enabled !== false;

    state.panel.innerHTML = `
      <div class="head">
        ${BRAND_SVG}
        <b>${t("saveVideo")}</b>
        <span class="brand">NOÉ VFX</span>
      </div>
      <div class="dest">
        <span>📁</span>
        <span class="path" title="${esc(dest)}">${esc(dest ? folderName(dest) : t("folderLabel"))}</span>
        <button type="button" class="change">${t("change")}</button>
      </div>
      <div class="grid">
        <button type="button" class="opt main" data-q="${esc(quality)}">
          ${direct ? t("saveHere") : t("downloadDefault")}
        </button>
        <button type="button" class="opt" data-q="1080">1080p</button>
        <button type="button" class="opt" data-q="720">720p</button>
        <button type="button" class="opt" data-q="best">${t("native")}</button>
        <button type="button" class="opt" data-q="audio">${t("audioOnly")}</button>
      </div>
      <div class="all"><button type="button" class="all-btn">${t("allPage")}</button></div>
      <label class="compat" title="${esc(t("compatTip"))}"><input type="checkbox" data-compat ${cfg.compat_h264 === true ? "checked" : ""}><span>${t("compatShort")}</span></label>
      <div class="foot">
        <span class="hint">${t("dragHint")}</span>
        <button type="button" class="tgl ${on ? "" : "off"}" data-toggle>${on ? t("iconOn") : t("iconOff")}</button>
      </div>
    `;

    state.panel.querySelector(".change").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!e.isTrusted) return;
      try { chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }); } catch (_) {}
      closePanel();
    });

    state.panel.querySelectorAll("button[data-q]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!e.isTrusted) return;
        closePanel();
        hideFab();
        startOne(b.dataset.q);
      });
    });

    state.panel.querySelectorAll(".all-btn").forEach((b) => b.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!e.isTrusted) return;
      closePanel();
      hideFab();
      await startAll();
    }));

    state.panel.querySelector("[data-compat]").addEventListener("change", async (e) => {
      e.stopPropagation();
      if (!e.isTrusted) return;
      const r = await sendMsg({ type: "SAVE_CONFIG", patch: { compat_h264: e.target.checked } });
      if (r && r.ok && r.config) state.cfg = r.config;
      else e.target.checked = !e.target.checked;
    });
    state.panel.querySelector("[data-compat]").addEventListener("click", (e) => e.stopPropagation());

    state.panel.querySelector("[data-toggle]").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!e.isTrusted) return;
      const turningOn = !on;
      const r = await sendMsg({ type: "SAVE_CONFIG", patch: { fab_enabled: turningOn } });
      if (r && r.ok && r.config) state.cfg = r.config;
      if (!turningOn) {
        closePanel();
        hideFab();
        return;
      }
      renderPanel();
      const p = state.panel;
      p.style.display = "block";
      state.panelOpen = true;
      positionPanel(state.fab.getBoundingClientRect());
    });
  }

  function onFabClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.isTrusted) return;                        // clique sintético (da página) não baixa nada
    if (state.dragMoved) return;
    if (!fabOn()) return;

    const cfg = state.cfg || {};
    const wantsMenu = cfg.hover_action !== "direct" || e.altKey || e.shiftKey || e.ctrlKey || e.metaKey;
    if (!wantsMenu) {
      hideFab();
      startOne(cfg.default_quality || "best");
      return;
    }
    if (state.panelOpen) { closePanel(); return; }
    renderPanel();
    state.panelOpen = true;
    state.panel.style.display = "block";
    positionPanel(state.fab.getBoundingClientRect());
    publish(true);
  }

  /* --------------------------------------------------------------- downloads */
  function toast(text, kind, ms) {
    if (!ensureHost()) return;
    const t = state.toastEl;
    t.textContent = text;
    t.className = "toast" + (kind ? " " + kind : "");
    t.style.display = "block";
    clearTimeout(state.toastT);
    if (ms !== 0) state.toastT = setTimeout(() => { t.style.display = "none"; }, ms || 4200);
  }

  // HLS/DASH mais "mestre" que o player pediu (a playlist principal, não a de uma única qualidade "...-video=1320960.m3u8")
  function liveStream() {
    const hls = netList.filter((u) => /\.(m3u8|mpd)(\?|#|$)/i.test(u));
    if (!hls.length) return "";
    const master = hls.find((u) => !/[=_]\d+(-|\.)|-(video|audio)=|chunklist|\/(video|audio)_/i.test(u.split("?")[0].split("/").pop()));
    return master || hls[hls.length - 1];
  }

  async function startOne(quality) {
    if (state.busy) return;
    state.busy = true;
    const cfg = state.cfg || {};
    const page = location.href;
    const direct = (state.video && (state.video.currentSrc || state.video.src)) || "";
    let vids = 1;
    try { vids = document.querySelectorAll("video").length || 1; } catch (_) {}

    let primary = page;
    let fallback = "";
    const manyVideos = vids > 1;
    const igUrl = state.video ? (isIG() ? igPostUrl(state.video) : isTT() ? ttPostUrl(state.video) : isX() ? xTweetUrl(state.video) : isFB() ? fbVideoUrl(state.video) : isPin() ? pinFeedUrl(state.video) : "") : "";
    if (igUrl) primary = igUrl;
    else if (direct && /^https?:/i.test(direct) && !isYT()) {
      if (manyVideos) { primary = direct; fallback = page; }
      else { fallback = direct; }
    }
    const holder = !igUrl && state.video && state.video.closest ? state.video.closest("[data-video-id]") : null;
    const hid = holder ? holder.getAttribute("data-video-id") : "";
    if (!igUrl && hid && /^\d{7,}$/.test(hid)) {
      primary = `https://globoplay.globo.com/v/${hid}/`;      // o vídeo que o usuário apontou, não o 1º da página
      fallback = page;
    } else if (!igUrl && hid && /^\d+$/.test(hid)) {
      // id curto (6 dígitos) = AO VIVO: nem a URL do globoplay nem a da matéria servem; vale o HLS que o player pediu
      const live = liveStream();
      if (live) { primary = live; fallback = page; }
    } else if (primary === page && !igUrl) {
      const alt = resolveBestPageOrVideoUrl(state.video);
      if (alt && alt !== page) fallback = alt;
    }

    if (isIG() && !igUrl && !/^https:\/\/www\.instagram\.com\/(p|reel|reels|tv|stories)\//.test(primary)) {
      state.busy = false;
      toast(/^pt/i.test(navigator.language) ? "Instagram: não achei o link deste post. Clique na data do post (abre o post) e baixe de lá." : "Instagram: could not find this post's link. Click the post date to open it, then download from there.", "err", 7000);
      return;
    }
    if (isPin() && !igUrl) {                 // ainda procurando o stream (ele chega em instantes): tenta de novo antes de avisar
      await new Promise((x) => setTimeout(x, 1800));
      const again = state.video ? pinFeedUrl(state.video) : "";
      if (again) { state.busy = false; return startOne(quality); }
      state.busy = false;
      toast(/^pt/i.test(navigator.language) ? "Pinterest: não achei o link deste pin. Abra o pin (clique nele) e baixe de lá." : "Pinterest: could not find this pin's link. Open the pin (click it) and download from there.", "err", 7000);
      return;
    }
    if (isFB() && !igUrl && !fbCandidate(primary)) {
      state.busy = false;
      toast(/^pt/i.test(navigator.language) ? "Facebook: não achei o link deste vídeo. Abra o vídeo (clique nele ou na data do post) e baixe de lá." : "Facebook: could not find this video's link. Open the video (click it or the post date) and download from there.", "err", 7000);
      return;
    }
    if (isX() && !igUrl && !X_STATUS_RE.test(new URL(primary, location.href).pathname)) {
      state.busy = false;
      toast(/^pt/i.test(navigator.language) ? "X: não achei o link deste tweet. Clique na data do tweet (abre o tweet) e baixe de lá." : "X: could not find this tweet's link. Click the tweet date to open it, then download from there.", "err", 7000);
      return;
    }

    toast(t("starting"));

    const res = await sendMsg({
      type: "DOWNLOAD",
      url: primary,
      fallbackStream: fallback,
      referer: (window !== window.top && /^https?:/i.test(document.referrer || "")) ? document.referrer : page,
      title: igUrl && isIG() ? igTitle(state.video) : igUrl && isX() ? xTitle(state.video) : igUrl && isFB() ? fbTitle(state.video) : igUrl && isPin() ? pinTitle(igUrl, t("pinVideo")) : document.title,
      pageUrl: page,
      quality: quality || "best"
    });

    if (!res || !res.ok || !res.job_id) {
      state.busy = false;
      toast(failText(res), "err", 6500);
      return;
    }
    if (res.duplicate) toast(t("dupNote"), "ok");
    trackJob(res.job_id, res.output_dir || cfg.output_dir, () => { state.busy = false; });
  }

  // texto de erro conforme a causa (servidor recusou a extensão x offline x outro erro)
  function failText(res) {
    if (res && res.error === "forbidden") return t("forbiddenMsg");
    if (res && res.error && res.error !== "Servidor local offline" && !res.timeout) return String(res.error).slice(0, 90);
    return t("serverOffline");
  }

  async function startAll() {
    const { items } = scan();
    const urls = items.map((i) => i.url).slice(0, 20);
    const playerPage = isYT() || /vimeo\.com|globoplay|globo\.com|dailymotion|twitch/.test(location.hostname);
    if (playerPage) urls.unshift(location.href);
    else if (!urls.length) urls.push(location.href);

    const res = await sendMsg({
      type: "DOWNLOAD_MANY",
      urls,
      referer: location.href,
      quality: (state.cfg && state.cfg.default_quality) || "best",
      title: document.title
    });

    if (!res || !res.ok) {
      toast(t("queueFail"), "err");
      return;
    }
    const n = res.queued || 0;
    if (!n) { toast(t("nothingHere"), "err"); return; }
    toast(t("queuedNote", n), "ok", 5200);
  }

  // OBS: o temporizador NÃO pode se chamar "t" (escondia a função de tradução e travava tudo)
  function trackJob(jobId, folder, done) {
    let last = "";
    let misses = 0;
    const started = Date.now();
    let ended = false;
    const timer = setInterval(async () => {
      const finish = () => {
        if (ended) return;
        ended = true;
        clearInterval(timer);
        try { done && done(); } catch (_) {}
      };
      try {
        const st = await sendMsg({ type: "STATUS", jobId });
        if (!st || !st.ok) {
          if (++misses >= 3) { toast(t("serverOffline"), "err"); finish(); }
          return;
        }
        misses = 0;
        const d = st.data || {};
        if (d.status === "queued") toast(t("queuedWait"));
        else if (d.status === "downloading") {
          const txt = d.progress ? t("downloadingP", d.progress + (d.speed ? " • " + d.speed : "")) : t("downloading0");
          if (txt !== last) { last = txt; toast(txt, null, 0); }
        } else if (d.status === "merging") toast(t("mergingShort"), null, 0);
        else if (d.status === "done") {
          toast(t("savedInShort", folderName(folder || (d.output_dir || ""))) + (d.warning ? " — " + t("ffWarn") : ""), "ok", d.warning ? 9000 : 6000);
          finish();
        } else if (d.status === "canceled") {
          toast(t("canceledMsg"), null, 3500);
          finish();
        } else if (d.status === "error") {
          toast(t("errShort", String(d.error || "-").slice(0, 90)), "err", 7000);
          finish();
        }
      } catch (_) {
        finish();                                    // qualquer falha: nunca deixa o botão "ocupado" para sempre
      }
      if (Date.now() - started > 3 * 3600 * 1000) finish();
    }, 800);
  }

  /* ------------------------------------------------------ botão no YouTube -- */
  const YT_BTN_ID = "noevfx-dl-wrap";

  // UM único listener global fecha o menu (antes, cada reinjeção do botão somava mais um)
  let ytCloserOn = false;
  function ensureYtCloser() {
    if (ytCloserOn) return;
    ytCloserOn = true;
    document.addEventListener("click", () => {
      document.querySelectorAll(".noevfx-dl-menu").forEach((m) => m.classList.add("noevfx-hidden"));
    });
  }

  function injectYouTubeButton() {
    if (!isYT() || location.pathname !== "/watch" || !ytId()) return;
    if (document.getElementById(YT_BTN_ID)) return;
    const bar =
      document.querySelector("#top-level-buttons-computed") ||
      document.querySelector("ytd-watch-metadata #actions #actions-inner") ||
      document.querySelector("#actions-inner");
    if (!bar) return;

    const wrap = document.createElement("div");
    wrap.id = YT_BTN_ID;
    wrap.className = "noevfx-dl-wrap";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "noevfx-dl-btn";
    btn.innerHTML = `${BRAND_SVG}<span>${t("ytDownload")}</span>`;

    const menu = document.createElement("div");
    menu.className = "noevfx-dl-menu noevfx-hidden";
    const dest = (state.cfg && state.cfg.output_dir) || "";
    menu.innerHTML = `
      <div class="noevfx-dl-dest" title="${esc(dest)}">📁 ${esc(dest ? folderName(dest) : t("folderLabel"))}</div>
      <button type="button" data-q="best">${t("ytBest")}</button>
      <button type="button" data-q="1080">${t("yt1080")}</button>
      <button type="button" data-q="720">${t("yt720")}</button>
      <button type="button" data-q="audio">${t("ytAudio")}</button>
    `;

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!e.isTrusted) return;
      await loadCfg();
      if (state.cfg && state.cfg.hover_action === "direct") {
        runYTDownload(btn, state.cfg.default_quality || "best");
        return;
      }
      menu.classList.toggle("noevfx-hidden");
    });

    ensureYtCloser();

    menu.querySelectorAll("button").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!e.isTrusted) return;
        menu.classList.add("noevfx-hidden");
        runYTDownload(btn, item.dataset.q);
      });
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    bar.appendChild(wrap);
  }

  async function runYTDownload(btn, quality) {
    const label = btn.querySelector("span");
    if (btn.disabled) return;
    label.textContent = t("ytStarting");
    btn.disabled = true;

    const res = await sendMsg({
      type: "DOWNLOAD",
      url: resolveBestPageOrVideoUrl(null),
      referer: location.href,
      title: document.title,
      pageUrl: location.href,
      quality: quality || "best"
    });

    if (!res || !res.ok || !res.job_id) {
      label.textContent = res && res.error === "forbidden" ? t("forbiddenShort") : t("ytOffline");
      setTimeout(() => { label.textContent = t("ytDownload"); btn.disabled = false; }, 3200);
      return;
    }
    toast(res.duplicate ? t("dupNote") : t("downloadStarted"), "ok");
    // OBS: o temporizador NÃO pode se chamar "t" (escondia a função de tradução)
    let misses = 0;
    const started = Date.now();
    const timer = setInterval(async () => {
      const reset = (ms) => setTimeout(() => { label.textContent = t("ytDownload"); btn.disabled = false; }, ms);
      try {
        const st = await sendMsg({ type: "STATUS", jobId: res.job_id });
        if (!st || !st.ok) {
          if (++misses >= 3) { clearInterval(timer); label.textContent = t("ytError"); reset(3000); }
          return;
        }
        misses = 0;
        const d = st.data || {};
        if (d.status === "downloading") label.textContent = d.progress ? t("downloadingP", d.progress) : t("downloading0");
        else if (d.status === "merging") label.textContent = t("ytMerging");
        else if (d.status === "done") {
          clearInterval(timer);
          label.textContent = t("ytSaved");
          reset(3000);
        } else if (d.status === "error" || d.status === "canceled") {
          clearInterval(timer);
          label.textContent = t("ytError");
          reset(3500);
        }
      } catch (_) {
        clearInterval(timer);
        btn.disabled = false;
        label.textContent = t("ytDownload");
      }
      if (Date.now() - started > 3 * 3600 * 1000) { clearInterval(timer); btn.disabled = false; }
    }, 900);
  }

  /* ------------------------------------------------------------------ boot -- */
  let scanTimer = null;
  function scheduleScan(delay) {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      if (document.visibilityState !== "visible") return;     // aba em segundo plano não varre
      publish(true);
      injectYouTubeButton();
    }, delay || 900);
  }

  const obs = new MutationObserver(() => scheduleScan(600));
  function startObserver() {
    try {
      obs.observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (_) {}
  }

  // Sites de página única (TikTok, Instagram, YouTube...) trocam de vídeo sem recarregar a aba. Sem isto a lista
  // e a miniatura ficavam presas na PRIMEIRA página aberta.
  const baseUrl = () => location.href.split("#")[0];
  let lastHref = baseUrl();
  function onPageChange() {
    lastHref = baseUrl();
    state.sent.clear();
    state.thumb = "";
    netList.length = 0;
    netSet.clear();
    try { chrome.runtime.sendMessage({ type: "RESET_TAB" }, () => { void chrome.runtime.lastError; }); } catch (_) {}
    setTimeout(() => { publish(true); injectYouTubeButton(); }, 500);
  }

  const onReady = () => {
    startObserver();
    const navTimer = setInterval(() => {
      if (!chrome.runtime || !chrome.runtime.id) { clearInterval(navTimer); return; }
      if (baseUrl() !== lastHref) onPageChange();
    }, 300);
    loadPos();
    loadCfg().then(() => {
      publish(true);
      injectYouTubeButton();
    });
    const pubTimer = setInterval(() => {
      // extensão recarregada/atualizada: este script ficou órfão, então para de trabalhar
      if (!chrome.runtime || !chrome.runtime.id) { clearInterval(pubTimer); obs.disconnect(); return; }
      if (document.visibilityState === "visible") publish(false);
    }, 4000);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  } else {
    onReady();
  }

  document.addEventListener("yt-navigate-finish", () => {
    if (baseUrl() !== lastHref) onPageChange();      // o vigia de URL cuida; aqui só garante a troca no YouTube
    else setTimeout(() => { publish(true); injectYouTubeButton(); }, 400);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (!msg) return;
    if (msg.type === "RESCAN") {
      const { items, thumb } = scan();
      state.thumb = thumb || state.thumb;
      items.forEach((it) => state.sent.set(it.url, sigOf(it)));
      publish(true);
      respond({ ok: true, items, thumb: state.thumb, title: document.title });
      return;
    }
    if (msg.type === "CONFIG_CHANGED") {
      loadCfg().then(() => {
        if (!fabOn()) { closePanel(); hideFab(); }
        respond({ ok: true });
      });
      return true;
    }
  });

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.cfg) loadCfg();
    });
  } catch (_) {}
})();
