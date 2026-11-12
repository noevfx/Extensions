/* ============================================================================
   Noe VFX Downloader — Configurações / Primeiro uso v3.0
   ========================================================================== */
"use strict";

const $ = (id) => document.getElementById(id);
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

/* tema */
if ($("ver")) $("ver").textContent = chrome.runtime.getManifest().version;

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
  srvPill.textContent = "verificando…";
  srvPill.className = "pill";
  const r = await send({ type: "HEALTH" });
  checks.textContent = "";
  if (!r || !r.ok) {
    srvPill.textContent = "servidor offline";
    srvPill.className = "pill off";
    checks.appendChild(chip("Servidor local", false));
    srvHint.textContent = "Rode o instalador da sua pasta (windows / mac / linux).";
    lastHealth = null;
    return false;
  }
  const d = r.data || {};
  lastHealth = d;
  srvPill.textContent = "online";
  srvPill.className = "pill on";
  checks.appendChild(chip("Servidor", true, "v" + (d.version || "3.0")));
  checks.appendChild(chip("yt-dlp", !!d.yt_dlp));
  checks.appendChild(chip("FFmpeg", !!d.ffmpeg));
  checks.appendChild(chip("Python", !!d.python, d.python || ""));
  if (d.yt_dlp_path) checks.title = "yt-dlp: " + d.yt_dlp_path + (d.ffmpeg_path ? "\nffmpeg: " + d.ffmpeg_path : "");
  srvHint.textContent = d.ffmpeg ? "" : "FFmpeg ausente: a união de vídeo+áudio pode falhar. Rode o instalador novamente.";
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
  saveStatus.textContent = "Alterações não salvas.";
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
  btn.textContent = "Abrindo janela…";
  const r = await send({ type: "PICK_FOLDER" });
  btn.disabled = false;
  btn.textContent = "Escolher pasta…";
  if (r && r.path) {
    outDir.value = r.path;
    markDirty();
    saveStatus.textContent = "Pasta escolhida. Clique em Salvar.";
  } else if (r && r.error) {
    saveStatus.textContent = "Não consegui abrir a janela. Digite o caminho manualmente.";
  }
});

$("openBtn").addEventListener("click", async () => {
  const r = await send({ type: "OPEN_FOLDER", path: outDir.value.trim() });
  if (!r || !r.ok) saveStatus.textContent = "Não consegui abrir a pasta.";
});

$("defaultBtn").addEventListener("click", () => {
  const base = (lastHealth && lastHealth.default_output_dir) || "";
  if (base) {
    outDir.value = base;
    markDirty();
  } else {
    saveStatus.textContent = "Servidor offline: digite o caminho da pasta manualmente.";
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
    saveStatus.textContent = "Escolha a pasta padrão antes de salvar.";
    saveStatus.style.color = "#ef4444";
    return;
  }

  saveBtn.disabled = true;
  saveStatus.textContent = "Salvando…";

  const r = await send({ type: "SAVE_CONFIG", patch });
  saveBtn.disabled = false;

  if (!r || !r.ok) {
    saveStatus.textContent = "Erro: " + ((r && r.error) || "servidor local offline") + " — o servidor precisa estar rodando.";
    saveStatus.style.color = "#ef4444";
    return;
  }

  saveStatus.textContent = "✓ Configurações salvas. Pasta: " + r.config.output_dir;
  saveStatus.style.color = "#10b981";
  welcome.classList.remove("show");

  const tabs = await chrome.tabs.query({});
  tabs.forEach((t) => {
    if (t.id != null) chrome.tabs.sendMessage(t.id, { type: "CONFIG_CHANGED" }).catch(() => {});
  });

  if (firstRun) setTimeout(() => window.close(), 900);
});

if (firstRun) {
  welcome.classList.add("show");
  saveBtn.textContent = "Concluir configuração";
  document.title = "Bem-vindo ao Noe VFX Downloader";
}

(async function init() {
  await health();
  await loadConfig();
  if (!outDir.value && lastHealth && lastHealth.output_dir) outDir.value = lastHealth.output_dir;
})();
