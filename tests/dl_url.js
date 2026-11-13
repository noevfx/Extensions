// Baixa UMA url pelo servidor (como a extensão faria) e confere o arquivo com ffprobe.
//   node tests/dl_url.js <url> [segundos-max=90] [referer]
"use strict";
const { spawn, spawnSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http"), net = require("net");
const ROOT = path.resolve(__dirname, "..");
const EXT_ID = "hdmfifeopbmjcfjbjpkfjinejneohlji";
const URL_ALVO = process.argv[2], SECS = +process.argv[3] || 90, REF = process.argv[4] || "";
if (!URL_ALVO) { console.error("uso: node tests/dl_url.js <url> [segundos] [referer]"); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
function rawReq(port, method, p, body, headers = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: "127.0.0.1", port, method, path: p, headers: { ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { let j = {}; try { j = JSON.parse(b); } catch (_) {} resolve({ status: res.statusCode, json: j }); });
    });
    req.on("error", () => resolve({ status: 0, json: {} })); if (data) req.write(data); req.end();
  });
}
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nvf_dl_"));
  const sp = await freePort(), srvDir = path.join(tmp, "srv"), dl = path.join(tmp, "dl");
  fs.mkdirSync(srvDir); fs.copyFileSync(path.join(ROOT, "server", "server.py"), path.join(srvDir, "server.py"));
  const instBin = path.join(process.env.LOCALAPPDATA || "", "NoeVFXDownloader", "server", "bin");
  if (fs.existsSync(instBin)) fs.cpSync(instBin, path.join(srvDir, "bin"), { recursive: true });
  const srv = spawn(process.platform === "win32" ? "python" : "python3", [path.join(srvDir, "server.py")], { env: { ...process.env, NOEVFX_PORT: String(sp) }, stdio: "ignore", cwd: tmp });
  const H = { Origin: "chrome-extension://" + EXT_ID, "X-NoeVFX-Client": "1" };
  for (let i = 0; i < 60; i++) { if ((await rawReq(sp, "GET", "/health", null, H)).status === 200) break; await sleep(250); }
  await rawReq(sp, "POST", "/config", { output_dir: dl, onboarded: true }, H);
  const r = await rawReq(sp, "POST", "/download", { url: URL_ALVO, referer: REF || URL_ALVO, pageUrl: REF || URL_ALVO, quality: "best", title: "teste" }, H);
  const id = r.json.job_id; console.log("job:", id || JSON.stringify(r.json));
  const t0 = Date.now(); let j = null, last = "";
  while (id && Date.now() - t0 < SECS * 1000) {
    await sleep(1500); j = ((await rawReq(sp, "GET", "/jobs", null, H)).json.jobs || [])[0];
    const st = j.status + " " + (j.progress || ""); if (st !== last) { last = st; console.log("  ", st.slice(0, 110)); }
    if (["done", "error", "canceled"].includes(j.status)) break;
  }
  if (j && !["done", "error", "canceled"].includes(j.status)) { await rawReq(sp, "POST", "/cancel", { job_id: j.id }, H); console.log("  (cancelado por tempo)"); await sleep(3000); j = ((await rawReq(sp, "GET", "/jobs", null, H)).json.jobs || [])[0]; }
  console.log("resultado:", j && j.status, j && (j.error || ""));
  for (const f of (fs.existsSync(dl) ? fs.readdirSync(dl) : [])) {
    const p = path.join(dl, f);
    const o = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration,size", "-of", "default=nw=1", p], { encoding: "utf8" });
    console.log("  arquivo:", f.slice(0, 50), "->", (o.stdout || o.stderr || "").replace(/\n/g, " ").slice(0, 220));
  }
  try { srv.kill(); } catch (_) {} await sleep(500); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
})();
