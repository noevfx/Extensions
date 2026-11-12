/* ============================================================================
   NOÉ VFX Downloader — Content Script v3.0  (noevfx.com)
   - Ícone flutuante sobre QUALQUER <video> (Shadow DOM, sem conflito)
   - Arrastável dentro da área do vídeo (posição salva por site)
   - Some sozinho após 2 s com o mouse parado
   - Liga/desliga pelo cartão do vídeo, pelo popup ou pelo botão direito
   ========================================================================== */
(() => {
  "use strict";
  if (window.__noevfxV3) return;
  window.__noevfxV3 = true;

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
  `;

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
    sent: new Set(),
    busy: false,
    pos: null,
    dragMoved: false,
    dragging: false,
    posLoaded: false
  };

  const isYT = () => /(^|\.)youtube\.com$/.test(location.hostname);
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
      });
    } catch (_) {}
  }

  function savePos() {
    if (!state.video || !state.fab) return;
    const vr = state.video.getBoundingClientRect();
    const fr = state.fab.getBoundingClientRect();
    const availW = Math.max(1, vr.width - FAB_SIZE);
    const availH = Math.max(1, vr.height - FAB_SIZE);
    const rx = Math.min(1, Math.max(0, (fr.left - vr.left) / availW));
    const ry = Math.min(1, Math.max(0, (fr.top - vr.top) / availH));
    state.pos = [rx, ry];
    loadPos();
    try {
      chrome.storage.local.get("fabPos", (res) => {
        const map = (res && res.fabPos) || {};
        map[location.hostname] = state.pos;
        chrome.storage.local.set({ fabPos: map });
      });
    } catch (_) {}
  }

  /* -------------------------------------------------------------- utilidades */
  const folderName = (p) => {
    if (!p) return "Downloads/NoeVFX";
    const parts = String(p).split(/[\\/]+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : p;
  };

  function ytId() {
    if (!isYT()) return "";
    const p = new URLSearchParams(location.search).get("v");
    return p && /^[\w-]{6,}$/.test(p) ? p : "";
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

  function scan() {
    let thumb = state.thumb;
    if (!thumb) {
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
    const push = (url, kind) => {
      if (!url || !/^https?:/i.test(url)) return;
      if (seen.has(url)) return;
      seen.add(url);
      items.push({ url, kind: kind || "Player", thumb, title: document.title });
    };

    try {
      const res = performance.getEntriesByType("resource");
      for (let i = res.length - 1; i >= 0 && i > res.length - 240; i--) {
        const n = res[i].name;
        if (n && MEDIA_RE.test(n)) push(n, "Rede");
      }
    } catch (_) {}

    let vids = [];
    try { vids = Array.from(document.querySelectorAll("video")); } catch (_) {}

    vids.forEach((v) => {
      const src = v.currentSrc || v.src ||
        (v.querySelector("source") && v.querySelector("source").src) || "";
      if (src && /^https?:/i.test(src)) push(src, "HTML5");
    });

    try {
      document.querySelectorAll("[data-video-id]").forEach((el) => {
        const vid = el.getAttribute("data-video-id");
        if (vid && /^\d+$/.test(vid)) push(`https://globoplay.globo.com/v/${vid}/`, "Globo/G1");
      });
    } catch (_) {}

    try {
      document.querySelectorAll("iframe[src]").forEach((f) => {
        const s = f.src || "";
        if (/youtube\.com\/embed\/|player\.vimeo\.com|dailymotion\.com\/embed|players?\.globo\.com/i.test(s)) {
          push(s, "Embed");
        }
      });
    } catch (_) {}

    if (isYT()) {
      const u = resolveBestPageOrVideoUrl(null);
      if (u && u !== location.href) push(u, "YouTube");
    }

    return { items, thumb, count: items.length };
  }

  let sendT = 0;
  function publish(force) {
    if (!force && Date.now() - sendT < 1200) return;
    sendT = Date.now();
    const { items, thumb } = scan();
    const fresh = items.filter((it) => !state.sent.has(it.url));
    if (thumb) state.thumb = thumb;
    if (!fresh.length && !thumb) return;
    fresh.forEach((it) => state.sent.add(it.url));
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
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = `<style>${STYLE}</style>
        <button class="fab" type="button" title="Baixar com NOÉ VFX — arraste para mover">${BRAND_SVG}</button>
        <div class="panel"></div>
        <div class="toast"></div>`;
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

    let left;
    let top;
    if (state.pos) {
      left = rect.left + state.pos[0] * availW;
      top = rect.top + state.pos[1] * availH;
    } else {
      top = rect.top + (isYT() ? 62 : 12);
      left = rect.right - FAB_SIZE - 12;
    }

    // não deixa o ícone sair da tela (vídeo cortado/rolado)
    left = Math.min(Math.max(8, left), Math.max(8, innerWidth - FAB_SIZE - 8));
    top = Math.min(Math.max(8, top), Math.max(8, innerHeight - FAB_SIZE - 8));

    f.style.left = `${Math.round(left)}px`;
    f.style.top = `${Math.round(top)}px`;

    if (state.panelOpen) positionPanel(left, top + FAB_SIZE + 8);
    return true;
  }

  function positionPanel(left, top) {
    const p = state.panel;
    const w = 268;
    let l = Math.min(left, innerWidth - w - 10);
    l = Math.max(10, l);
    let t = top;
    const h = p.offsetHeight || 240;
    if (t + h > innerHeight - 10) t = Math.max(10, innerHeight - h - 10);
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
    if (e.button !== 0) return;
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

  document.addEventListener(
    "mousemove",
    (e) => {
      if (!state.video || state.dragging) return;
      if (!fabOn()) return;

      // só age quando o ponteiro está de fato sobre o vídeo
      let over = false;
      try { over = state.video.matches(":hover"); } catch (_) { over = false; }
      if (!over) {
        if (!state.panelOpen) scheduleHide();
        return;
      }

      const t = Date.now();
      if (t - state.lastMove < 110) return;
      state.lastMove = t;
      if (e.target === state.host) return;
      if (!state.panelOpen) place(state.video);
      armIdle();
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

  window.addEventListener("scroll", () => {
    if (state.dragging) return;
    if (state.video && state.fab && state.fab.style.display === "inline-flex") {
      place(state.video);
      armIdle();
    }
  }, { passive: true });

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
        <b>Salvar vídeo</b>
        <span class="brand">NOÉ VFX</span>
      </div>
      <div class="dest">
        <span>📁</span>
        <span class="path" title="${dest.replace(/"/g, "&quot;")}">${dest ? folderName(dest) : "Downloads/NoeVFX"}</span>
        <button type="button" class="change">trocar</button>
      </div>
      <div class="grid">
        <button type="button" class="opt main" data-q="${quality}">
          ${direct ? "Salvar aqui" : "Baixar na pasta padrão"}
        </button>
        <button type="button" class="opt" data-q="1080">1080p</button>
        <button type="button" class="opt" data-q="720">720p</button>
        <button type="button" class="opt" data-q="best">Nativa</button>
        <button type="button" class="opt" data-q="audio">Só áudio</button>
      </div>
      <div class="all"><button type="button" class="all-btn">Baixar todos os vídeos desta página</button></div>
      <div class="foot">
        <span class="hint">Arraste o ícone para mover</span>
        <button type="button" class="tgl ${on ? "" : "off"}" data-toggle>${on ? "ÍCONE ON" : "ÍCONE OFF"}</button>
      </div>
    `;

    state.panel.querySelector(".change").addEventListener("click", (e) => {
      e.stopPropagation();
      try { chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }); } catch (_) {}
      closePanel();
    });

    state.panel.querySelectorAll("button[data-q]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        closePanel();
        hideFab();
        startOne(b.dataset.q);
      });
    });

    state.panel.querySelectorAll(".all-btn").forEach((b) => b.addEventListener("click", async (e) => {
      e.stopPropagation();
      closePanel();
      hideFab();
      await startAll();
    }));

    state.panel.querySelector("[data-toggle]").addEventListener("click", async (e) => {
      e.stopPropagation();
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
      const fr = state.fab.getBoundingClientRect();
      positionPanel(fr.left - 220, fr.bottom + 8);
    });
  }

  function onFabClick(e) {
    e.preventDefault();
    e.stopPropagation();
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
    const r = state.fab.getBoundingClientRect();
    positionPanel(r.left - 220, r.bottom + 8);
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
    if (direct && /^https?:/i.test(direct) && !isYT()) {
      if (manyVideos) { primary = direct; fallback = page; }
      else { fallback = direct; }
    }
    if (primary === page) {
      const alt = resolveBestPageOrVideoUrl(state.video);
      if (alt && alt !== page) fallback = alt;
    }

    toast("Iniciando download...");

    const res = await sendMsg({
      type: "DOWNLOAD",
      url: primary,
      fallbackStream: fallback,
      referer: page,
      title: document.title,
      pageUrl: page,
      quality: quality || "best"
    });

    if (!res || !res.ok || !res.job_id) {
      state.busy = false;
      toast(res && res.error ? "Servidor local offline — rode o instalador" : "Não foi possível iniciar", "err");
      return;
    }
    trackJob(res.job_id, res.output_dir || cfg.output_dir, () => { state.busy = false; });
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
      toast("Falha ao enfileirar downloads", "err");
      return;
    }
    const n = res.queued || 0;
    if (!n) { toast("Nada para baixar aqui", "err"); return; }
    toast(`${n} download(s) na fila — acompanhe pelo ícone da extensão`, "ok", 5200);
  }

  function trackJob(jobId, folder, done) {
    let last = "";
    const t = setInterval(async () => {
      const st = await sendMsg({ type: "STATUS", jobId });
      if (!st || !st.ok) {
        clearInterval(t);
        done && done();
        return;
      }
      const d = st.data || {};
      if (d.status === "queued") toast("Na fila: aguardando vaga...");
      else if (d.status === "downloading") {
        const txt = d.progress ? `Baixando ${d.progress}${d.speed ? " • " + d.speed : ""}` : "Baixando...";
        if (txt !== last) { last = txt; toast(txt, null, 0); }
      } else if (d.status === "merging") toast("Unindo vídeo + áudio...", null, 0);
      else if (d.status === "done") {
        clearInterval(t);
        toast(`Salvo em ${folderName(folder || (d.output_dir || ""))}`, "ok", 6000);
        done && done();
      } else if (d.status === "error") {
        clearInterval(t);
        toast("Erro: " + String(d.error || "tente novamente").slice(0, 90), "err", 7000);
        done && done();
      }
    }, 800);
  }

  /* ------------------------------------------------------ botão no YouTube -- */
  const YT_BTN_ID = "noevfx-dl-wrap";

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
    btn.innerHTML = `${BRAND_SVG}<span>Baixar</span>`;

    const menu = document.createElement("div");
    menu.className = "noevfx-dl-menu noevfx-hidden";
    const dest = (state.cfg && state.cfg.output_dir) || "";
    menu.innerHTML = `
      <div class="noevfx-dl-dest" title="${dest.replace(/"/g, "&quot;")}">📁 ${dest ? folderName(dest) : "Downloads/NoeVFX"}</div>
      <button type="button" data-q="best">Qualidade Nativa (Máxima)</button>
      <button type="button" data-q="1080">1080p (Full HD)</button>
      <button type="button" data-q="720">720p (HD)</button>
      <button type="button" data-q="audio">Só Áudio (M4A)</button>
    `;

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await loadCfg();
      if (state.cfg && state.cfg.hover_action === "direct") {
        runYTDownload(btn, state.cfg.default_quality || "best");
        return;
      }
      menu.classList.toggle("noevfx-hidden");
    });

    const closer = () => menu.classList.add("noevfx-hidden");
    document.addEventListener("click", closer);

    menu.querySelectorAll("button").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
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
    label.textContent = "Iniciando...";
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
      label.textContent = "Servidor offline";
      setTimeout(() => { label.textContent = "Baixar"; btn.disabled = false; }, 3200);
      return;
    }
    toast("Download iniciado", "ok");
    const t = setInterval(async () => {
      const st = await sendMsg({ type: "STATUS", jobId: res.job_id });
      if (!st || !st.ok) { clearInterval(t); label.textContent = "Erro"; btn.disabled = false; return; }
      const d = st.data || {};
      if (d.status === "downloading") label.textContent = d.progress ? "Baixando " + d.progress : "Baixando...";
      else if (d.status === "merging") label.textContent = "Unindo...";
      else if (d.status === "done") {
        clearInterval(t);
        label.textContent = "Salvo!";
        setTimeout(() => { label.textContent = "Baixar"; btn.disabled = false; }, 3000);
      } else if (d.status === "error") {
        clearInterval(t);
        label.textContent = "Erro";
        setTimeout(() => { label.textContent = "Baixar"; btn.disabled = false; }, 3500);
      }
    }, 900);
  }

  /* ------------------------------------------------------------------ boot -- */
  let scanTimer = null;
  function scheduleScan(delay) {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      publish(true);
      injectYouTubeButton();
    }, delay || 700);
  }

  const obs = new MutationObserver(() => scheduleScan(600));
  function startObserver() {
    try {
      obs.observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (_) {}
  }

  const onReady = () => {
    startObserver();
    loadPos();
    loadCfg().then(() => {
      publish(true);
      injectYouTubeButton();
    });
    setInterval(() => {
      if (document.visibilityState === "visible") publish(false);
    }, 4000);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  } else {
    onReady();
  }

  document.addEventListener("yt-navigate-finish", () => {
    state.sent.clear();
    state.thumb = "";
    setTimeout(() => { publish(true); injectYouTubeButton(); }, 350);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (!msg) return;
    if (msg.type === "RESCAN") {
      const { items, thumb } = scan();
      state.thumb = thumb || state.thumb;
      items.forEach((it) => state.sent.add(it.url));
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
