// Teste de comportamento "igual em todos os sites" (Edge/Chrome headless, via CDP, só Node 22+):
//   - feed estilo Instagram (vídeo COBERTO por camadas, blob:, pedaços no CDN)  -> ícone, 1 item por vídeo, miniatura própria
//   - site de página única estilo TikTok (troca de vídeo sem recarregar)        -> lista e miniatura acompanham a página
//   - matéria estilo G1 (vídeo vertical estreito, vários players)               -> ícone na moldura, miniatura própria, baixa o certo
//   - player dentro de shadow DOM                                               -> ícone aparece
//   node tests/e2e_sites.js     (precisa de ffmpeg e openssl no PATH: gera 3 vídeos de cores diferentes e um certificado de teste)
// Confere o que a extensão ENVIA ao service worker (mensagens), sem depender de a aba ser legível pelas APIs do navegador.
// Os domínios www.instagram.com / www.tiktok.com / scontent.cdninstagram.com apontam para a máquina local
// (--host-resolver-rules) e o site de teste é https com certificado próprio: nada sai para a internet.
"use strict";
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const https = require("https");
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
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.cb = new Map();
    this.ready = new Promise((r) => (this.ws.onopen = r));
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nvf_sites_"));
  const sp = await freePort(), fp = await freePort(), dbg = await freePort();
  const extDir = path.join(tmp, "ext"), srvDir = path.join(tmp, "srv"), dl = path.join(tmp, "dl");
  fs.cpSync(path.join(ROOT, "browser"), extDir, { recursive: true });
  fs.mkdirSync(srvDir); fs.copyFileSync(path.join(ROOT, "server", "server.py"), path.join(srvDir, "server.py"));
  // o app do teste fica 1 versão À FRENTE da extensão (como num 2º perfil do navegador depois de atualizar pelo 1º)
  { const sp0 = path.join(srvDir, "server.py"); const mv = JSON.parse(fs.readFileSync(path.join(ROOT, "browser", "manifest.json"), "utf8")).version.split(".").map(Number);
    fs.writeFileSync(sp0, fs.readFileSync(sp0, "utf8").replace(/VERSION = "[\d.]+"/, `VERSION = "${mv[0]}.${mv[1]}.${mv[2] + 1}"`)); }
  for (const f of ["background.js", "options.js"]) { const p = path.join(extDir, f); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("http://127.0.0.1:8765", "http://127.0.0.1:" + sp)); }

  // 3 vídeos de cores bem diferentes (a miniatura de cada um precisa ser DIFERENTE das outras)
  const vids = ["red", "green", "blue"].map((c, i) => {
    const f = path.join(tmp, `v${i}.mp4`);
    const r = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", `color=c=${c}:s=320x240:d=3:r=15`, "-pix_fmt", "yuv420p", "-movflags", "+faststart", f], { stdio: "ignore" });
    if (r.status !== 0) { console.error("ffmpeg não gerou o vídeo de teste " + c); process.exit(2); }
    return fs.readFileSync(f);
  });
  // (o Chrome força https em instagram.com/tiktok.com por HSTS embutido)
  const key = path.join(tmp, "k.pem"), crt = path.join(tmp, "c.pem");
  if (spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", crt, "-days", "2", "-subj", "/CN=teste"], { stdio: "ignore" }).status !== 0) {
    console.error("openssl não gerou o certificado de teste"); process.exit(2);
  }

  const CDN = `https://scontent.cdninstagram.com:${fp}`;
  // o vídeo chega como blob: (como no Instagram/TikTok), vindo de uma URL com pedaços (bytestart/byteend) no CDN
  const blobJs = `async function loadBlob(v, i) {
      const r = await fetch("${CDN}/v/t16/f2/m86/AQ" + i + "x.mp4?bytestart=0&byteend=99999&efg=1");
      v.src = URL.createObjectURL(await r.blob()); v.play().catch(() => {});
    }`;

  const site = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, (req, res) => {
    const host = (req.headers.host || "").split(":")[0];
    const url = req.url.split("?")[0];
    const m = url.match(/^\/v\/.*AQ(\d)x\.mp4$/);
    if (m) { res.writeHead(200, { "Content-Type": "video/mp4", "Access-Control-Allow-Origin": "*" }); return res.end(vids[+m[1]]); }
    if (url.startsWith("/ext_tw_video/") || url.startsWith("/amplify_video/")) { res.writeHead(200, { "Content-Type": "video/mp4", "Access-Control-Allow-Origin": "*" }); return res.end(vids[1]); }
    if (url.startsWith("/videos/iht/")) { res.writeHead(200, { "Content-Type": "video/mp4", "Access-Control-Allow-Origin": "*" }); return res.end(vids[1]); }
    if (host === "www.pinterest.com" && url.startsWith("/resource/PinResource/get/")) {
      // API do próprio Pinterest (mesma origem): pin 111... = carrossel com 2 vídeos; 222... = vídeo único (story pin, só HLS)
      const dq = new URL(req.url, "https://x").searchParams.get("data");
      if (!dq) { console.log("  (API sem data: " + url.slice(0, 120) + ")"); res.writeHead(400); return res.end("x"); }
      const id = JSON.parse(dq).options.id;
      const vl = (h) => ({ V_720P: { url: "https://v1.pinimg.com/videos/iht/expMp4/aa/bb/cc/" + h + "_720w.mp4", width: 720, thumbnail: "https://i.pinimg.com/videos/thumbnails/originals/aa/bb/cc/" + h + ".0000000.jpg" } });
      const data = id.startsWith("111")
        ? { seo_title: "Motion poster com texto 3d | Morphing type, Graphicdesign", carousel_data: { carousel_slots: [{ videos: { video_list: vl("a".repeat(32)) }, images: {} }, { videos: { video_list: vl("b".repeat(32)) }, images: {} }] } }
        : { seo_title: "Segundo pin | Logo", story_pin_data: { pages: [{ blocks: [{ video: { video_list: { V_HLSV3_MOBILE: { url: "https://v1.pinimg.com/videos/iht/hls/aa/bb/cc/" + "c".repeat(32) + ".m3u8", thumbnail: "https://i.pinimg.com/videos/thumbnails/originals/aa/bb/cc/" + "c".repeat(32) + ".0000000.jpg" } } } }] }] } };
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ resource_response: { data } }));
    }
    if (url.startsWith("/fbv/")) { res.writeHead(200, { "Content-Type": "video/mp4", "Access-Control-Allow-Origin": "*" }); return res.end(vids[0]); }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (host === "www.pinterest.com" && url.startsWith("/pin/3333")) {
      return res.end(`<!doctype html><meta charset=utf-8><title>Pin logado</title><body style="margin:0;background:#111;color:#fff">
        <div data-test-id="relatedPins"><div data-test-id="feed"><div>
          ${"<div>".repeat(6)}<video muted playsinline autoplay loop width=500 height=640 data-i=0 poster="https://i.pinimg.com/736x/b8/3b/95/b83b95aaaaaaaaaaaaaaaaaaaaaaaaaa.jpg"></video>${"</div>".repeat(6)}
          <div role="listitem" style="width:200px"><video muted playsinline autoplay loop width=200 height=260 data-i=1></video></div>
        </div></div></div>
        <script>${blobJs}; document.querySelectorAll("video").forEach((v) => loadBlob(v, v.dataset.i));</script>`);
    }
    if (host === "www.pinterest.com") {
      // pin aberto: o pin principal só tem IMAGENS no DOM (o carrossel); abaixo, "relacionados": cartões com vídeo blob:, um com link
      // /pin/ID/ e outro SEM link; o link /pin/ID/repin do pin principal fica num ancestral de TODOS os cartões (não pode vazar)
      const card = (i, href) => `<div role="listitem" style="width:260px;margin:10px"><div>${href ? `<a href="${href}"></a>` : ""}${"<div>".repeat(8)}<video muted playsinline autoplay loop width=240 height=300 data-i=${i} poster="https://i.pinimg.com/videos/thumbnails/originals/aa/bb/cc/${String(i).repeat(32)}.0000000.jpg"></video>${"</div>".repeat(8)}</div></div>`;
      return res.end(`<!doctype html><meta charset=utf-8><title>Pin em Algum Site</title><body style="margin:0;background:#111;color:#fff">
        <div data-test-id="CloseupMainPin"><ul><li><img width=300 height=300 src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></li><li><img width=300 height=300 src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></li></ul></div>
        <a href="/pin/1111111111111111111/repin"></a>
        <div data-test-id="relatedPins">${card(0, "/pin/2222222222222222222/")}${card(1, "")}</div>
        <script>${blobJs}; document.querySelectorAll("video").forEach((v) => loadBlob(v, v.dataset.i));
          for (let i = 0; i < 6; i++) fetch("https://v1.pinimg.com:${fp}/videos/iht/hls/aa/bb/cc/" + "d".repeat(32) + "_" + i + "_360w.m3u8").then(r => r.blob());
          fetch("https://v1.pinimg.com:${fp}/videos/iht/expMp4/aa/bb/cc/" + "e".repeat(32) + "_720w.mp4").then(r => r.blob());
          for (const suf of ["_360w.m3u8", "_audio.m3u8"]) fetch("https://v1.pinimg.com:${fp}/videos/iht/hls/aa/bb/cc/" + "1".repeat(32) + suf).then(r => r.blob());</script>`);
    }
    if (host === "www.facebook.com") {
      // feed do Facebook: cada post é um [role=article]; o vídeo (blob:) fica fundo; o link do vídeo/reel está no cabeçalho
      // junto de outros links (grupo, perfil); o vídeo chega em pedaços de fbcdn.net
      const post = (i, head, link) => `<div role="article" style="width:420px;margin:12px 0;color:#fff">
        <h3><a href="/pagina${i}/">${head}</a></h3><a href="/groups/grupo${i}/">grupo</a>
        <a href="${link}" role="link"><span>3 d</span></a>
        <div>${"<div>".repeat(12)}<video muted playsinline autoplay loop width=360 height=270 data-i=${i}></video>${"</div>".repeat(12)}
          <div class="cover" style="position:absolute;inset:0"></div></div></div>`;
      return res.end(`<!doctype html><meta charset=utf-8><title>Facebook</title><body style="margin:0;background:#18191a">
        ${post(0, "Página Um", "/paginaum/videos/1234567890123456/?ref=feed")}
        ${post(1, "Página Dois", "/reel/9876543210987654/")}
        <script>${blobJs}; document.querySelectorAll("video").forEach((v) => loadBlob(v, v.dataset.i));
          for (let i = 0; i < 6; i++) fetch("https://video.xx.fbcdn.net:${fp}/fbv/o1/v/t2/f2/m69/AQ" + i + ".mp4?bytestart=" + i * 100 + "&byteend=" + (i * 100 + 99)).then(r => r.blob());</script>`);
    }
    if (host === "x.com") {
      // timeline do X: cada tweet é um <article>, o link da DATA aponta para /usuario/status/ID, o vídeo (blob:) fica fundo
      // dentro do videoPlayer, o vídeo chega em PEDAÇOS de video.twimg.com e há outros links no cartão (/analytics)
      const tweet = (i, user, name, id, txt) => `<article data-testid="tweet" style="width:420px;margin:12px 0;color:#fff">
        <div data-testid="User-Name"><span>${name}</span><span>@${user}</span></div>
        <a href="/${user}/status/${id}"><time>11 de nov</time></a>
        <div data-testid="tweetText">${txt}</div>
        <div data-testid="videoPlayer" style="position:relative;width:360px;height:270px">${"<div>".repeat(10)}<video muted playsinline autoplay loop width=360 height=270 data-i=${i}></video>${"</div>".repeat(10)}
          <div class="cover" style="position:absolute;inset:0"></div></div>
        <a href="/${user}/status/${id}/analytics">61 mil</a></article>`;
      return res.end(`<!doctype html><meta charset=utf-8><title>(1) Página Inicial / X</title><body style="margin:0;background:#000">
        ${tweet(0, "fulano", "Fulano da Silva", "1111111111111111111", "Primeiro tweet com vídeo")}
        ${tweet(1, "beltrano", "Beltrano Souza", "2222222222222222222", "Segundo tweet com vídeo")}
        <script>${blobJs}; document.querySelectorAll("video").forEach((v) => loadBlob(v, v.dataset.i));
          for (let i = 0; i < 6; i++) fetch("https://video.twimg.com:${fp}/ext_tw_video/9/pu/vid/avc1/0/0/720x1280/nF6eT09VWJoRaF" + i + ".mp4?tag=14").then(r => r.blob());
          fetch("https://video.twimg.com:${fp}/ext_tw_video/9/pu/vid/avc1/0/0/128000/WlsQAV9pMRtA4YQt.mp4?tag=14").then(r => r.blob());</script>`);
    }
    if (host === "www.instagram.com") {
      // feed: cada post tem <article>, link do post e uma CAMADA por cima do vídeo (o mouse nunca toca o <video>)
      const post = (i, code, kind) => `<article style="position:relative;margin:10px 0;width:360px;height:300px">
        <header><a href="/user${i}/">user${i}</a> <a href="/${kind}/${code}/">ver</a></header>
        <div style="position:relative;width:360px;height:270px">${"<div>".repeat(i === 0 ? 24 : 0)}<video muted playsinline autoplay loop width=360 height=270 data-i=${i}></video>${"</div>".repeat(i === 0 ? 24 : 0)}
          <div class="cover" style="position:absolute;inset:0"></div></div></article>`;
      return res.end(`<!doctype html><meta charset=utf-8><title>(1) Instagram</title><body style="margin:0;background:#111;color:#fff">
        ${post(0, "AAAAA1", "p")}${post(1, "BBBBB2", "reel")}${post(2, "CCCCC3", "p")}
        <script>${blobJs}; document.querySelectorAll("video").forEach((v) => loadBlob(v, v.dataset.i));</script>`);
    }
    if (host === "www.tiktok.com") {
      return res.end(`<!doctype html><meta charset=utf-8><title>Primeiro video | TikTok</title><body style="margin:0;background:#000;color:#fff">
        <div style="position:relative;width:360px;height:270px"><video muted playsinline autoplay loop width=360 height=270 id=tv></video></div>
        <script>${blobJs}
          loadBlob(document.getElementById("tv"), 0);
          history.replaceState({}, "", "/@fulano/video/1111111111");
          // troca de vídeo SEM recarregar (como o TikTok): nova URL, novo título, novo vídeo
          window.nextVideo = async function () {
            history.pushState({}, "", "/@ciclano/video/2222222222"); document.title = "Segundo video | TikTok";
            await loadBlob(document.getElementById("tv"), 1);
          };
        </script>`);
    }
    if (url === "/g1") {   // matéria: vídeo VERTICAL estreito no meio de uma moldura preta larga + outro player ainda sem <video>
      return res.end(`<!doctype html><meta charset=utf-8><title>Materia - g1</title>
        <meta property="og:image" content="https://example.invalid/capa-da-materia.jpg"><body style="margin:0;background:#fff">
        <div data-video-id="2222222" style="width:648px;height:120px;background:#ddd">outro video (nao carregado)</div>
        <div data-video-id="1111111" style="width:648px;height:365px;background:#000;position:relative;margin-top:20px">
          <video muted playsinline autoplay loop width=206 height=365 style="display:block;margin:0 auto"></video></div>
        <script>${blobJs}; loadBlob(document.querySelector("video"), 1);</script>`);
    }
    if (url.startsWith("/v2/range/prot/")) { res.writeHead(200, { "Content-Type": "video/mp4", "Access-Control-Allow-Origin": "*" }); return res.end(vids[0]); }
    if (url === "/blob") {   // player com blob: num site comum (como o Vimeo): só existe a URL da PÁGINA
      return res.end(`<!doctype html><meta charset=utf-8><title>The Mountain - site comum</title><body style="margin:0;background:#000">
        <video muted playsinline autoplay loop width=640 height=360></video><script>${blobJs}; loadBlob(document.querySelector("video"), 2);
          // como o Vimeo: o vídeo vem em FAIXAS DE BYTES codificadas no caminho (uma URL por faixa, poucos arquivos)
          for (let i = 0; i < 6; i++) fetch("/v2/range/prot/cmFuZ2U9" + (900 + i * 77) + "/avf/ab12cd.mp4?pathsig=x&r=1").then(r => r.blob());</script>`);
    }
    if (url === "/live") {   // transmissão AO VIVO (id de 6 dígitos): o yt-dlp não entende o id; vale o HLS que o player pediu
      return res.end(`<!doctype html><meta charset=utf-8><title>Materia - g1 ao vivo</title><body style="margin:0;background:#fff">
        <div data-video-id="992055" style="width:648px;height:365px;background:#000;position:relative">
          <video muted playsinline autoplay loop width=206 height=365 style="display:block;margin:0 auto"></video></div>
        <script>${blobJs}; loadBlob(document.querySelector("video"), 1);
          fetch("/live/master.m3u8?x=1").then(r=>r.text()); fetch("/live/stream-audio_1=96000-video=1320960.m3u8?x=1").then(r=>r.text());</script>`);
    }
    if (url.startsWith("/live/")) { res.setHeader("Content-Type", "application/vnd.apple.mpegurl"); return res.end("#EXTM3U\n#EXT-X-VERSION:3\n"); }
    // site comum: player dentro de shadow DOM aberto
    return res.end(`<!doctype html><meta charset=utf-8><title>Site comum</title><body style="margin:0;background:#222">
      <x-player></x-player>
      <script>${blobJs}
        customElements.define("x-player", class extends HTMLElement { connectedCallback() {
          const sr = this.attachShadow({ mode: "open" });
          sr.innerHTML = '<video muted autoplay loop width=400 height=250></video>';
          loadBlob(sr.querySelector("video"), 2);
        } });
      </script>`);
  }).listen(fp, "127.0.0.1");

  const adobeTitles = path.join(tmp, "adobe-titulos.json");
  fs.writeFileSync(adobeTitles, "{}");
  const srv = spawn(process.platform === "win32" ? "python" : "python3", [path.join(srvDir, "server.py")], { env: { ...process.env, NOEVFX_PORT: String(sp), NOEVFX_ADOBE_TITLES_FILE: adobeTitles }, stdio: "ignore", cwd: tmp });
  const H = { Origin: "chrome-extension://" + EXT_ID, "X-NoeVFX-Client": "1" };
  for (let i = 0; i < 60; i++) { if ((await rawReq(sp, "GET", "/health", null, H)).status === 200) break; await sleep(250); }
  await rawReq(sp, "POST", "/config", { output_dir: dl, onboarded: true }, H);
  const jobs = async () => (await rawReq(sp, "GET", "/jobs", null, H)).json.jobs || [];

  const br = spawn(BROWSER, ["--headless=new", `--remote-debugging-port=${dbg}`, `--user-data-dir=${path.join(tmp, "prof")}`, `--load-extension=${extDir}`,
    "--host-resolver-rules=MAP www.instagram.com 127.0.0.1, MAP www.tiktok.com 127.0.0.1, MAP x.com 127.0.0.1, MAP www.pinterest.com 127.0.0.1, MAP v1.pinimg.com 127.0.0.1, MAP www.facebook.com 127.0.0.1, MAP video.xx.fbcdn.net 127.0.0.1, MAP video.twimg.com 127.0.0.1, MAP www.exemplo.test 127.0.0.1, MAP scontent.cdninstagram.com 127.0.0.1",
    "--autoplay-policy=no-user-gesture-required", "--ignore-certificate-errors", "--window-size=1100,900",
    "--no-first-run", "--no-default-browser-check", "--disable-features=DisableLoadExtensionCommandLineSwitch",
    ...(process.env.CI ? ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] : []), "about:blank"],
    { stdio: process.env.CI ? "inherit" : "ignore" });
  const targets = async () => (await fetch(`http://127.0.0.1:${dbg}/json`)).json();
  for (let i = 0; i < 80; i++) { try { await targets(); break; } catch (_) { await sleep(250); } }
  await sleep(1500);
  const cleanup = async () => { try { br.kill(); } catch (_) {} try { srv.kill(); } catch (_) {} site.close(); await sleep(400);
    if (!process.env.KEEP) { try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }); } catch (_) {} } };

  try {
    let swT = null;
    for (let i = 0; i < 20 && !swT; i++) { swT = (await targets()).find((x) => x.type === "service_worker" && x.url.startsWith(`chrome-extension://${EXT_ID}/`)); if (!swT) await sleep(300); }
    check("extensão carregou", !!swT);
    if (!swT) throw new Error("sem service worker");

    // grava, dentro do service worker, tudo o que o content script ENVIA (URL, miniatura, prioridade, título)
    const sw = new Cdp(swT.webSocketDebuggerUrl); await sw.ready;
    await sw.eval(`self.__m = [];
      const h = (x) => { let a = 0; for (let i = 0; i < x.length; i += 7) a = (a * 31 + x.charCodeAt(i)) | 0; return a; };
      chrome.runtime.onMessage.addListener((m) => { if (!m || m.type === "RESCAN_TAB") return;
        self.__m.push({ type: m.type, url: m.url || "", quality: m.quality || "", title: m.title || "",
          items: (m.items || []).map((i) => ({ url: i.url, kind: i.kind, title: i.title || "", pri: i.pri || 0, th: i.thumb ? h(i.thumb) : 0 })) }); });0`);
    const rec = async () => JSON.parse(await sw.eval("JSON.stringify(self.__m)"));
    const clearRec = () => sw.eval("self.__m = [];0");
    // últimos dados de cada URL (o que a lista da extensão acabaria mostrando)
    const itemsOf = async () => { const out = new Map(); for (const m of await rec()) for (const it of m.items) out.set(it.url, it); return out; };
    const waitItems = async (pred, ms = 9000) => { const t0 = Date.now(); let it = new Map(); while (Date.now() - t0 < ms) { it = await itemsOf(); if (pred(it)) return it; await sleep(400); } return it; };

    const page = new Cdp((await targets()).find((x) => x.type === "page" && !x.url.startsWith("chrome-extension://") && !x.url.startsWith("edge://")).webSocketDebuggerUrl); await page.ready;
    for (const m of ["Page.enable", "Runtime.enable", "DOM.enable"]) await page.send(m);
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });

    const mouse = (type, x, y) => page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: type === "mousePressed" ? 1 : 0 });
    const click = async (x, y) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); };
    const findNode = async (sel) => {
      const doc = await page.send("DOM.getDocument", { depth: -1, pierce: true });
      const walk = (n) => { if ((n.attributes || []).includes("noevfx-hover-host")) return n; for (const c of n.children || []) { const r = walk(c); if (r) return r; } return null; };
      const host = walk(doc.result.root);
      if (!host || !host.shadowRoots || !host.shadowRoots.length) return null;
      const q = await page.send("DOM.querySelector", { nodeId: host.shadowRoots[0].nodeId, selector: sel });
      return q.result && q.result.nodeId ? q.result.nodeId : null;
    };
    const center = async (nodeId) => { const r = await page.send("DOM.getBoxModel", { nodeId }); if (!r.result) return null; const q = r.result.model.content; return [(q[0] + q[4]) / 2, (q[1] + q[5]) / 2]; };
    const fabVisible = async () => {
      const n = await findNode(".fab"); if (!n) return false;
      const o = await page.send("DOM.resolveNode", { nodeId: n });
      const r = await page.send("Runtime.callFunctionOn", { objectId: o.result.object.objectId, functionDeclaration: "function(){return this.style.display}", returnByValue: true });
      return r.result.result.value === "inline-flex";
    };
    // mouse "de verdade": chega de fora e para sobre o ponto
    const hover = async (x, y) => { await mouse("mouseMoved", 3, 3); await sleep(250); await mouse("mouseMoved", x - 12, y - 12); await sleep(250); await mouse("mouseMoved", x, y); await sleep(700); };
    const clickFabMain = async () => {
      const f = await findNode(".fab"); const fc = await center(f);
      await click(fc[0], fc[1]); await sleep(600);
      const main = await findNode("button.opt.main"); const mc = await center(main);
      const before = (await jobs()).length;
      await click(mc[0], mc[1]);
      let j = null;
      for (let i = 0; i < 25 && !j; i++) { await sleep(300); const js = await jobs(); if (js.length > before) j = js[0]; }
      return j;
    };
    const goto = async (url, wait = 3500) => {
      await clearRec(); await page.send("Page.navigate", { url }); await sleep(wait);
      await page.send("Page.bringToFront");            // aba em segundo plano não carrega mídia
      await page.eval(`(()=>{const all=[...document.querySelectorAll("video")];document.querySelectorAll("*").forEach(e=>e.shadowRoot&&e.shadowRoot.querySelectorAll("video").forEach(v=>all.push(v)));all.forEach(v=>v.play().catch(()=>{}))})()`);
      await sleep(1200);
    };

    /* ============================ Instagram (feed) ============================ */
    console.log("\n== Feed estilo Instagram (vídeo coberto por camadas, blob:, pedaços no CDN)");
    await goto(`https://www.instagram.com:${fp}/`, 2000);      // aquecimento: a 1ª página depois de abrir o navegador às vezes perde o content script
    await goto(`https://www.instagram.com:${fp}/`);
    info("readyState dos vídeos", await page.eval(`[...document.querySelectorAll("video")].map(v=>v.readyState)`));
    info("diag", await page.eval(`(async()=>{try{const r=await fetch(${JSON.stringify(CDN)}+"/v/t16/f2/m86/AQ0x.mp4?bytestart=0");return r.status+" "+(await r.blob()).size+" "+[...document.querySelectorAll("video")].map(v=>v.src.slice(0,12)+":"+(v.error?v.error.message:"-"))}catch(e){return "ERR "+e}})()`));
    const c1 = await page.eval(`(()=>{const r=document.querySelectorAll("video")[1].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    check("o <video> está mesmo coberto por outra camada (cenário do Instagram)", (await page.eval(`document.elementFromPoint(${c1[0]},${c1[1]}).className`)) === "cover");
    await hover(c1[0], c1[1]);
    check("ícone aparece com o mouse sobre um vídeo coberto por camadas", await fabVisible());

    const posts = "https://www.instagram.com/p/AAAAA1/,https://www.instagram.com/p/CCCCC3/,https://www.instagram.com/reel/BBBBB2/";
    const igPred = (m) => [...m.keys()].filter((u) => /www\.instagram\.com\/(p|reel)\//.test(u)).length >= 3;
    let it = await waitItems(igPred, 6000);
    for (let a = 1; a <= 2 && it.size === 0; a++) {          // 1º carregamento depois de abrir o navegador: às vezes não registra; recarrega
      info("recarregando o cenário (nada registrado)", a);
      await goto(`https://www.instagram.com:${fp}/`);
      const cr = await page.eval(`(()=>{const r=document.querySelectorAll("video")[1].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
      await hover(cr[0], cr[1]);
      it = await waitItems(igPred, 6000);
    }
    const ig = [...it.values()].filter((x) => /www\.instagram\.com\/(p|reel)\//.test(x.url));
    info("itens enviados", ig.map((x) => x.kind + " " + x.url.replace("https://", "") + " th=" + x.th + " pri=" + x.pri + " | " + x.title));
    check("a extensão publica UM item por vídeo, com a URL do POST", ig.map((x) => x.url).sort().join(",") === posts);
    check("nenhum pedaço do CDN (bytestart/byteend) é publicado", ![...it.keys()].some((u) => /cdninstagram|bytestart/.test(u)));
    check("cada vídeo tem miniatura PRÓPRIA (3 diferentes)", ig.length === 3 && ig.every((x) => x.th) && new Set(ig.map((x) => x.th)).size === 3, ig.map((x) => x.th).join("/"));
    check("o título é do post (usuário), não o título genérico da aba", ig.length === 3 && ig.every((x) => /user\d - Instagram/.test(x.title)), ig.map((x) => x.title).join(" | "));

    const j1 = await clickFabMain();
    const dl1 = (await rec()).filter((m) => m.type === "DOWNLOAD").pop();
    check("clicar no ícone do 2º vídeo pede a URL do POST dele", !!dl1 && dl1.url === "https://www.instagram.com/reel/BBBBB2/", dl1 ? dl1.url : "sem DOWNLOAD");
    check("o servidor recebeu o mesmo pedido", !!j1 && j1.url === "https://www.instagram.com/reel/BBBBB2/", j1 ? j1.url : "sem job");

    /* ============================ X (Twitter) ============================ */
    console.log("\n== Timeline do X (vídeo em pedaços de video.twimg.com, blob:, vários tweets)");
    await goto(`https://x.com:${fp}/`);
    const cx = await page.eval(`(()=>{const r=document.querySelectorAll("video")[1].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    await hover(cx[0], cx[1]);
    check("ícone aparece sobre o vídeo do tweet", await fabVisible());
    const xs = await waitItems((m) => [...m.keys()].filter((u) => /x\.com\/\w+\/status\//.test(u)).length >= 2);
    const xi = [...xs.values()].filter((x) => /x\.com\/\w+\/status\//.test(x.url));
    info("itens enviados", xi.map((x) => x.kind + " " + x.url.replace("https://", "") + " th=" + x.th + " | " + x.title));
    check("um item por vídeo, com o link do TWEET (não o da timeline)", xi.map((x) => x.url).sort().join(",") === "https://x.com/beltrano/status/2222222222222222222,https://x.com/fulano/status/1111111111111111111");
    check("nenhum pedaço de video.twimg.com é listado", ![...xs.keys()].some((u) => /twimg/.test(u)), [...xs.keys()].filter((u) => /twimg/.test(u)).length + " vazaram");
    check("cada tweet tem miniatura PRÓPRIA", xi.length === 2 && xi.every((x) => x.th) && xi[0].th !== xi[1].th);
    check("o item tem nome (usuário + texto), não '(1) Página Inicial / X'", xi.length === 2 && xi.every((x) => /(Fulano|Beltrano)/.test(x.title) && /tweet com v/.test(x.title)), xi.map((x) => x.title).join(" | "));
    await clickFabMain();
    const dlx = (await rec()).filter((m) => m.type === "DOWNLOAD").pop();
    check("clicar no ícone do 2º vídeo pede o link do TWEET dele", !!dlx && dlx.url === "https://x.com/beltrano/status/2222222222222222222", dlx ? dlx.url : "sem DOWNLOAD");

    /* ============================ Facebook ============================ */
    console.log("\n== Feed do Facebook (vídeo em pedaços de fbcdn.net, blob:, link do vídeo/reel no cabeçalho)");
    await goto(`https://www.facebook.com:${fp}/`);
    const cf = await page.eval(`(()=>{const r=document.querySelectorAll("video")[1].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    await hover(cf[0], cf[1]);
    check("ícone aparece sobre o vídeo do post", await fabVisible());
    const fbs = await waitItems((m) => [...m.keys()].filter((u) => /facebook\.com\/(reel|[^/]+\/videos)\//.test(u)).length >= 2);
    const fbi = [...fbs.values()].filter((x) => /facebook\.com\/(reel|[^/]+\/videos)\//.test(x.url));
    info("itens enviados", fbi.map((x) => x.kind + " " + x.url.replace("https://", "") + " th=" + x.th + " | " + x.title));
    check("um item por vídeo, com o link do VÍDEO/REEL (não o do grupo/perfil)", fbi.map((x) => x.url).sort().join(",") === "https://www.facebook.com/paginaum/videos/1234567890123456,https://www.facebook.com/reel/9876543210987654");
    check("nenhum pedaço de fbcdn.net é listado", ![...fbs.keys()].some((u) => /fbcdn/.test(u)), [...fbs.keys()].filter((u) => /fbcdn/.test(u)).length + " vazaram");
    check("cada vídeo tem miniatura PRÓPRIA e nome do post", fbi.length === 2 && fbi.every((x) => x.th && /Página (Um|Dois) - Facebook/.test(x.title)) && fbi[0].th !== fbi[1].th, fbi.map((x) => x.title).join(" | "));
    await clickFabMain();
    const dlf = (await rec()).filter((m) => m.type === "DOWNLOAD").pop();
    check("clicar no ícone do 2º vídeo pede o REEL dele", !!dlf && dlf.url === "https://www.facebook.com/reel/9876543210987654", dlf ? dlf.url : "sem DOWNLOAD");

    /* ============================ Pinterest ============================ */
    console.log("\n== Pin aberto (carrossel só com imagens no DOM + vídeos relacionados; HLS/MP4 de v1.pinimg.com na rede)");
    await goto(`https://www.pinterest.com:${fp}/pin/1111111111111111111/`);
    const cpn = await page.eval(`(()=>{const r=document.querySelectorAll("video")[0].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    await hover(cpn[0], cpn[1]);
    check("ícone aparece sobre o vídeo do cartão", await fabVisible());
    const pns = await waitItems((m) => [...m.keys()].filter((u) => /pinterest\.com\/pin\//.test(u)).length >= 2);
    const pni = [...pns.values()].filter((x) => /pinterest\.com\/pin\//.test(x.url));
    info("itens enviados", pni.map((x) => x.kind + " " + x.url.replace("https://", "") + " th=" + (x.th ? "sim" : "não") + " | " + x.title));
    check("um item por PIN, com o link do pin (o aberto + o do cartão com link)", pni.map((x) => x.url.replace(/:\d+/, "")).sort().join(",") === "https://www.pinterest.com/pin/1111111111111111111/,https://www.pinterest.com/pin/2222222222222222222/", pni.map((x) => x.url).join(","));
    check("o link /repin do pin principal NÃO vaza para o cartão sem link (só 2 itens)", pni.length === 2, pni.length + " itens");
    const pinKeys = [...pns.keys()].filter((u) => /pinimg\.com/.test(u));
    check("nenhum HLS/MP4 solto de pinimg.com na lista, a não ser a playlist PRINCIPAL do vídeo sem link de pin", pinKeys.length === 1 && /\/hls\/aa\/bb\/cc\/1{32}\.m3u8$/.test(pinKeys[0]), pinKeys.join(" | "));
    const pmain = pni.find((x) => /1111111111111111111/.test(x.url));
    const psec = pni.find((x) => /2222222222222222222/.test(x.url));
    check("pin principal: nome da API (sem o resto depois do \"|\") e aviso de 2 vídeos", !!pmain && pmain.title === "Motion poster com texto 3d (2 vídeos)", pmain ? pmain.title : "sem item");
    check("pin do cartão: nome da API", !!psec && psec.title === "Segundo pin", psec ? psec.title : "sem item");
    check("cada pin tem miniatura PRÓPRIA", !!pmain && !!psec && !!pmain.th && !!psec.th && pmain.th !== psec.th);
    await clickFabMain();
    const dlp = (await rec()).filter((m) => m.type === "DOWNLOAD").pop();
    check("clicar no ícone do cartão com link pede o pin DELE", !!dlp && dlp.url.replace(/:\d+/, "") === "https://www.pinterest.com/pin/2222222222222222222/", dlp ? dlp.url : "sem DOWNLOAD");
    // cartão SEM link (Pinterest sem login): o ícone baixa o stream desse vídeo (pelo hash do pôster), não avisa "não achei o link"
    await goto(`https://www.pinterest.com:${fp}/pin/1111111111111111111/`);      // página nova: o ícone ainda estaria "ocupado" com o 1º download
    const cpn2 = await page.eval(`(()=>{document.querySelectorAll("video")[1].scrollIntoView({block:"center"});const r=document.querySelectorAll("video")[1].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    await hover(cpn2[0], cpn2[1]);
    await clickFabMain();
    await sleep(3500);
    const allr = await rec(); info("últimas mensagens", allr.slice(-6).map((m) => m.type + ":" + String(m.url || m.hash || "").slice(-40)));
    const dlp2 = allr.filter((m) => m.type === "DOWNLOAD").pop();
    check("cartão sem link: o ícone pede a playlist principal do vídeo (não o pin errado, nem aviso)", !!dlp2 && /\/hls\/aa\/bb\/cc\/1{32}\.m3u8$/.test(dlp2.url), dlp2 ? dlp2.url : "sem DOWNLOAD");
    check("o pedido leva o nome do Pinterest, não o título da aba", !!dlp2 && /Pinterest/.test(dlp2.title || ""), dlp2 ? dlp2.title : "");

    /* ============================ Popup: verificar atualizações ============================ */
    console.log("\n== Popup: clicar na versão verifica a última release no GitHub (pelo servidor local)");
    await goto(`chrome-extension://${EXT_ID}/popup.html`, 3000);
    // ao abrir, sem clicar em nada: o app (do teste) está 1 versão à frente da extensão -> a faixa pede para RECARREGAR a extensão
    const bootMsg = await page.eval(`document.getElementById("updMsg").textContent`);
    const bootMode = await page.eval(`document.getElementById("updBtn").hidden ? "oculto" : document.getElementById("updBtn").dataset.mode`);
    check("app mais novo que a extensão: a faixa aparece sozinha pedindo para recarregar (outro perfil já atualizou)", /ainda é a|still/.test(bootMsg) && bootMode === "reload", bootMsg + " | botão: " + bootMode);
    await page.eval(`document.getElementById("ver").click()`);
    await sleep(3500);
    const updTxt = await page.eval(`document.getElementById("updMsg").textContent`);
    const updVis = await page.eval(`!document.getElementById("updRow").hidden`);
    info("mensagem", updTxt);
    check("a faixa de atualização aparece com o resultado (versão mais recente / nova versão / erro claro)", updVis && /mais recente|latest|Nova versão|New version|Não consegui|Could not|ainda é a|still/.test(updTxt), updTxt);
    const cfgNow = async () => (await (await fetch(`http://127.0.0.1:${sp}/config`, { headers: H })).json());
    check("popup: o checkbox H.264 (Premiere) existe e vem DESLIGADO por padrão, com texto de ajuda visível", (await page.eval(`document.getElementById("compatBox").checked`)) === false && (await cfgNow()).compat_h264 === false && (await page.eval(`document.querySelector("#compatRow small").offsetParent !== null && /padrão|default/i.test(document.querySelector("#compatRow small").textContent)`)));
    await page.eval(`document.getElementById("compatBox").click()`);
    await sleep(900);
    check("popup: marcar grava compat_h264=true no servidor", (await cfgNow()).compat_h264 === true, JSON.stringify((await cfgNow()).compat_h264));
    // Enviar para o Premiere: sem o programa aberto, avisa e NÃO baixa; com projeto organizado, salva na pasta do trabalho em H.264
    check("popup: nenhum botão com texto vazando (todos cabem na largura)", await page.eval(`[...document.querySelectorAll("button")].filter(b=>b.offsetParent).every(b=>b.scrollWidth<=b.clientWidth+1)`), await page.eval(`[...document.querySelectorAll("button")].filter(b=>b.offsetParent&&b.scrollWidth>b.clientWidth+1).map(b=>b.textContent.trim()).join(" | ")`));
    check("popup: botões 'Enviar p/ Premiere' e 'Enviar p/ After Effects' aparecem (Windows)", await page.eval(`!document.getElementById("sendRow").hidden && document.querySelectorAll("#sendRow button[data-target]").length === 2`));
    const jobsAntes = (await jobs()).length;
    await page.eval(`document.getElementById("urlInput").value = "https://www.exemplo.test:${fp}/video.mp4"`);
    await page.eval(`document.querySelector('#sendRow button[data-target="premiere"]').click()`);
    await sleep(1500);
    const stNo = await page.eval(`document.getElementById("status").textContent`);
    check("Premiere fechado: o popup avisa para abrir e nenhum download começa", /Abra o Premiere/.test(stNo) && (await jobs()).length === jobsAntes, stNo);
    const projDir = path.join(tmp, "Comercial Teste", "Premiere");
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, "corte final.prproj"), "x");
    fs.writeFileSync(adobeTitles, JSON.stringify({ "adobe premiere pro.exe": ["Adobe Premiere - " + path.join(projDir, "corte final.prproj") + " *"] }));
    await page.eval(`document.getElementById("urlInput").value = "https://www.exemplo.test:${fp}/video.mp4"`);
    await page.eval(`document.querySelector('#sendRow button[data-target="premiere"]').click()`);
    let jp = null;
    for (let i = 0; i < 20 && !jp; i++) { await sleep(300); const js = await jobs(); if (js.length > jobsAntes) jp = js[0]; }
    const stOk = await page.eval(`document.getElementById("status").textContent`);
    info("pasta do envio", jp ? jp.output_dir : "sem job");
    check("Premiere com projeto em Comercial Teste\\Premiere: salva em Comercial Teste\\_Noe VFX Downloader", !!jp && jp.output_dir === path.join(tmp, "Comercial Teste", "_Noe VFX Downloader"), jp ? jp.output_dir : "sem job");
    check("o popup diz que está enviando para a pasta do projeto", /pasta do projeto/.test(stOk), stOk);
    fs.writeFileSync(adobeTitles, "{}");
    check("nunca oferece 'Atualizar agora' quando o app já está na frente: só 'Recarregar extensão'", await page.eval(`(()=>{const b=document.getElementById("updBtn"); return !b.hidden && b.dataset.mode==="reload" && /Recarregar|Reload/.test(b.textContent)})()`));

    console.log("\n== Pin aberto no Pinterest LOGADO (vídeo grande dentro de relatedPins, sem CloseupMainPin, pôster sem código)");
    await goto(`https://www.pinterest.com:${fp}/pin/3333333333333333333/`);
    const cpl = await page.eval(`(()=>{const r=document.querySelectorAll("video")[0].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    await hover(cpl[0], cpl[1]);
    check("ícone aparece sobre o vídeo do pin aberto", await fabVisible());
    await clickFabMain();
    await sleep(2800);
    const dll = (await rec()).filter((m) => m.type === "DOWNLOAD").pop();
    check("o ícone pede o PIN da página (não avisa 'não achei o link')", !!dll && dll.url.replace(/:\d+/, "") === "https://www.pinterest.com/pin/3333333333333333333/", dll ? dll.url : "sem DOWNLOAD");
    // painel do ícone dentro do vídeo: checkbox H.264 (a mesma opção do popup e das Configurações)
    await goto(`https://www.pinterest.com:${fp}/pin/3333333333333333333/`);
    const cpl2 = await page.eval(`(()=>{const r=document.querySelectorAll("video")[0].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    await hover(cpl2[0], cpl2[1]);
    const fab2 = await findNode(".fab"); const fc2 = await center(fab2);
    await click(fc2[0], fc2[1]); await sleep(700);
    const pnlNode = await findNode(".panel");
    const pnlBtns = pnlNode ? (await page.send("DOM.querySelectorAll", { nodeId: pnlNode, selector: "button" })).result.nodeIds : [];
    const pnlOver = [];
    for (const id of pnlBtns) { const o = await page.send("DOM.resolveNode", { nodeId: id }); const r = await page.send("Runtime.callFunctionOn", { objectId: o.result.object.objectId, functionDeclaration: "function(){return this.offsetParent && this.scrollWidth > this.clientWidth + 1 ? this.textContent.trim() : ''}", returnByValue: true }); if (r.result.result.value) pnlOver.push(r.result.result.value); }
    check("painel do vídeo: nenhum botão com texto vazando (" + pnlBtns.length + " botões)", pnlBtns.length >= 8 && pnlOver.length === 0, pnlOver.join(" | "));
    check("painel do vídeo: botões 'Enviar p/ Premiere' e 'Enviar p/ After Effects' no painel", !!(await findNode('.send button[data-target="premiere"]')) && !!(await findNode('.send button[data-target="aftereffects"]')));
    const cmp = await findNode("input[data-compat]");
    const cmpChecked = async () => { const o = await page.send("DOM.resolveNode", { nodeId: cmp }); const r = await page.send("Runtime.callFunctionOn", { objectId: o.result.object.objectId, functionDeclaration: "function(){return this.checked}", returnByValue: true }); return r.result.result.value; };
    check("painel do vídeo: o checkbox H.264 existe e reflete o que o popup marcou", !!cmp && (await cmpChecked()) === true);
    const cc = await center(cmp);
    await click(cc[0], cc[1]); await sleep(900);
    check("painel do vídeo: desmarcar grava compat_h264=false no servidor (mesma opção do popup)", (await cfgNow()).compat_h264 === false && (await cmpChecked()) === false, JSON.stringify((await cfgNow()).compat_h264));

    /* ============================ Vários links (página da extensão) ============================ */
    console.log("\n== Vários links: pasta padrão, outra pasta e projeto do Premiere/AE");
    await goto(`chrome-extension://${EXT_ID}/batch.html`, 2500);
    check("vários links: a página abre com os destinos Premiere/AE (edição for Editors)", await page.eval(`document.querySelectorAll("#dest option").length === 4 && !document.getElementById("edPill").hidden`));
    check("vários links: nenhum botão com texto vazando", await page.eval(`[...document.querySelectorAll("button")].filter(b=>b.offsetParent).every(b=>b.scrollWidth<=b.clientWidth+1)`));
    const jb0 = (await jobs()).length;
    await page.eval(`document.getElementById("links").value = "https://www.exemplo.test:${fp}/a.mp4\\nhttps://www.exemplo.test:${fp}/b.mp4\\nlixo\\nhttps://www.exemplo.test:${fp}/a.mp4"; document.getElementById("go").click()`);
    let jbs = [];
    for (let i = 0; i < 20 && jbs.length < 2; i++) { await sleep(300); jbs = (await jobs()).slice(0, (await jobs()).length - jb0); }
    check("vários links: 2 downloads (link repetido e texto que não é link ficam de fora)", jbs.length === 2, jbs.length + " jobs");
    const outro = path.join(tmp, "Outra Pasta");
    const jc = await page.eval(`new Promise(r=>chrome.runtime.sendMessage({type:"DOWNLOAD",url:"https://www.exemplo.test:${fp}/c.mp4",pageUrl:"https://www.exemplo.test:${fp}/c.mp4",quality:"best",outDir:${JSON.stringify(outro)},compat:true},r))`);
    let jcj = null;
    for (let i = 0; i < 20 && !jcj; i++) { await sleep(300); jcj = (await jobs()).find((j) => /\/c\.mp4$/.test(j.url || "")); }
    check("vários links: 'Outra pasta' salva na pasta escolhida (o app confirma a pasta)", !!jc && jc.output_dir === outro && !!jcj, JSON.stringify(jc));
    await page.eval(`document.getElementById("dest").value = "premiere"; document.getElementById("dest").dispatchEvent(new Event("change"))`);
    check("vários links: destino Premiere liga o H.264 e trava a caixa", await page.eval(`document.getElementById("compat").checked && document.getElementById("compat").disabled`));
    await page.eval(`document.getElementById("links").value = "https://www.exemplo.test:${fp}/d.mp4"; document.getElementById("go").click()`);
    await sleep(1500);
    const bm = await page.eval(`document.getElementById("msg").textContent`);
    check("vários links: Premiere fechado avisa e não baixa", /Abra o Premiere/.test(bm), bm);

    /* ============================ TikTok (SPA) ============================ */
    console.log("\n== Site de página única estilo TikTok (troca de vídeo sem recarregar)");
    await goto(`https://www.tiktok.com:${fp}/`);
    const t1 = await waitItems((m) => [...m.keys()].some((u) => /1111111111/.test(u)));
    const a = t1.get("https://www.tiktok.com/@fulano/video/1111111111");
    info("1º vídeo", a || "não publicado");
    check("1º vídeo publicado pela URL da página do vídeo, com miniatura própria", !!a && a.kind === "TikTok" && !!a.th);
    const hashA = a && a.th;

    await clearRec();
    await page.eval("window.nextVideo()"); await sleep(3500);
    const t2 = await waitItems((m) => [...m.keys()].some((u) => /2222222222/.test(u)));
    const b = t2.get("https://www.tiktok.com/@ciclano/video/2222222222");
    info("2º vídeo", b || "não publicado");
    const rec2 = await rec();
    check("a extensão ZEROU a lista da aba ao trocar de vídeo (RESET_TAB)", rec2.some((m) => m.type === "RESET_TAB"));
    check("2º vídeo publicado com a URL nova", !!b && b.kind === "TikTok");
    check("miniatura do 2º vídeo é DIFERENTE da do 1º (não ficou presa na 1ª página)", !!b && !!b.th && b.th !== hashA);
    check("título acompanha a página", !!b && /Segundo/.test(b.title || ""), b && b.title);
    check("depois da troca o vídeo antigo NÃO é mais publicado", !rec2.filter((m) => m.type === "DOM_MEDIA_FOUND").some((m) => m.items.some((i) => /1111111111/.test(i.url))));

    /* ============================ G1 (vários players) ============================ */
    console.log("\n== Matéria com vários players (G1): vídeo vertical estreito dentro de moldura larga");
    await goto(`https://www.exemplo.test:${fp}/g1`);
    const box = await page.eval(`(()=>{const d=document.querySelector('[data-video-id="1111111"]').getBoundingClientRect();const v=document.querySelector("video").getBoundingClientRect();return {bx:d.left+20,by:d.top+d.height/2,vl:v.left}})()`);
    check("o ponto de teste está FORA do <video> (nas barras pretas)", box.bx < box.vl, `x=${Math.round(box.bx)} video começa em ${Math.round(box.vl)}`);
    await hover(box.bx, box.by);
    check("ícone aparece com o mouse nas barras pretas / moldura do player vertical", await fabVisible());
    const g = await waitItems((m) => [...m.keys()].some((u) => /1111111/.test(u)));
    const g111 = g.get("https://globoplay.globo.com/v/1111111/"), g222 = g.get("https://globoplay.globo.com/v/2222222/");
    info("itens", { g111, g222 });
    check("o player de verdade (com <video>) é publicado", !!g111);
    check("o cartão 'veja também' (data-video-id SEM <video>) NÃO é listado: baixaria um vídeo sem relação", !g222);
    check("o player que está tocando tem miniatura própria (frame do vídeo)", !!g111 && !!g111.th);
    check("o que está tocando vem com prioridade máxima (aparece primeiro na lista)", !!g111 && g111.pri === 2, String(g111 && g111.pri));
    const j2 = await clickFabMain();
    const dl2 = (await rec()).filter((m) => m.type === "DOWNLOAD").pop();
    check("clicar no ícone pede o vídeo ESPECÍFICO do player (1111111), não o 1º da página (2222222)", !!dl2 && /globoplay\.globo\.com\/v\/1111111\//.test(dl2.url), dl2 ? dl2.url : "sem DOWNLOAD");
    check("o servidor recebeu o mesmo pedido", !!j2 && /globoplay\.globo\.com\/v\/1111111\//.test(j2.url), j2 ? j2.url : "sem job");

    console.log("\n== Player blob: num site comum (Vimeo e parecidos): lista pela URL da página");
    await goto(`https://www.exemplo.test:${fp}/blob`);
    const bl = await waitItems((m) => [...m.keys()].some((u) => /\/blob$/.test(u)));
    const bi = [...bl.values()].find((x) => /\/blob$/.test(x.url));
    info("item", bi || "não publicado");
    check("vídeo blob: entra na lista pela URL da PÁGINA, com miniatura própria", !!bi && bi.kind === "Página" && !!bi.th);
    const cb = await page.eval(`(()=>{const r=document.querySelector("video").getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    await hover(cb[0], cb[1]);
    await clickFabMain();
    const dl4 = (await rec()).filter((m) => m.type === "DOWNLOAD").pop();
    check("as 6 faixas de bytes do Vimeo (/range/prot/) NÃO viram 6 itens na lista", ![...bl.keys()].some((u) => /\/range\/prot\//.test(u)), [...bl.keys()].filter((u) => /range/.test(u)).length + " vazaram");
    check("clicar no ícone pede a URL da página", !!dl4 && /\/blob$/.test(dl4.url), dl4 ? dl4.url : "sem DOWNLOAD");

    console.log("\n== G1 ao vivo (id de 6 dígitos): baixa pelo HLS que o player pediu");
    await goto(`https://www.exemplo.test:${fp}/live`);
    const gl = await waitItems((m) => false, 1500);
    check("o id de 6 dígitos (ao vivo) NÃO vira item globoplay (o yt-dlp não entende)", ![...gl.keys()].some((u) => /globoplay/.test(u)));
    const cl = await page.eval(`(()=>{const d=document.querySelector('[data-video-id="992055"]').getBoundingClientRect();return [d.left+20,d.top+d.height/2]})()`);
    await hover(cl[0], cl[1]);
    await clickFabMain();
    const dl3 = (await rec()).filter((m) => m.type === "DOWNLOAD").pop();
    check("o download pede a playlist PRINCIPAL do HLS (não a de uma qualidade só)", !!dl3 && /\/live\/master\.m3u8/.test(dl3.url), dl3 ? dl3.url : "sem DOWNLOAD");

    /* ============================ shadow DOM ============================ */
    console.log("\n== Player dentro de shadow DOM (site comum)");
    await goto(`https://www.exemplo.test:${fp}/`);
    const c2 = await page.eval(`(()=>{const v=document.querySelector("x-player").shadowRoot.querySelector("video");const r=v.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    await hover(c2[0], c2[1]);
    check("ícone aparece sobre um vídeo dentro de shadow DOM", await fabVisible());

    // por último: recarrega a extensão com a aba aberta (como no botão "Atualizar agora"): a cópia antiga fica órfã e a aba tem de avisar
    console.log("\n== Extensão recarregada com a aba aberta (cópia antiga órfã): a aba avisa para atualizar a página");
    try { await Promise.race([sw.eval("chrome.runtime.reload()"), sleep(2500)]); } catch (_) {}
    await sleep(7000);
    const tn = await findNode(".toast");
    const toastInfo = tn ? await (async () => { const o = await page.send("DOM.resolveNode", { nodeId: tn }); const r = await page.send("Runtime.callFunctionOn", { objectId: o.result.object.objectId, functionDeclaration: "function(){return this.style.display + '|' + this.textContent}", returnByValue: true }); return r.result.result.value; })() : "";
    info("aviso", toastInfo);
    check("a aba antiga mostra 'atualize esta página (F5)' depois de a extensão ser recarregada", /^block\|/.test(toastInfo) && /F5/.test(toastInfo), toastInfo);
    check("o ícone some na aba antiga (não clica em algo que já não funciona)", !(await fabVisible()));
  } catch (e) {
    console.log("  ERRO  " + (e && e.stack || e)); results.push(false);
  } finally { await cleanup(); }
  const bad = results.filter((x) => !x).length;
  console.log(`\n${results.length - bad}/${results.length} ok` + (bad ? `, ${bad} FALHA(S)` : ""));
  process.exit(bad ? 1 : 0);
})();
