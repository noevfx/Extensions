// Teste em SITE REAL (Edge/Chrome headless + extensão + servidor + yt-dlp de verdade):
//   node tests/real_site.js <url> [segundos-de-download=40] [x,y do mouse (opcional)]
// Abre a página, deixa o player carregar, passa o mouse no 1º vídeo grande, clica no ícone > "Baixar na pasta padrão",
// espera o download (cancela depois dos segundos informados, útil para transmissão ao vivo) e confere o arquivo com ffprobe.
"use strict";
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const net = require("net");

const ROOT = path.resolve(__dirname, "..");
const EXT_ID = "hdmfifeopbmjcfjbjpkfjinejneohlji";
const URL_ALVO = process.argv[2];
const SECS = +process.argv[3] || 40;
if (!URL_ALVO) { console.error("uso: node tests/real_site.js <url> [segundos]"); process.exit(2); }
const BROWSER = process.env.BROWSER || [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium",
].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const log = (...a) => console.log(...a);

class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.cb = new Map(); this.ready = new Promise((r) => (this.ws.onopen = r));
    this.ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.cb.has(d.id)) { this.cb.get(d.id)(d); this.cb.delete(d.id); } }; }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((r) => this.cb.set(id, r)); }
  async eval(expr) { const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    const x = r.result; if (!x) return { error: JSON.stringify(r.error) }; return x.exceptionDetails ? { error: x.exceptionDetails.exception.description } : x.result.value; }
}
function rawReq(port, method, p, body, headers = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: "127.0.0.1", port, method, path: p, headers: { ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { let j = {}; try { j = JSON.parse(b); } catch (_) {} resolve({ status: res.statusCode, json: j }); });
    });
    req.on("error", () => resolve({ status: 0, json: {} }));
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nvf_real_"));
  const sp = await freePort(), dbg = await freePort();
  const extDir = path.join(tmp, "ext"), srvDir = path.join(tmp, "srv"), dl = path.join(tmp, "dl");
  fs.cpSync(path.join(ROOT, "browser"), extDir, { recursive: true });
  fs.mkdirSync(srvDir); fs.copyFileSync(path.join(ROOT, "server", "server.py"), path.join(srvDir, "server.py"));
  // usa o yt-dlp/ffmpeg já instalados (a cópia do servidor procura em ./bin ao lado do server.py)
  const instBin = path.join(process.env.LOCALAPPDATA || "", "NoeVFXDownloader", "server", "bin");
  if (fs.existsSync(instBin)) fs.cpSync(instBin, path.join(srvDir, "bin"), { recursive: true });
  for (const f of ["background.js", "options.js"]) { const p = path.join(extDir, f); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("http://127.0.0.1:8765", "http://127.0.0.1:" + sp)); }

  const srv = spawn(process.platform === "win32" ? "python" : "python3", [path.join(srvDir, "server.py")], { env: { ...process.env, NOEVFX_PORT: String(sp) }, stdio: "ignore", cwd: tmp });
  const H = { Origin: "chrome-extension://" + EXT_ID, "X-NoeVFX-Client": "1" };
  for (let i = 0; i < 60; i++) { if ((await rawReq(sp, "GET", "/health", null, H)).status === 200) break; await sleep(250); }
  await rawReq(sp, "POST", "/config", { output_dir: dl, onboarded: true }, H);
  const health = (await rawReq(sp, "GET", "/health", null, H)).json;
  log("servidor:", health.version, "yt_dlp:", health.yt_dlp, "ffmpeg_ok:", health.ffmpeg_ok);
  const jobs = async () => (await rawReq(sp, "GET", "/jobs", null, H)).json.jobs || [];

  const br = spawn(BROWSER, ["--headless=new", `--remote-debugging-port=${dbg}`, `--user-data-dir=${path.join(tmp, "prof")}`, `--load-extension=${extDir}`,
    "--autoplay-policy=no-user-gesture-required", "--window-size=1280,1000", "--no-first-run", "--no-default-browser-check",
    "--disable-features=DisableLoadExtensionCommandLineSwitch", "about:blank"], { stdio: "ignore" });
  const targets = async () => (await fetch(`http://127.0.0.1:${dbg}/json`)).json();
  for (let i = 0; i < 80; i++) { try { await targets(); break; } catch (_) { await sleep(250); } }
  await sleep(1500);
  const cleanup = async () => { try { br.kill(); } catch (_) {} try { srv.kill(); } catch (_) {} await sleep(500); if (!process.env.KEEP) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} } };

  try {
    let swT = null;
    for (let i = 0; i < 20 && !swT; i++) { swT = (await targets()).find((x) => x.type === "service_worker" && x.url.startsWith(`chrome-extension://${EXT_ID}/`)); if (!swT) await sleep(300); }
    if (!swT) throw new Error("extensão não carregou");
    const sw = new Cdp(swT.webSocketDebuggerUrl); await sw.ready;
    await sw.eval(`self.__m = [];
      const h = (x) => { let a = 0; for (let i = 0; i < x.length; i += 7) a = (a * 31 + x.charCodeAt(i)) | 0; return a; };
      chrome.runtime.onMessage.addListener((m) => { if (!m || m.type === "RESCAN_TAB") return;
        self.__m.push({ type: m.type, url: m.url || "", fallback: m.fallbackStream || "", items: (m.items || []).map((i) => ({ url: i.url, kind: i.kind, title: (i.title || "").slice(0, 50), pri: i.pri || 0, th: i.thumb ? (i.thumb.startsWith("data:") ? "frame#" + h(i.thumb) : i.thumb.slice(0, 60)) : 0 })) }); });0`);
    const rec = async () => JSON.parse(await sw.eval("JSON.stringify(self.__m)"));

    const page = new Cdp((await targets()).find((x) => x.type === "page" && !x.url.startsWith("chrome-extension://") && !x.url.startsWith("edge://")).webSocketDebuggerUrl); await page.ready;
    for (const m of ["Page.enable", "Runtime.enable", "DOM.enable"]) await page.send(m);
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
    await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await page.send("Page.navigate", { url: URL_ALVO });
    await sleep(9000);
    await page.send("Page.bringToFront");
    log("\npágina:", await page.eval("location.href"), "|", await page.eval("document.title"));
    // aceita faixa de cookies comum e rola um pouco (players em iframe costumam carregar só quando aparecem)
    await page.eval(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/accept all|aceitar|accept/i.test(x.textContent||""));if(b)b.click();window.scrollBy(0,350)})()`);
    await sleep(4000);
    log("iframes:", await page.eval(`JSON.stringify([...document.querySelectorAll("iframe")].map(f=>{const r=f.getBoundingClientRect();return Math.round(r.width)+"x"+Math.round(r.height)+" "+(f.src||f.dataset.src||"").slice(0,70)}))`));

    // acha o maior <video> e leva até ele
    const info = await page.eval(`(()=>{const vs=[...document.querySelectorAll("video")].map(v=>{const r=v.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),t:Math.round(r.top+scrollY),paused:v.paused,rs:v.readyState,src:(v.currentSrc||v.src||"").slice(0,70)}});
      const holders=[...document.querySelectorAll("[data-video-id]")].map(e=>e.getAttribute("data-video-id")+(e.querySelector("video")?"(video)":"(sem video)"));return JSON.stringify({vs,holders})})()`);
    log("vídeos na página:", info);
    const big = await page.eval(`(()=>{const vs=[...document.querySelectorAll("video")].filter(v=>{const r=v.getBoundingClientRect();return r.width>=150&&r.height>=90}).sort((a,b)=>b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height);
      if(!vs[0]) return null; vs[0].scrollIntoView({block:"center"}); const r=vs[0].getBoundingClientRect(); return [r.left+r.width/2,r.top+r.height/2]})()`);
    let ifr = null;
    if (!big) {
      // player dentro de IFRAME (Vimeo, Hotmart...): o <video> fica em outro documento; o mouse vai no centro do iframe
      ifr = await page.eval(`(()=>{const f=[...document.querySelectorAll("iframe")].filter(f=>{const r=f.getBoundingClientRect();return r.width>=250&&r.height>=140}).sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width)[0];
        if(!f) return null; f.scrollIntoView({block:"center"}); const r=f.getBoundingClientRect(); return [r.left+r.width/2,r.top+r.height/2,f.src.slice(0,90)]})()`);
      log(ifr ? "player em iframe: " + ifr[2] : "NENHUM <video> nem iframe grande encontrado");
    }
    await sleep(2500);
    const pt = ifr ? await page.eval(`(()=>{const f=[...document.querySelectorAll("iframe")].filter(f=>{const r=f.getBoundingClientRect();return r.width>=250&&r.height>=140}).sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width)[0];const r=f.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`) : big ? await page.eval(`(()=>{const vs=[...document.querySelectorAll("video")].filter(v=>{const r=v.getBoundingClientRect();return r.width>=150&&r.height>=90}).sort((a,b)=>b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height);const r=vs[0].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`) : null;
    const mouse = (type, x, y) => page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: type === "mousePressed" ? 1 : 0 });
    const findNode = async (sel) => {
      const doc = await page.send("DOM.getDocument", { depth: -1, pierce: true });
      const walk = (n) => { if ((n.attributes || []).includes("noevfx-hover-host")) return n; for (const c of n.children || []) { const r = walk(c); if (r) return r; } return null; };
      const host = walk(doc.result.root);
      if (!host || !host.shadowRoots || !host.shadowRoots.length) return null;
      const q = await page.send("DOM.querySelector", { nodeId: host.shadowRoots[0].nodeId, selector: sel });
      return q.result && q.result.nodeId ? q.result.nodeId : null;
    };
    const center = async (nodeId) => { const r = await page.send("DOM.getBoxModel", { nodeId }); if (!r.result) return null; const q = r.result.model.content; return [(q[0] + q[4]) / 2, (q[1] + q[5]) / 2]; };
    if (pt) {
      await mouse("mouseMoved", 3, 3); await sleep(300); await mouse("mouseMoved", pt[0] - 15, pt[1] - 15); await sleep(300); await mouse("mouseMoved", pt[0], pt[1]); await sleep(1200);
    }
    log("ícone da extensão apareceu:", !!(await findNode(".fab")));
    const msgs = await rec();
    const seen = new Map(); for (const m of msgs) for (const it of m.items || []) seen.set(it.url, it);
    log("\nitens que a extensão publicou na lista:"); for (const it of seen.values()) log("  -", it.kind, (process.env.FULLURL ? it.url : it.url.slice(0, 260)), "| thumb:", it.th, "| pri:", it.pri);
    if (!seen.size) log("  (nenhum)");

    // (o ícone some sozinho depois de 2 s parado: mexe o mouse de novo e clica logo)
    await mouse("mouseMoved", pt[0] - 8, pt[1] - 8); await sleep(200); await mouse("mouseMoved", pt[0], pt[1]); await sleep(500);
    const fab = await findNode(".fab");
    if (fab) {
      const fc = await center(fab);
      await mouse("mouseMoved", fc[0], fc[1]); await mouse("mousePressed", fc[0], fc[1]); await mouse("mouseReleased", fc[0], fc[1]); await sleep(700);
      const main = await findNode("button.opt.main");
      if (main) {
        const mc = await center(main);
        await mouse("mouseMoved", mc[0], mc[1]); await mouse("mousePressed", mc[0], mc[1]); await mouse("mouseReleased", mc[0], mc[1]);
        const t0 = Date.now(); let j = null;
        for (let i = 0; i < 20 && !j; i++) { await sleep(300); const js = await jobs(); if (js.length) j = js[0]; }
        const dlm = (await rec()).filter((m) => m.type === "DOWNLOAD").pop();
        log("\nDOWNLOAD pedido pela extensão:", dlm ? dlm.url : "(nenhum)", dlm && dlm.fallback ? "| plano B: " + dlm.fallback : "");
        let last = "";
        while (j && Date.now() - t0 < SECS * 1000) {
          await sleep(1500); j = (await jobs())[0];
          const st = j.status + " " + (j.progress || ""); if (st !== last) { last = st; log("  job:", st.slice(0, 100)); }
          if (["done", "error", "canceled"].includes(j.status)) break;
        }
        if (j && !["done", "error", "canceled"].includes(j.status)) { await rawReq(sp, "POST", "/cancel", { job_id: j.id }, H); log("  (cancelado após", SECS, "s)"); await sleep(4000); j = (await jobs())[0]; }
        log("resultado do job:", j && j.status, j && (j.error || ""));
        const files = fs.existsSync(dl) ? fs.readdirSync(dl).filter((f) => !f.endsWith(".part") && !f.endsWith(".ytdl")) : [];
        log("arquivos na pasta de destino:", files);
        for (const f of files) {
          const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration,size", "-of", "default=nw=1", path.join(dl, f)], { encoding: "utf8" });
          log("  ffprobe", f.slice(0, 40), "->", (r.stdout || r.stderr || "").replace(/\n/g, " ").slice(0, 200));
        }
      } else log("painel não abriu");
    }
  } catch (e) { log("ERRO", e && e.stack || e); } finally { await cleanup(); }
})();
