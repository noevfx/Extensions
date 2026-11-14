/* Noe VFX - vários links de uma vez: qualidade, destino (pasta padrão, outra pasta, projeto do Premiere/After Effects) e H.264. */
(function () {
  "use strict";
  const I = globalThis.__nvfI18n;
  const t = (k, ...s) => (I ? I.t(k, ...s) : k);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const EDITORS = globalThis.NVF_EDITION !== "basic";
  const ADOBE = EDITORS && /Windows|Macintosh|Mac OS X/i.test(navigator.userAgent);
  const items = [];
  let cfg = {};
  let customDir = "";

  const send = (msg) => new Promise((res) => {
    try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r || { ok: false }); }); } catch (_) { res({ ok: false }); }
  });
  const shortDir = (p) => String(p || "").split(/[\\/]/).filter(Boolean).slice(-2).join("/");

  if (I) I.applyStatic();
  document.title = t("batchTitle");
  $("edPill").hidden = !EDITORS;
  if (!ADOBE) document.querySelectorAll("#dest option[data-adobe]").forEach((o) => o.remove());
  if (!EDITORS) $("compatRow").hidden = true;

  function msg(text, kind) { $("msg").className = "msg " + (kind || ""); $("msg").textContent = text || ""; }

  async function refreshDest() {
    const d = $("dest").value;
    const adobe = d === "premiere" || d === "aftereffects";
    $("pick").hidden = d !== "custom";
    $("compat").disabled = adobe;
    if (adobe) $("compat").checked = true;                      // Premiere/AE não abrem AV1: sempre H.264
    else $("compat").checked = cfg.compat_h264 === true;
    if (d === "default") $("destInfo").innerHTML = t("batchInfoDefault", "<b>" + esc(shortDir(cfg.output_dir) || t("folderLabel")) + "</b>");
    else if (d === "custom") $("destInfo").innerHTML = customDir ? t("batchInfoCustom", "<b>" + esc(customDir) + "</b>") : esc(t("batchInfoPick"));
    else $("destInfo").textContent = t("batchInfoProject");
  }

  async function go() {
    const seen = new Set();
    const links = $("links").value.split(/\s+/).map((s) => s.trim()).filter((s) => /^https?:\/\/\S+$/i.test(s) && !seen.has(s) && seen.add(s));
    if (!links.length) { msg(t("batchNoLinks"), "warn"); return; }
    const d = $("dest").value;
    if (d === "custom" && !customDir) { msg(t("batchInfoPick"), "warn"); return; }
    $("go").disabled = true;
    msg("");
    try {
      for (const url of links) {
        const it = { url };
        items.push(it);
        const r = await send({
          type: "DOWNLOAD", url, pageUrl: url, referer: url, title: "", quality: $("quality").value, single: true,
          target: d === "premiere" || d === "aftereffects" ? d : "",
          outDir: d === "custom" ? customDir : "",
          compat: $("compat").checked
        });
        if (r && r.ok && r.job_id) it.job = r.job_id;
        else {
          it.error = (r && r.error && r.error !== "Servidor local offline") ? String(r.error) : t("startFail");
          if (d === "premiere" || d === "aftereffects") { render(); msg(it.error, "err"); break; }   // sem projeto: os outros também falhariam
        }
        render();
      }
      $("links").value = "";
    } finally {
      $("go").disabled = false;
    }
  }

  function render() {
    $("list").innerHTML = items.slice().reverse().map((it) => {
      let s = t("batchQueued"), kind = "", pct = 0;
      if (it.error) { s = it.error; kind = "err"; }
      else if (it.status === "done") { s = it.importApp && !it.imported ? t("batchImporting") : it.importApp ? t("batchImported") : t("batchDone", shortDir(it.file)); kind = it.importApp && !it.imported ? "" : "ok"; pct = 100; }
      else if (it.status === "error") { s = it.jobError || t("startFail"); kind = "err"; }
      else if (it.status === "canceled") { s = t("canceledMsg"); kind = "err"; }
      else if (it.progress) { s = it.progress; const m = String(it.progress).match(/(\d+(?:[.,]\d+)?)%/); pct = m ? parseFloat(m[1].replace(",", ".")) : 0; }
      return '<div class="it ' + kind + '"><div class="u" title="' + esc(it.url) + '">' + esc(it.url) + '</div><div class="s">' + esc(s) + "</div>" +
        (kind || pct >= 100 ? "" : '<div class="bar"><i style="width:' + Math.max(3, Math.min(100, pct)) + '%"></i></div>') + "</div>";
    }).join("");
  }

  async function poll() {
    const open = items.filter((it) => it.job && !it.error && it.status !== "error" && it.status !== "canceled" && !(it.status === "done" && (!it.importApp || it.imported)));
    for (const it of open) {
      const r = await send({ type: "STATUS", jobId: it.job });
      if (!r || !r.ok || !r.data) continue;
      const j = r.data;
      Object.assign(it, { status: j.status, progress: j.progress, jobError: j.error, file: j.file, importApp: j.import_app || "", imported: !!j.imported });
    }
    if (open.length) render();
  }

  $("dest").addEventListener("change", refreshDest);
  $("pick").addEventListener("click", async () => {
    const r = await send({ type: "PICK_FOLDER" });
    if (r && r.ok && r.path) { customDir = r.path; refreshDest(); }
  });
  $("go").addEventListener("click", go);
  $("links").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) go(); });
  send({ type: "GET_CONFIG", force: true }).then((r) => { cfg = (r && r.config) || {}; refreshDest(); });
  setInterval(poll, 1500);
})();
