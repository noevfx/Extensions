"""Teste de fumaça de uma INSTALAÇÃO real (roda depois do instalador). Só biblioteca padrão.

    NOEVFX_PORT=18765 python tests/install_smoke.py

Confere: servidor online, ferramentas instaladas, e um download de verdade (um trecho de 8 s de um HLS público)
em "melhor qualidade" e em "só áudio", verificando se o arquivo tem VÍDEO e ÁUDIO.
"""
import http.client
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

PORT = int(os.environ.get("NOEVFX_PORT", "8765"))
EXT_ID = "hdmfifeopbmjcfjbjpkfjinejneohlji"
STREAM = os.environ.get("NOEVFX_TEST_URL", "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8")
H = {"Origin": "chrome-extension://" + EXT_ID, "X-NoeVFX-Client": "1", "Content-Type": "application/json"}
fails = []


def req(method, path, body=None, timeout=60):
    c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=timeout)
    c.request(method, path, json.dumps(body) if body is not None else None, H)
    r = c.getresponse()
    data = json.loads(r.read() or b"{}")
    c.close()
    return r.status, data


def check(name, ok, extra=""):
    print(("  OK     " if ok else "  FALHA  ") + name + ("  -> " + str(extra) if extra else ""))
    if not ok:
        fails.append(name)


def streams_of(ffmpeg, path):
    """Usa só o ffmpeg (o ffprobe pode não existir): 'ffmpeg -i arquivo' lista as trilhas no stderr."""
    r = subprocess.run([ffmpeg, "-hide_banner", "-i", str(path)], capture_output=True, text=True, errors="replace")
    txt = r.stderr
    return ("Video:" in txt, "Audio:" in txt)


def main():
    print("== Servidor")
    health = None
    for _ in range(60):
        try:
            st, health = req("GET", "/health")
            if st == 200:
                break
        except Exception:
            time.sleep(1)
    check("servidor online", bool(health and health.get("ok")))
    if not health:
        return 1
    for k in ("yt_dlp", "ffmpeg_ok", "deno"):
        check("health: %s" % k, bool(health.get(k)), health.get("yt_dlp_path") if k == "yt_dlp" else "")
    print("  ..     %s | python %s | api %s | ffprobe_ok=%s" % (health.get("platform"), health.get("python"), health.get("api_version"), health.get("ffprobe_ok")))

    out = Path(tempfile.mkdtemp(prefix="nvf_smoke_"))
    st, cfg = req("POST", "/config", {"output_dir": str(out), "onboarded": True, "extra_args": '--download-sections "*0-8"'})
    check("config aceita argumentos seguros", st == 200, cfg.get("error", ""))

    ffmpeg = health.get("ffmpeg_path") or ""
    print("\n== Downloads reais (trecho de 8 s)")
    for quality in ("best", "audio"):
        t0 = time.time()
        st, js = req("POST", "/download", {"url": STREAM, "quality": quality, "title": "teste"})
        if st != 200:
            check("download %s enfileirado" % quality, False, js)
            continue
        job = {}
        while time.time() - t0 < 420:
            _, job = req("GET", "/status?id=" + js["job_id"])
            if job.get("status") in ("done", "error", "canceled"):
                break
            time.sleep(2)
        f = Path(job.get("file", "")) if job.get("file") else None
        check("download %s terminou (%.0f s)" % (quality, time.time() - t0), job.get("status") == "done" and bool(f) and f.exists(),
              job.get("error", "") or (f.name[-40:] if f else ""))
        if f and f.exists() and ffmpeg:
            has_v, has_a = streams_of(ffmpeg, f)
            if quality == "best":
                check("arquivo tem VÍDEO e ÁUDIO", has_v and has_a, "video=%s audio=%s" % (has_v, has_a))
            else:
                check("arquivo de áudio tem ÁUDIO", has_a, f.suffix)
    print("\n" + ("TUDO OK" if not fails else "%d FALHA(S): %s" % (len(fails), "; ".join(fails))))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
