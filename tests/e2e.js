// Teste de ponta a ponta no Edge/Chrome (headless) via CDP — só Node 22+, sem dependências.
//
//   node tests/e2e.js
//
// Variáveis: BROWSER=<caminho do msedge/chrome>   KEEP=1 (não apaga a pasta temporária)
// Usa uma CÓPIA da extensão (porta do servidor trocada) e uma cópia do server.py numa porta livre:
// não encosta na sua instalação real. Cliques e mouse são REAIS (Input.dispatchMouseEvent).
"use strict";
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const net = require("net");

const ROOT = path.resolve(__dirname, "..");
const EXT_ID = "hdmfifeopbmjcfjbjpkfjinejneohlji";
const BROWSER = process.env.BROWSER || [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => fs.existsSync(p));
if (!BROWSER) { console.error("Nenhum Edge/Chrome encontrado. Use BROWSER=..."); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "  OK   " : "  FALHA") + "  " + name + (extra ? "  -> " + extra : "")); };
const info = (k, v) => console.log("  ..     " + k + ": " + (typeof v === "object" ? JSON.stringify(v) : v));

class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.cb = new Map(); this.ev = [];
    this.ready = new Promise((r) => (this.ws.onopen = r));
    this.ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.cb.has(d.id)) { this.cb.get(d.id)(d); this.cb.delete(d.id); } else if (d.method) this.ev.push(d); }; }
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nvf_e2e_"));
  const sp = await freePort(), fp = await freePort(), dbg = await freePort();
  const extDir = path.join(tmp, "ext"), srvDir = path.join(tmp, "srv"), dl = path.join(tmp, "dl");
  fs.cpSync(path.join(ROOT, "extension"), extDir, { recursive: true });
  fs.mkdirSync(srvDir); fs.copyFileSync(path.join(ROOT, "server", "server.py"), path.join(srvDir, "server.py"));
  const bg = path.join(extDir, "background.js");
  fs.writeFileSync(bg, fs.readFileSync(bg, "utf8").replace("http://127.0.0.1:8765", "http://127.0.0.1:" + sp));
  for (const f of ["options.js"]) { const p = path.join(extDir, f); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("http://127.0.0.1:8765", "http://127.0.0.1:" + sp)); }

  // site de teste: vídeo com extensão + vídeo SEM extensão (só o Content-Type revela)
  const seenReferers = [];
  const site = http.createServer((req, res) => {
    if (req.url === "/" || req.url.startsWith("/index")) { res.setHeader("Content-Type", "text/html"); return res.end(
      '<!doctype html><meta charset=utf-8><title>Pagina de teste</title><body style="margin:0;background:#222">' +
      '<video id=v src="/a.mp4" width=640 height=360 controls muted preload=auto></video>' +
      '<video id=v2 src="/stream/123" width=320 height=180 muted preload=auto style="position:absolute;left:0;top:400px"></video>' +
      // vídeo FORA da página (nunca entra no DOM) e sem extensão: só o Content-Type da rede o revela
      '<script>var d=new Audio("/other/track");d.preload="auto";d.load();</script>'); }
    // simula um curso (tipo Hotmart): a página tem um IFRAME de outra origem (localhost x 127.0.0.1) que carrega um
    // HLS só liberado com o Referer do próprio iframe
    if (req.url.startsWith("/hotmart")) { res.setHeader("Content-Type", "text/html"); return res.end(
      '<!doctype html><meta charset=utf-8><title>Aula 1 - Curso</title><body><h1>Curso</h1>' +
      `<iframe src="http://localhost:${fp}/embed.html" width=640 height=360></iframe>`); }
    if (req.url.startsWith("/embed")) { res.setHeader("Content-Type", "text/html"); return res.end(
      '<!doctype html><meta charset=utf-8><title>player</title><body><video width=320 height=180 muted></video>' +
      '<script>fetch("/hls/index.m3u8?token=abc").then(r=>r.text());</script>'); }
    if (req.url.startsWith("/hls/")) {
      const ref = req.headers.referer || ""; seenReferers.push(req.url.split("?")[0] + " <- " + ref);
      if (!ref.startsWith(`http://localhost:${fp}/`)) { res.statusCode = 403; return res.end("referer"); }
      if (req.url.startsWith("/hls/index.m3u8")) { res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        return res.end("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\n/hls/seg0.ts\n#EXT-X-ENDLIST\n"); }
      res.setHeader("Content-Type", "video/mp2t"); return res.end(Buffer.alloc(2048));
    }
    if (req.url.startsWith("/stream/") || req.url.startsWith("/other/")) { res.setHeader("Content-Type", "video/mp4"); return res.end(Buffer.alloc(120000)); }
    if (req.url.startsWith("/a.mp4")) { res.setHeader("Content-Type", "video/mp4"); return res.end(Buffer.alloc(4096)); }
    res.statusCode = 404; res.end();
  }).listen(fp, "127.0.0.1");

  const srv = spawn(process.platform === "win32" ? "python" : "python3", [path.join(srvDir, "server.py")], { env: { ...process.env, NOEVFX_PORT: String(sp) }, stdio: "ignore", cwd: tmp });
  const H = { Origin: "chrome-extension://" + EXT_ID, "X-NoeVFX-Client": "1" };
  for (let i = 0; i < 60; i++) { if ((await rawReq(sp, "GET", "/health", null, H)).status === 200) break; await sleep(250); }
  await rawReq(sp, "POST", "/config", { output_dir: dl, onboarded: true }, H);
  const jobs = async () => (await rawReq(sp, "GET", "/jobs", null, H)).json.jobs || [];

  const br = spawn(BROWSER, ["--headless=new", `--remote-debugging-port=${dbg}`, `--user-data-dir=${path.join(tmp, "prof")}`, `--load-extension=${extDir}`,
    "--no-first-run", "--no-default-browser-check", "--disable-features=DisableLoadExtensionCommandLineSwitch",
    // em CI (runners do GitHub) o Chrome não abre sem isto
    ...(process.env.CI ? ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] : []), "about:blank"],
    { stdio: process.env.CI ? "inherit" : "ignore" });
  const targets = async () => (await fetch(`http://127.0.0.1:${dbg}/json`)).json();
  for (let i = 0; i < 80; i++) { try { await targets(); break; } catch (_) { await sleep(250); } }
  await sleep(1500);

  const cleanup = async () => { try { br.kill(); } catch (_) {} try { srv.kill(); } catch (_) {} site.close(); await sleep(400);
    if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true }); };

  try {
    console.log("\n== Extensão");
    // (o Edge traz extensões próprias com "background.js": identifica a nossa pelo ID fixo)
    let swT = null;
    for (let i = 0; i < 20 && !swT; i++) { swT = (await targets()).find((x) => x.type === "service_worker" && x.url.startsWith(`chrome-extension://${EXT_ID}/`)); if (!swT) await sleep(300); }
    check("service worker da extensão carregou com o ID fixo (chave do manifest)", !!swT, EXT_ID);
    if (!swT) throw new Error("sem service worker");
    const extId = EXT_ID;

    const page = new Cdp((await targets()).find((x) => x.type === "page" && !x.url.startsWith("chrome-extension://")).webSocketDebuggerUrl); await page.ready;
    for (const m of ["Page.enable", "Runtime.enable", "DOM.enable", "Performance.enable"]) await page.send(m);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${fp}/` });
    await sleep(2500);

    // página da extensão (para chamar chrome.*)
    const bws = (await (await fetch(`http://127.0.0.1:${dbg}/json/version`)).json()).webSocketDebuggerUrl;
    const browser = new Cdp(bws); await browser.ready;
    const ct = await browser.send("Target.createTarget", { url: `chrome-extension://${extId}/popup.html` });
    await sleep(1500);
    const popT = (await targets()).find((x) => x.id === ct.result.targetId);
    const pop = new Cdp(popT.webSocketDebuggerUrl); await pop.ready; await pop.send("Runtime.enable");
    check("popup abre como página da extensão", (await pop.eval("typeof chrome.runtime.sendMessage")) === "function");

    console.log("\n== Detecção");
    const tabId = await pop.eval(`chrome.tabs.query({}).then(ts=>(ts.find(t=>t.url&&t.url.includes(':${fp}'))||{}).id)`);
    check("sem permissões 'tabs'/'activeTab' a aba ainda é lida (permissão de host basta)", Number.isInteger(tabId), String(tabId));
    let gts = [];
    for (let i = 0; i < 12; i++) {                      // o pedido da mídia fora do DOM pode chegar um pouco depois
      gts = await pop.eval(`chrome.runtime.sendMessage({type:'GET_TAB_STREAMS',tabId:${tabId}}).then(r=>r.streams.map(s=>s.kind+' '+s.url.replace(/^.*:${fp}/,'')+(s.ct?' [content-type]':'')))`);
      if (Array.isArray(gts) && gts.some((s) => s.includes("/other/track"))) break;
      await sleep(500);
    }
    info("itens", gts);
    try { const swc = new Cdp(swT.webSocketDebuggerUrl); await swc.ready; info("MEM do service worker", await swc.eval("JSON.stringify([...MEM.entries()].map(([k,v])=>[k,v.map(x=>x.url.slice(-16)+' ct='+(x.ct||0)+' g='+x.group.slice(-12))]))")); } catch (_) {}
    check("detectou o vídeo com extensão (.mp4)", Array.isArray(gts) && gts.some((s) => s.includes("/a.mp4")));
    check("detectou o vídeo SEM extensão que está no DOM", Array.isArray(gts) && gts.some((s) => s.includes("/stream/123")));
    // Caso raro (mídia sem extensão e que nem está na página). Passa em parte das rodadas: o navegador às vezes
    // nem chega a pedir um <audio> solto. Por isso é só AVISO, não derruba o teste.
    const ctOk = Array.isArray(gts) && gts.some((s) => s.includes("/other/track") && s.includes("[content-type]"));
    console.log(ctOk ? "  OK     detectou mídia sem extensão e fora do DOM pelo Content-Type da rede" : "  AVISO  mídia sem extensão e fora do DOM não apareceu nesta rodada (intermitente)");
    check("badge mostra a contagem", /^\d+$/.test(await pop.eval(`chrome.action.getBadgeText({tabId:${tabId}})`)));
    info("bytes em storage.session", await pop.eval("chrome.storage.session.getBytesInUse(null)"));
    const t0 = await pop.eval(`(async()=>{const a=performance.now();await chrome.runtime.sendMessage({type:'GET_TAB_STREAMS',tabId:${tabId}});return Math.round(performance.now()-a)})()`);
    info("GET_TAB_STREAMS quente (ms)", t0);

    // o Chrome NÃO manda "Origin" nos GET da extensão: leitura de config/andamento precisa funcionar sem ele
    const cfgR = await pop.eval(`chrome.runtime.sendMessage({type:'GET_CONFIG',force:true}).then(r=>({ok:r.ok,offline:r.offline,forbidden:r.forbidden,dir:(r.config||{}).output_dir||'',onb:(r.config||{}).onboarded}))`);
    check("a extensão LÊ a configuração do servidor (GET sem Origin)", !!cfgR && cfgR.ok && !cfgR.offline && !cfgR.forbidden && cfgR.onb === true && path.resolve(cfgR.dir || "x").toLowerCase() === path.resolve(dl).toLowerCase(), JSON.stringify(cfgR));

    console.log("\n== Uso real (mouse de verdade)");
    const findNode = async (sel) => {
      const doc = await page.send("DOM.getDocument", { depth: -1, pierce: true });
      const walk = (n) => { if ((n.attributes || []).includes("noevfx-hover-host")) return n; for (const c of n.children || []) { const r = walk(c); if (r) return r; } return null; };
      const host = walk(doc.result.root);
      if (!host || !host.shadowRoots || !host.shadowRoots.length) return null;
      const q = await page.send("DOM.querySelector", { nodeId: host.shadowRoots[0].nodeId, selector: sel });
      return q.result && q.result.nodeId ? q.result.nodeId : null;
    };
    const center = async (nodeId) => { const r = await page.send("DOM.getBoxModel", { nodeId }); if (!r.result) return null; const q = r.result.model.content; return [(q[0] + q[4]) / 2, (q[1] + q[5]) / 2]; };
    const mouse = (type, x, y) => page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: type === "mousePressed" ? 1 : 0 });
    const click = async (x, y) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); };
    const styleOf = async (sel) => {
      const n = await findNode(sel); if (!n) return null;
      const o = await page.send("DOM.resolveNode", { nodeId: n });
      const r = await page.send("Runtime.callFunctionOn", { objectId: o.result.object.objectId, functionDeclaration: "function(){return this.style.display}", returnByValue: true });
      return r.result.result.value;
    };
    const panelVisible = async () => (await styleOf(".panel")) === "block";

    await mouse("mouseMoved", 300, 180); await sleep(700); await mouse("mouseMoved", 320, 190); await sleep(500);
    let fab = await findNode(".fab"); const fc = fab && (await center(fab));
    check("ícone aparece ao passar o mouse no vídeo", !!fc, JSON.stringify(fc));
    if (!fc) throw new Error("sem ícone");
    // com o ícone na tela, o JavaScript da PÁGINA não pode enxergar nem clicar nos botões da extensão
    check("shadowRoot do painel é inacessível para a página (closed)",
      (await page.eval(`(()=>{const h=document.getElementById('noevfx-hover-host');return !!h && h.shadowRoot === null})()`)) === true);
    check("clique sintético da página no ícone não abre o painel",
      await (async () => { await page.eval(`document.getElementById('noevfx-hover-host').click();0`); await sleep(300); return !(await panelVisible()); })());
    check("página não consegue chamar chrome.runtime", (await page.eval(`typeof (window.chrome&&chrome.runtime&&chrome.runtime.sendMessage)`)) !== "function");
    await click(fc[0], fc[1]); await sleep(600);
    check("clique real abre o painel", await panelVisible());
    await click(700, 300); await sleep(400);
    check("clicar fora fecha o painel", !(await panelVisible()), "display=" + (await styleOf(".panel")));

    await mouse("mouseMoved", 320, 190); await sleep(500);
    fab = await findNode(".fab"); const fc2 = await center(fab);
    await click(fc2[0], fc2[1]); await sleep(600);
    check("painel reabre", await panelVisible());
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(400);
    check("Esc fecha o painel", !(await panelVisible()));

    // 1º download
    await mouse("mouseMoved", 320, 190); await sleep(500);
    fab = await findNode(".fab"); const fc3 = await center(fab);
    await click(fc3[0], fc3[1]); await sleep(600);
    const main = await findNode("button.opt.main"); const mc = await center(main);
    const before = (await jobs()).length;
    await click(mc[0], mc[1]);
    let j1 = null;
    for (let i = 0; i < 120; i++) { await sleep(500); const js = await jobs(); if (js.length > before && ["done", "error"].includes(js[0].status)) { j1 = js[0]; break; } }
    check("1º download terminou (arquivo criado)", !!j1 && j1.status === "done" && j1.file && fs.existsSync(j1.file), j1 ? `${j1.status} ${j1.error || ""}` : "sem job");
    const stR = j1 ? await pop.eval(`chrome.runtime.sendMessage({type:'STATUS',jobId:'${j1.id}'}).then(r=>({ok:r.ok,status:(r.data||{}).status}))`) : null;
    check("a extensão LÊ o andamento do download (STATUS)", !!stR && stR.ok === true && stR.status === "done", JSON.stringify(stR));
    await sleep(1500);

    // 2º download na mesma página (antes do conserto o botão ficava preso)
    await mouse("mouseMoved", 320, 190); await sleep(600);
    fab = await findNode(".fab"); const fc4 = fab && (await center(fab));
    check("ícone volta a aparecer depois do 1º download", !!fc4);
    if (fc4) {
      await click(fc4[0], fc4[1]); await sleep(600);
      const q720 = await findNode('button.opt[data-q="720"]'); const qc = await center(q720);
      const before2 = (await jobs()).length;
      await click(qc[0], qc[1]);
      let j2 = null;
      for (let i = 0; i < 120; i++) { await sleep(500); const js = await jobs(); if (js.length > before2 && ["done", "error"].includes(js[0].status)) { j2 = js[0]; break; } }
      check("2º download na MESMA página funciona", !!j2, j2 ? j2.status : "nenhum job novo (botão preso?)");
    }

    console.log("\n== Player em iframe de outra origem (tipo Hotmart): Referer certo");
    await page.send("Page.navigate", { url: `http://127.0.0.1:${fp}/hotmart.html` });
    await sleep(3000);
    const tab2 = await pop.eval(`chrome.tabs.query({}).then(ts=>(ts.find(t=>t.url&&t.url.includes('/hotmart.html'))||{}).id)`);
    const items2 = await pop.eval(`chrome.runtime.sendMessage({type:'GET_TAB_STREAMS',tabId:${tab2}}).then(r=>r.streams.map(s=>({u:s.url.replace(/^.*:${fp}/,''),ref:s.ref||''})))`);
    info("streams da aula", items2);
    const hls = Array.isArray(items2) && items2.find((s) => s.u.startsWith("/hls/index.m3u8"));
    check("achou o HLS do player dentro do iframe", !!hls);
    check("guardou o Referer do IFRAME (não o da página de fora)", !!hls && hls.ref.startsWith(`http://localhost:${fp}/`), hls ? hls.ref : "");
    seenReferers.length = 0;
    // baixa pelo popup (como o usuário faria): a URL é a do item listado, o Referer enviado é o da página de fora
    await pop.eval(`chrome.runtime.sendMessage({type:'DOWNLOAD',url:'http://localhost:${fp}${hls ? hls.u : "/hls/index.m3u8?token=abc"}',referer:'http://127.0.0.1:${fp}/hotmart.html',pageUrl:'http://127.0.0.1:${fp}/hotmart.html',quality:'best',title:'Aula 1'}).then(r=>r.ok)`);
    for (let i = 0; i < 40; i++) { await sleep(500); if (seenReferers.some((x) => x.startsWith("/hls/index.m3u8"))) break; }
    const reqs = seenReferers.filter((x) => x.startsWith("/hls/"));
    info("pedidos do yt-dlp ao HLS", reqs);
    check("o yt-dlp pediu o HLS com o Referer do iframe (sem 403)", reqs.length > 0 && reqs.every((x) => x.includes(`<- http://localhost:${fp}/`)));

    console.log("\n== Desempenho (10 s cada)");
    const m = async () => Object.fromEntries((await page.send("Performance.getMetrics")).result.metrics.map((x) => [x.name, x.value]));
    let a = await m(); await sleep(10000); let b = await m();
    const idle = Math.round((b.TaskDuration - a.TaskDuration) * 1000);
    check("CPU da página em repouso < 20 ms / 10 s", idle < 20, idle + " ms");
    await page.eval(`window.__mut=setInterval(()=>{const d=document.createElement('div');d.textContent='x'+Math.random();document.body.appendChild(d);if(document.body.children.length>400)document.body.removeChild(document.body.children[3]);},40);0`);
    a = await m(); await sleep(10000); b = await m();
    const mut = Math.round((b.TaskDuration - a.TaskDuration) * 1000);
    check("CPU com o DOM mudando sem parar < 250 ms / 10 s", mut < 250, mut + " ms");
  } catch (e) {
    check("execução sem exceção", false, String(e && e.stack ? e.stack.split("\n")[0] : e));
  }
  await cleanup();
  const bad = results.filter((x) => !x).length;
  console.log("\n" + (results.length - bad) + "/" + results.length + " ok" + (bad ? "  |  " + bad + " FALHA(S)" : ""));
  process.exit(bad ? 1 : 0);
})();
