/* Noe VFX for Editors - base comum do painel e da parte escondida (CEP com Node).
   Fala só com o app local (127.0.0.1:8765), com a chave que o app grava em panel_token.txt. */
(function () {
  "use strict";
  const os = require("os");
  const fs = require("fs");
  const path = require("path");
  const http = require("http");

  const HOST = (() => {
    try { return JSON.parse(window.__adobe_cep__.getHostEnvironment()).appName; } catch (_) { return ""; }
  })();
  const APP = HOST === "AEFT" ? "aftereffects" : "premiere";
  const APP_NAME = APP === "aftereffects" ? "After Effects" : "Premiere";

  function tokenPath() {
    if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || "", "NoeVFXDownloader", "server", "panel_token.txt");
    return path.join(os.homedir(), ".local", "share", "NoeVFXDownloader", "server", "panel_token.txt");
  }
  function token() {
    try { return fs.readFileSync(tokenPath(), "utf8").trim(); } catch (_) { return ""; }
  }

  // pedido ao app local; nunca lança erro: devolve {ok, status, data}
  function api(method, p, body) {
    return new Promise((resolve) => {
      const data = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
      const headers = { "X-NoeVFX-Panel": token(), "Content-Type": "application/json" };
      if (data) headers["Content-Length"] = data.length;
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const req = http.request({ host: "127.0.0.1", port: 8765, path: p, method, headers, timeout: p === "/inspect" ? 100000 : 20000 }, (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { buf += c; });
        res.on("end", () => {
          let j = {};
          try { j = JSON.parse(buf || "{}"); } catch (_) {}
          finish({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: j });
        });
      });
      req.on("timeout", () => { req.destroy(); finish({ ok: false, status: 0, data: {} }); });
      req.on("error", () => finish({ ok: false, status: 0, data: {} }));
      if (data) req.write(data);
      req.end();
    });
  }

  function jsx(code) {
    return new Promise((resolve) => {
      try { window.__adobe_cep__.evalScript(code, (r) => resolve(String(r == null ? "" : r))); } catch (e) { resolve("err|" + e); }
    });
  }
  function split(r) {
    const i = r.indexOf("|");
    return i < 0 ? { state: r, value: "" } : { state: r.slice(0, i), value: r.slice(i + 1) };
  }

  async function project() {
    const r = split(await jsx("nvfProject()"));
    return { state: r.state === "ok" ? "ok" : r.state === "unsaved" ? "unsaved" : "none", path: r.state === "ok" ? r.value : "" };
  }

  // avisa o app do projeto ativo e importa o que chegou (claim no servidor: só um dos dois laços importa cada download)
  let busy = false;
  async function tick(onImported) {
    if (busy) return;
    busy = true;
    try {
      const p = await project();
      await api("POST", "/adobe/hello", { app: APP, project: p.path, state: p.state });
      const r = await api("GET", "/adobe/imports?app=" + APP);
      for (const it of (r.data && r.data.imports) || []) {
        const res = split(await jsx("nvfImport(" + JSON.stringify(it.files.join("\n")) + ", " + JSON.stringify(it.project || "") + ")"));
        if (res.state === "wait") continue;          // projeto fechado agora: volta para a fila depois do claim
        await api("POST", "/adobe/imported", { job_id: it.job_id, error: res.state === "ok" ? "" : res.value || res.state });
        if (onImported) onImported(it, res);
      }
    } catch (_) {
    } finally {
      busy = false;
    }
  }

  window.NVF = { APP, APP_NAME, api, jsx, project, tick, token, tokenPath };
})();
