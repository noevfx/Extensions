/* Noe VFX for Editors - painel visível: cola um ou vários links, baixa em H.264 na pasta do projeto e importa no bin. */
(function () {
  "use strict";
  const NVF = window.NVF;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const base = (p) => String(p || "").split(/[\\/]/).filter(Boolean).pop() || "";
  const items = [];                       // { url, job, status, progress, error, imported, importError }
  let project = null;

  function info(html, kind) {
    const el = $("info");
    el.className = "info " + (kind || "");
    el.innerHTML = html;
  }

  async function refreshProject() {
    const r = await NVF.api("GET", "/adobe/project?app=" + NVF.APP);
    if (!r.status) {
      $("app").textContent = "App local: desligado";
      info("O app Noe VFX não está rodando. Reinicie o computador ou rode o instalador.", "err");
      project = null;
      return null;
    }
    if (r.status === 403) {
      $("app").textContent = "App local: sem acesso";
      info("O painel não conseguiu a chave do app. Rode o instalador de novo.", "err");
      project = null;
      return null;
    }
    $("app").textContent = "App local: online";
    project = r.data || {};
    if (project.status === "ok") {
      const dest = String(project.dest || "").split(/[\\/]/).slice(-2).join("/");
      info("Projeto: <b>" + esc(base(project.project)) + "</b><br>Pasta: " + esc(dest) + " · bin <b>_Noe VFX Downloader</b>", "ok");
    } else {
      info(esc(project.message || "Abra e salve o projeto no " + NVF.APP_NAME + "."), "warn");
    }
    return project;
  }

  function links() {
    const seen = new Set();
    return $("links").value.split(/\s+/).map((s) => s.trim()).filter((s) => /^https?:\/\/\S+$/i.test(s) && !seen.has(s) && seen.add(s));
  }

  function render() {
    $("list").innerHTML = items.slice().reverse().map((it) => {
      let s = "Na fila", kind = "", pct = 0;
      if (it.error) { s = it.error; kind = "err"; }
      else if (it.status === "done" && it.imported && it.importError) { s = "Baixado, mas não importou: " + it.importError; kind = "err"; }
      else if (it.status === "done" && it.imported) { s = "Importado no bin _Noe VFX Downloader"; kind = "ok"; pct = 100; }
      else if (it.status === "done") { s = "Baixado. Importando no " + NVF.APP_NAME + "..."; pct = 100; }
      else if (it.status === "error") { s = it.jobError || "Falhou"; kind = "err"; }
      else if (it.status === "canceled") { s = "Cancelado"; kind = "err"; }
      else if (it.progress) { s = it.progress; const m = String(it.progress).match(/(\d+(?:[.,]\d+)?)%/); pct = m ? parseFloat(m[1].replace(",", ".")) : 0; }
      return '<div class="it ' + kind + '"><div class="u" title="' + esc(it.url) + '">' + esc(it.url) + '</div><div class="s">' + esc(s) +
        "</div>" + (kind || pct >= 100 ? "" : '<div class="bar"><i style="width:' + Math.max(3, Math.min(100, pct)) + '%"></i></div>') + "</div>";
    }).join("");
  }

  async function go() {
    const list = links();
    if (!list.length) { info("Cole pelo menos um link (http/https), um por linha.", "warn"); return; }
    $("go").disabled = true;
    try {
      const p = await refreshProject();
      if (!p || p.status !== "ok") return;          // o motivo já está na tela (abrir/salvar o projeto)
      for (const url of list) {
        const it = { url, status: "queued" };
        items.push(it);
        const r = await NVF.api("POST", "/download", { url, quality: $("quality").value, target: NVF.APP, title: "" });
        if (r.ok && r.data && r.data.job_id) it.job = r.data.job_id;
        else it.error = (r.data && r.data.error) || "Não consegui começar o download.";
        render();
      }
      $("links").value = "";
    } finally {
      $("go").disabled = false;
    }
  }

  async function poll() {
    const open = items.filter((it) => it.job && !it.error && !(it.status === "done" && it.imported) && it.status !== "error" && it.status !== "canceled");
    for (const it of open) {
      const r = await NVF.api("GET", "/status?id=" + encodeURIComponent(it.job));
      if (!r.ok) continue;
      const j = r.data || {};
      it.status = j.status; it.progress = j.progress; it.jobError = j.error; it.imported = !!j.imported; it.importError = j.import_error || "";
    }
    if (open.length) render();
  }

  $("go").addEventListener("click", go);
  $("links").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) go(); });
  refreshProject();
  setInterval(refreshProject, 5000);
  setInterval(poll, 1500);
  setInterval(() => NVF.tick(() => poll()), 3000);        // se a parte escondida não estiver rodando, o painel importa
})();
