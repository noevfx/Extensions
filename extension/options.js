/* ============================================================================
   Noe VFX Downloader — Configurações / Primeiro uso (i18n pt/en)
   ========================================================================== */
"use strict";

const $ = (id) => document.getElementById(id);
const t = (k, ...s) => (globalThis.__nvfT ? globalThis.__nvfT(k, ...s) : k);

const srvPill = $("srvPill");
const checks = $("checks");
const outDir = $("outDir");
const quality = $("quality");
const useCookies = $("useCookies");
const organize = $("organize");
const fabEnabled = $("fabEnabled");
const extraArgs = $("extraArgs");
const saveBtn = $("saveBtn");
const saveStatus = $("saveStatus");
const welcome = $("welcome");
const srvHint = $("srvHint");

const firstRun = new URLSearchParams(location.search).get("firstrun") === "1";

const send = (msg) =>
  new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false })); }
    catch (_) { resolve({ ok: false }); }
  });

/* idioma + versão */
if (globalThis.__nvfI18n) globalThis.__nvfI18n.applyStatic();
$("saveBtn").textContent = t("saveBtn");
if (firstRun) $("saveBtn").textContent = t("finishBtn");
document.title = t("optTitle");
const verLine = document.querySelector('[data-i18n="versionLine"]');
if (verLine) verLine.textContent = t("versionLine", chrome.runtime.getManifest().version);

/* tema */
chrome.storage.local.get(["theme"], (r) => {
  document.documentElement.setAttribute("data-theme", (r && r.theme) || "dark");
});
$("themeBtn").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", cur);
  chrome.storage.local.set({ theme: cur });
});

/* --------------------------------------------------------------- health --- */
function chip(label, ok, extra) {
  const s = document.createElement("span");
  s.className = "check " + (ok ? "ok" : "bad");
  s.innerHTML = `<b>${ok ? "✓" : "✕"}</b> ${label}${extra ? ` <span style="opacity:.7;font-weight:600">${extra}</span>` : ""}`;
  return s;
}

let lastHealth = null;

async function health() {
  srvPill.textContent = t("checking");
  srvPill.className = "pill";
  const r = await send({ type: "HEALTH" });
  checks.textContent = "";
  if (!r || !r.ok) {
    srvPill.textContent = t("offline");
    srvPill.className = "pill off";
    checks.appendChild(chip(t("step1"), false));
    srvHint.textContent = t("step1Offline");
    lastHealth = null;
    return false;
  }
  const d = r.data || {};
  lastHealth = d;
  srvPill.textContent = t("online");
  srvPill.className = "pill on";
  checks.appendChild(chip("Server", true, "v" + (d.version || "3.0")));
  checks.appendChild(chip("yt-dlp", !!d.yt_dlp));
  checks.appendChild(chip("FFmpeg", !!d.ffmpeg));
  checks.appendChild(chip("Python", !!d.python, d.python || ""));
  if (d.yt_dlp_path) checks.title = "yt-dlp: " + d.yt_dlp_path + (d.ffmpeg_path ? "\nffmpeg: " + d.ffmpeg_path : "");
  srvHint.textContent = d.ffmpeg ? "" : "FFmpeg: install it again with the Noe VFX installer.";
  if (d.output_dir) {
    outDir.value = outDir.value || d.output_dir;
    outDir.placeholder = d.output_dir;
  }
  return true;
}

$("retestBtn").addEventListener("click", health);

/* ------------------------------------------------------------- configuração */
function fillForm(c) {
  if (!c) return;
  outDir.value = c.output_dir || "";
  quality.value = c.default_quality || "best";
  useCookies.checked = c.use_cookies !== false;
  organize.checked = !!c.organize_by_site;
  fabEnabled.checked = c.fab_enabled !== false;
  extraArgs.value = c.extra_args || "";
  document.querySelectorAll('input[name="hover"]').forEach((el) => {
    const sel = el.value === (c.hover_action || "menu");
    el.checked = sel;
    el.closest(".opt").classList.toggle("selected", sel);
  });
}

async function loadConfig() {
  const r = await send({ type: "GET_CONFIG", force: true });
  if (r && r.config) {
    fillForm(r.config);
    if (r.config.onboarded) welcome.classList.remove("show");
    else welcome.classList.add("show");
  } else if (firstRun) {
    welcome.classList.add("show");
  }
}

document.querySelectorAll('input[name="hover"]').forEach((el) => {
  el.addEventListener("change", () => {
    document.querySelectorAll(".opt").forEach((o) => o.classList.remove("selected"));
    el.closest(".opt").classList.add("selected");
    markDirty();
  });
});

function markDirty() {
  saveStatus.textContent = t("unsaved");
  saveStatus.style.color = "";
}

outDir.addEventListener("input", markDirty);
quality.addEventListener("change", markDirty);
useCookies.addEventListener("change", markDirty);
organize.addEventListener("change", markDirty);
fabEnabled.addEventListener("change", markDirty);
extraArgs.addEventListener("input", markDirty);

/* --------------------------------------------------------------- pasta ---- */
$("pickBtn").addEventListener("click", async () => {
  const btn = $("pickBtn");
  btn.disabled = true;
  btn.textContent = t("opening");
  const r = await send({ type: "PICK_FOLDER" });
  btn.disabled = false;
  btn.textContent = t("pickFolder");
  if (r && r.path) {
    outDir.value = r.path;
    markDirty();
    saveStatus.textContent = t("pickOk");
  } else if (r && r.error) {
    saveStatus.textContent = t("pickErr");
  }
});

$("openBtn").addEventListener("click", async () => {
  const r = await send({ type: "OPEN_FOLDER", path: outDir.value.trim() });
  if (!r || !r.ok) saveStatus.textContent = t("openErr");
});

$("defaultBtn").addEventListener("click", () => {
  const base = (lastHealth && lastHealth.default_output_dir) || "";
  if (base) {
    outDir.value = base;
    markDirty();
  } else {
    saveStatus.textContent = t("offlineType");
  }
});

/* ----------------------------------------------------------------- salvar -- */
$("saveBtn").addEventListener("click", async () => {
  const patch = {
    output_dir: outDir.value.trim(),
    hover_action: (document.querySelector('input[name="hover"]:checked') || {}).value || "menu",
    default_quality: quality.value,
    use_cookies: useCookies.checked,
    organize_by_site: organize.checked,
    fab_enabled: fabEnabled.checked,
    extra_args: extraArgs.value.trim(),
    onboarded: true
  };

  if (!patch.output_dir) {
    saveStatus.textContent = t("chooseFirst");
    saveStatus.style.color = "#ef4444";
    return;
  }

  saveBtn.disabled = true;
  saveStatus.textContent = t("saving");

  const r = await send({ type: "SAVE_CONFIG", patch });
  saveBtn.disabled = false;

  if (!r || !r.ok) {
    saveStatus.textContent = t("saveErr", (r && r.error) || "offline");
    saveStatus.style.color = "#ef4444";
    return;
  }

  saveStatus.textContent = t("savedOk", r.config.output_dir);
  saveStatus.style.color = "#10b981";
  welcome.classList.remove("show");

  const tabs = await chrome.tabs.query({});
  tabs.forEach((tb) => {
    if (tb.id != null) chrome.tabs.sendMessage(tb.id, { type: "CONFIG_CHANGED" }).catch(() => {});
  });

  if (firstRun) setTimeout(() => window.close(), 900);
});

if (firstRun) {
  welcome.classList.add("show");
  document.title = t("welcomeTitle");
}

/* ------------------------------------------------------------- sobre / pix */
const PIX_KEY = "eb6568f2-51af-47bd-a2e7-cd0c7109329d";

function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function pixTag(id, val) {
  return id + String(val.length).padStart(2, "0") + val;
}

function pixPayload(key) {
  let p = "000201";
  p += pixTag("26", pixTag("00", "br.gov.bcb.pix") + pixTag("01", key));
  p += "52040000" + "5303986" + "5802BR";
  p += pixTag("59", "Noe VFX") + pixTag("60", "Sao Paulo") + pixTag("62", pixTag("05", "***"));
  p += "6304";
  return p + crc16(p);
}

function copyText(txt, btn) {
  const done = () => {
    const old = btn.textContent;
    btn.textContent = "✓";
    setTimeout(() => { btn.textContent = old; }, 1200);
  };
  try {
    navigator.clipboard.writeText(txt).then(done, done);
  } catch (_) {
    done();
  }
}

(function initAbout() {
  const ver = chrome.runtime.getManifest().version;
  const av = $("aboutVer");
  if (av) av.textContent = "v" + ver + " · " + t("versionRelease");

  const payload = pixPayload(PIX_KEY);
  const kEl = $("pixKey");
  const pEl = $("pixPayload");
  if (kEl) kEl.textContent = PIX_KEY;
  if (pEl) pEl.textContent = payload;

  const qr = $("pixQr");
  if (qr && typeof qrcode === "function") {
    try {
      const code = qrcode(0, "M");
      code.addData(payload);
      code.make();
      const count = code.getModuleCount();
      const cell = 8;
      const margin = 16;
      const size = count * cell + margin * 2;
      qr.width = size;
      qr.height = size;
      const ctx = qr.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#000000";
      for (let r = 0; r < count; r += 1) {
        for (let c = 0; c < count; c += 1) {
          if (code.isDark(r, c)) ctx.fillRect(margin + c * cell, margin + r * cell, cell, cell);
        }
      }
    } catch (e) {
      qr.style.visibility = "hidden";
    }
  }

  const ck = $("copyKey");
  if (ck) ck.addEventListener("click", () => copyText(PIX_KEY, ck));
  const cp = $("copyPix");
  if (cp) cp.addEventListener("click", () => copyText(payload, cp));
  const cm = $("copyMail");
  if (cm) cm.addEventListener("click", () => copyText("labs@noevfx.com", cm));
})();

(async function init() {
  await health();
  await loadConfig();
  if (!outDir.value && lastHealth && lastHealth.output_dir) outDir.value = lastHealth.output_dir;
})();
