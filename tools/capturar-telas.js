// Gera as telas do manual (docs/img/*.png) com a extensão REAL rodando num Edge/Chrome headless.
//
//   node tools/capturar-telas.js            (precisa de Node 22+, Edge/Chrome, ffmpeg e yt-dlp)
//
// Sobe uma cópia do servidor e da extensão (porta livre), uma "página de aula" de exemplo com um vídeo gerado
// pelo ffmpeg, e tira as capturas com mouse e cliques de verdade. Não mexe na sua instalação.
"use strict";
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const net = require("net");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "img");
const EXT_ID = "hdmfifeopbmjcfjbjpkfjinejneohlji";
const BROWSER = process.env.BROWSER || [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const log = (m) => console.log("  " + m);

class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.cb = new Map(); this.ready = new Promise((r) => (this.ws.onopen = r));
    this.ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.cb.has(d.id)) { this.cb.get(d.id)(d); this.cb.delete(d.id); } }; }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((r) => this.cb.set(id, r)); }
  async eval(e) { const r = await this.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); const x = r.result; if (!x) return undefined; return x.exceptionDetails ? "ERR " + x.exceptionDetails.exception.description : x.result.value; }
  async shot(name, clip, scale = 1) {
    const p = { format: "png" }; if (clip) p.clip = { ...clip, scale };
    const r = await this.send("Page.captureScreenshot", p); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64")); log("ok  " + name);
  }
}

(async () => {
  if (!BROWSER) { console.error("Nenhum Edge/Chrome encontrado (use BROWSER=...)"); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nvf_telas_"));
  const sp = await freePort(), fp = await freePort(), dbg = await freePort();
  const extDir = path.join(tmp, "ext"), srvDir = path.join(tmp, "srv"), dl = path.join(tmp, "a", "Downloads", "NoeVFX");
  fs.cpSync(path.join(ROOT, "browser"), extDir, { recursive: true });
  for (const f of ["background.js", "options.js"]) { const p = path.join(extDir, f); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("http://127.0.0.1:8765", "http://127.0.0.1:" + sp)); }
  fs.mkdirSync(srvDir); fs.copyFileSync(path.join(ROOT, "server", "server.py"), path.join(srvDir, "server.py"));

  // vídeo e miniatura de exemplo (gerados na hora)
  const font = process.platform === "win32" ? ":fontfile='C\\:/Windows/Fonts/segoeuib.ttf'" : "";
  const font2 = process.platform === "win32" ? ":fontfile='C\\:/Windows/Fonts/segoeui.ttf'" : "";
  const vf = `drawtext=text='Aula 12'${font}:fontcolor=white:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2-30,drawtext=text='Edicao de video no Premiere Pro'${font2}:fontcolor=0xc9d3e8:fontsize=40:x=(w-text_w)/2:y=(h/2)+50`;
  const grad = "gradients=s=1280x720:d=60:speed=0.02:c0=0x0b1b3a:c1=0x0066ff:c2=0x0a0c12:c3=0x1b2a55:nb_colors=4";
  const mp4 = path.join(tmp, "aula12.mp4"), jpg = path.join(tmp, "poster.jpg");
  let r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", grad, "-f", "lavfi", "-i", "sine=frequency=440:duration=60", "-vf", vf, "-c:v", "libx264", "-b:v", "4M", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-c:a", "aac", "-shortest", mp4]);
  if (r.status !== 0) { console.error("ffmpeg falhou:", String(r.stderr)); process.exit(2); }
  spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", "3", "-i", mp4, "-frames:v", "1", "-q:v", "3", jpg]);
  const mp4buf = fs.readFileSync(mp4), jpgbuf = fs.readFileSync(jpg);

  // "site de curso" de exemplo; o vídeo sai devagar para dar tempo de ver o progresso
  const site = http.createServer((req, res) => {
    if (req.url === "/" ) { res.setHeader("Content-Type", "text/html; charset=utf-8"); return res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Aula 12 - Edição de vídeo no Premiere Pro</title>
<meta property="og:image" content="http://127.0.0.1:${fp}/poster.jpg">
<style>body{margin:0;background:#0e1016;color:#e8eaf2;font:15px/1.5 "Segoe UI",system-ui,sans-serif}header{padding:14px 28px;background:#151823;border-bottom:1px solid #232838;font-weight:700}
main{max-width:1000px;margin:26px auto;padding:0 24px}h1{font-size:22px;margin:0 0 4px}p{color:#8d94ab;margin:0 0 18px}video{width:100%;border-radius:12px;background:#000;display:block}</style>
<header>Curso de Edição de Vídeo &nbsp;·&nbsp; Módulo 3</header><main><h1>Aula 12 — Edição de vídeo no Premiere Pro</h1><p>Cortes, transições e exportação para redes sociais.</p>
<video controls preload="none" poster="/poster.jpg" src="/aula12.mp4"></video></main><script>fetch("/hls/aula12/master.m3u8").catch(function(){});</script>`); }
    if (req.url.startsWith("/poster.jpg")) { res.setHeader("Content-Type", "image/jpeg"); return res.end(jpgbuf); }
    if (req.url.startsWith("/hls/")) { res.statusCode = 404; return res.end("x"); }
    if (req.url.startsWith("/aula12.mp4")) {
      res.setHeader("Content-Type", "video/mp4"); res.setHeader("Content-Length", mp4buf.length);
      let i = 0; const t = setInterval(() => { if (i >= mp4buf.length) { clearInterval(t); return res.end(); } res.write(mp4buf.subarray(i, i + 24000)); i += 24000; }, 60);
      res.on("close", () => clearInterval(t)); return;
    }
    res.statusCode = 404; res.end();
  }).listen(fp, "127.0.0.1");

  const py = process.platform === "win32" ? "python" : "python3";
  let srv = spawn(py, [path.join(srvDir, "server.py")], { env: { ...process.env, NOEVFX_PORT: String(sp) }, stdio: "ignore", cwd: tmp });
  const H = { Origin: "chrome-extension://" + EXT_ID, "X-NoeVFX-Client": "1", "Content-Type": "application/json" };
  const api = (m, p, b) => new Promise((resolve) => { const d = b ? JSON.stringify(b) : null; const q = http.request({ host: "127.0.0.1", port: sp, method: m, path: p, headers: { ...H, ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}) } }, (rs) => { let s = ""; rs.on("data", (c) => (s += c)); rs.on("end", () => { try { resolve(JSON.parse(s)); } catch (_) { resolve({}); } }); }); q.on("error", () => resolve({})); if (d) q.write(d); q.end(); });
  for (let i = 0; i < 60; i++) { if ((await api("GET", "/health")).ok) break; await sleep(250); }
  await api("POST", "/config", { output_dir: dl, onboarded: true });

  const br = spawn(BROWSER, ["--headless=new", `--remote-debugging-port=${dbg}`, `--user-data-dir=${path.join(tmp, "prof")}`, `--load-extension=${extDir}`, "--no-first-run", "--no-default-browser-check", "--lang=pt-BR",
    "--disable-features=DisableLoadExtensionCommandLineSwitch", "--window-size=1280,760", "about:blank"], { stdio: "ignore" });
  const targets = async () => (await fetch(`http://127.0.0.1:${dbg}/json`)).json();
  for (let i = 0; i < 80; i++) { try { await targets(); break; } catch (_) { await sleep(250); } }
  await sleep(2500);
  const browser = new Cdp((await (await fetch(`http://127.0.0.1:${dbg}/json/version`)).json()).webSocketDebuggerUrl); await browser.ready;
  const openTarget = async (url, w, h, scale = 1) => {
    const t = await browser.send("Target.createTarget", { url }); await sleep(1800);
    const info = (await targets()).find((x) => x.id === t.result.targetId); const c = new Cdp(info.webSocketDebuggerUrl); await c.ready;
    for (const m of ["Page.enable", "Runtime.enable", "DOM.enable"]) await c.send(m);
    await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: scale, mobile: false }); c.targetId = t.result.targetId; return c;
  };
  const closeT = (c) => browser.send("Target.closeTarget", { targetId: c.targetId });
  const cleanup = async () => { try { br.kill(); } catch (_) {} try { srv.kill(); } catch (_) {} site.close(); await sleep(1500); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 8, retryDelay: 600 }); } catch (_) { log("(pasta temporária não apagada: " + tmp + ")"); } };

  try {
    console.log("Capturando em " + OUT);
    // ---------- página da aula + ícone + painel + progresso ----------
    const page = await openTarget(`http://127.0.0.1:${fp}/`, 1280, 720, 1);
    await sleep(1500);
    const mouse = (type, x, y) => page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: type === "mousePressed" ? 1 : 0 });
    const click = async (x, y) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); };
    const findNode = async (sel) => {
      const doc = await page.send("DOM.getDocument", { depth: -1, pierce: true });
      const walk = (n) => { if ((n.attributes || []).includes("noevfx-hover-host")) return n; for (const c of n.children || []) { const x = walk(c); if (x) return x; } return null; };
      const host = walk(doc.result.root); if (!host || !host.shadowRoots || !host.shadowRoots.length) return null;
      const q = await page.send("DOM.querySelector", { nodeId: host.shadowRoots[0].nodeId, selector: sel }); return q.result && q.result.nodeId ? q.result.nodeId : null;
    };
    const center = async (n) => { const b = await page.send("DOM.getBoxModel", { nodeId: n }); if (!b.result) return null; const q = b.result.model.content; return [(q[0] + q[4]) / 2, (q[1] + q[5]) / 2]; };
    const vid = await page.eval(`(()=>{const r=document.querySelector('video').getBoundingClientRect();return [r.left+r.width/2, r.top+r.height/2]})()`);
    await mouse("mouseMoved", vid[0] - 80, vid[1]); await sleep(500); await mouse("mouseMoved", vid[0] - 60, vid[1] + 10); await sleep(600);
    await page.shot("01-icone-no-video.png");
    const fab = await findNode(".fab"); const fc = await center(fab); await click(fc[0], fc[1]); await sleep(700);
    await page.shot("02-painel-no-video.png");
    const main = await findNode("button.opt.main"); const mc = await center(main); await click(mc[0], mc[1]);
    await sleep(3200); await page.shot("03-baixando-no-video.png");
    if (process.env.DEBUG_TELAS) log("jobs: " + JSON.stringify((await api("GET", "/jobs")).jobs));
    for (let i = 0; i < 60; i++) { const js = (await api("GET", "/jobs")).jobs || []; if (js[0] && ["done", "error"].includes(js[0].status)) break; await sleep(500); }
    await sleep(900); await page.shot("04-salvo-no-video.png");

    // ---------- popup com dados reais (a aba "ativa" é a página da aula) ----------
    const optT = await openTarget(`chrome-extension://${EXT_ID}/options.html`, 900, 700);
    const tabId = await optT.eval(`chrome.tabs.query({}).then(ts=>(ts.find(t=>t.url&&t.url.includes(':${fp}/'))||{}).id)`);
    await closeT(optT);
    const lessonUrl = `http://127.0.0.1:${fp}/`, lessonTitle = "Aula 12 - Edição de vídeo no Premiere Pro";
    const patch = `chrome.tabs.query=function(){return Promise.resolve([{id:${tabId},url:${JSON.stringify(lessonUrl)},title:${JSON.stringify(lessonTitle)},active:true}])};`;
    const popup = async (theme, w = 388) => {
      const t = await browser.send("Target.createTarget", { url: "about:blank" }); await sleep(600);
      const info = (await targets()).find((x) => x.id === t.result.targetId); const c = new Cdp(info.webSocketDebuggerUrl); await c.ready; c.targetId = t.result.targetId;
      for (const m of ["Page.enable", "Runtime.enable", "DOM.enable"]) await c.send(m);
      await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: 760, deviceScaleFactor: 2, mobile: false });
      await c.send("Page.addScriptToEvaluateOnNewDocument", { source: patch + `try{localStorage.setItem('x','1')}catch(e){}` });
      await c.send("Page.navigate", { url: `chrome-extension://${EXT_ID}/popup.html` }); await sleep(2500);
      await c.eval(`chrome.storage.local.set({theme:'${theme}'}); document.documentElement.setAttribute('data-theme','${theme}'); 0`); await sleep(1500);
      return c;
    };
    const fit = async (c, name) => { await c.eval("document.getElementById('urlInput').value='https://curso-exemplo.com.br/modulo-3/aula-12'; 0"); const h = await c.eval("Math.ceil(document.body.getBoundingClientRect().height)+0"); await c.shot(name, { x: 0, y: 0, width: 388, height: Math.max(300, h) }, 2); };
    await api("POST", "/config", { output_dir: path.join(tmp, "b", "Downloads", "NoeVFX") });   // pasta limpa para o 2º download
    const pop = await popup("dark");
    await fit(pop, "05-popup.png");
    // baixar pelo popup (botão "Baixar" da lista) e ver o progresso + Cancelar
    const btnBox = await pop.eval(`(()=>{const b=document.querySelector('.stream-btn');const r=b.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    const pm = (type, x, y) => pop.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: type === "mousePressed" ? 1 : 0 });
    await pm("mouseMoved", btnBox[0], btnBox[1]); await pm("mousePressed", btnBox[0], btnBox[1]); await pm("mouseReleased", btnBox[0], btnBox[1]);
    await sleep(3600);
    if (process.env.DEBUG_TELAS) {
      const j0 = ((await api("GET", "/jobs")).jobs || [])[0] || {};
      log("job: " + j0.status + " " + j0.progress);
      log("STATUS via SW: " + JSON.stringify(await pop.eval(`chrome.runtime.sendMessage({type:'STATUS',jobId:'${j0.id}'})`)));
      log("status no popup: " + (await pop.eval("document.getElementById('status').textContent")));
    }
    await fit(pop, "06-popup-baixando.png");
    for (let i = 0; i < 60; i++) { const js = (await api("GET", "/jobs")).jobs || []; if (js[0] && ["done", "error"].includes(js[0].status)) break; await sleep(500); }
    await closeT(pop);
    const popL = await popup("light"); await fit(popL, "07-popup-tema-claro.png"); await closeT(popL);

    // ---------- configurações ----------
    const opt = await openTarget(`chrome-extension://${EXT_ID}/options.html`, 900, 900, 1);
    await opt.eval(`chrome.storage.local.set({theme:'dark'}); document.documentElement.setAttribute('data-theme','dark'); 0`); await sleep(1500);
    const cards = await opt.eval(`[...document.querySelectorAll('.card')].filter(c=>c.offsetParent).map(c=>{const r=c.getBoundingClientRect();return [Math.round(r.top+scrollY),Math.round(r.height)]})`);
    const span = (a, b) => ({ x: 0, y: Math.max(0, cards[a][0] - 18), width: 900, height: cards[b][0] + cards[b][1] - cards[a][0] + 36 });
    await opt.eval("document.getElementById('outDir').value='C:\\\\Users\\\\voce\\\\Downloads\\\\NoeVFX'; 0"); await opt.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 2600, deviceScaleFactor: 1, mobile: false }); await sleep(500);
    const cs = await opt.eval(`[...document.querySelectorAll('.card')].filter(c=>c.offsetParent).map(c=>{const r=c.getBoundingClientRect();return [Math.round(r.top+scrollY),Math.round(r.height)]})`);
    const sp2 = (a, b) => ({ x: 0, y: Math.max(0, cs[a][0] - 18), width: 900, height: cs[b][0] + cs[b][1] - cs[a][0] + 36 });
    log("cartões nas opções: " + cs.length);
    await opt.shot("08-config-servidor-e-pasta.png", sp2(0, 1));
    await opt.shot("09-config-icone-e-qualidade.png", sp2(2, 3));
    await opt.shot("10-config-avancado-e-sobre.png", sp2(4, 5));
    await closeT(opt);

    // ---------- guia de instalação da extensão (gerado pelo instalador) ----------
    const guideHtml = fs.readFileSync(path.join(ROOT, "installers", "common", "guia-extensao.html"), "utf8").replace("__EXT_PATH__", "C:\\Users\\voce\\AppData\\Local\\NoeVFXDownloader\\extension").replace("__APP_PATH__", "C:\\Users\\voce\\AppData\\Local\\NoeVFXDownloader");
    const gf = path.join(tmp, "guia.html"); fs.writeFileSync(gf, guideHtml);
    const guide = await openTarget("about:blank", 860, 1000, 1);
    await guide.send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" });
    await guide.send("Page.navigate", { url: "file:///" + gf.replace(/\\/g, "/") }); await sleep(1500);
    await guide.shot("11-guia-instalar-extensao.png"); await closeT(guide);

    // ---------- servidor desligado ----------
    try { srv.kill(); } catch (_) {} await sleep(1200);
    const popOff = await popup("dark"); await fit(popOff, "12-popup-servidor-offline.png"); await closeT(popOff);

  } catch (e) { console.error("ERRO", e); process.exitCode = 1; }
  await cleanup();
  console.log("Pronto.");
  process.exit(process.exitCode || 0);
})();
