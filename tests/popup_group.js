// Teste rápido da lista do popup (sem navegador): o mesmo vídeo vindo por 2 caminhos vira UM item.
//   node tests/popup_group.js
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "browser", "popup.js"), "utf8").replace(/\r\n/g, "\n");
const grab = (re) => { const m = src.match(re); if (!m) throw new Error("não achei no popup.js: " + re); return m[0]; };
const code = [grab(/const RANK = \{[^}]*\};/), grab(/function globoIdOf[^\n]*\n/), grab(/function groupize\(list\) \{[\s\S]*?\n\}\n/)].join("\n");
const groupize = new Function(code + "; return groupize;")();

// caso real do G1 (matéria com 2 vídeos): player + HLS de cada um
const items = [
  { url: "https://globoplay.globo.com/v/14949353/", kind: "Globo/G1", group: "globoplay.globo.com/v/14949353/", pri: 2 },
  { url: "https://globoplay.globo.com/v/15184431/", kind: "Globo/G1", group: "globoplay.globo.com/v/15184431/", pri: 0 },
  { url: "https://x.video.globo.com/hls/g-manifest.ism/14949353.m3u8?t=1", kind: "HLS", group: "x.video.globo.com/hls/g-manifest.ism" },
  { url: "https://x.video.globo.com/hls/R-manifest.ism/15184431.m3u8?t=1", kind: "HLS", group: "x.video.globo.com/hls/R-manifest.ism" },
];
const g = groupize(items);
assert.strictEqual(g.length, 2, "2 vídeos = 2 itens (eram 4)");
assert.ok(g.every((x) => x.best.kind === "Globo/G1"), "mostra o item do player");
assert.ok(g.every((x) => x.count === 2), "cada um agrupa player + HLS");
assert.ok(/14949353/.test(g[0].best.url), "o que está tocando (pri 2) vem primeiro");

// outro site: não mistura nada
const other = groupize([{ url: "https://a.com/v1.mp4", kind: "MP4" }, { url: "https://a.com/v2.mp4", kind: "MP4" }]);
assert.strictEqual(other.length, 2);
console.log("popup_group: ok (G1: 4 itens -> 2; outro site intacto)");
