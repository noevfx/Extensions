#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NOÉ VFX Downloader — servidor local  (noevfx.com)
=================================================
Roda em segundo plano (Windows, macOS e Linux), só escuta 127.0.0.1 e só
responde a pedidos feitos pela extensão (cabeçalho X-NoeVFX-Client).

Endpoints
  GET  /health          estado do motor (yt-dlp, ffmpeg, python, pastas)
  GET  /config          configuração atual
  POST /config          salva configuração (pasta padrão, qualidade, etc.)
  POST /pick-folder     abre o seletor de pasta NATIVO do sistema
  POST /open-folder     abre a pasta no gerenciador de arquivos
  GET  /thumb?url=      gera miniatura do vídeo (ffmpeg, com cache)
  POST /download        enfileira download
  GET  /status?id=      progresso de um download
  GET  /jobs            últimos downloads

Sem dependências externas: só a biblioteca padrão do Python.
"""

import hashlib
import json
import os
import platform
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import Request as UrlRequest
from urllib.request import urlopen as url_open

VERSION = "3.0.0"
BRAND = "NOÉ VFX (noevfx.com)"
HOST = "127.0.0.1"
PORT = int(os.environ.get("NOEVFX_PORT", "8765"))

BASE = Path(__file__).resolve().parent
BIN = BASE / "bin"
IS_WIN = os.name == "nt"
IS_MAC = sys.platform == "darwin"
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0) if IS_WIN else 0
TMP = Path(tempfile.gettempdir())
THUMB_CACHE = TMP / "NoeVFXThumbs"


# --------------------------------------------------------------------------- #
# configuração
# --------------------------------------------------------------------------- #
def default_output_dir() -> Path:
    home = Path.home()
    if IS_WIN:
        return home / "Downloads" / "NoeVFX"
    if IS_MAC:
        return home / "Movies" / "NoeVFX"
    return home / "Videos" / "NoeVFX"


DEFAULT_CFG = {
    "output_dir": str(default_output_dir()),
    "hover_action": "menu",       # "menu" | "direct"
    "default_quality": "best",
    "use_cookies": True,
    "organize_by_site": False,
    "fab_enabled": True,
    "extra_args": "",
    "onboarded": False,
}


def _parent_writable(path: Path) -> bool:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        probe = path.parent / (".nvf_probe_%d" % os.getpid())
        probe.write_text("1", encoding="utf-8")
        probe.unlink()
        return True
    except Exception:
        return False


CONFIG_FILE = BASE / "config.json"
if not CONFIG_FILE.exists() and not _parent_writable(CONFIG_FILE):
    CONFIG_FILE = Path.home() / ".noevfx-downloader" / "config.json"
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)

CFG_LOCK = threading.Lock()


def load_cfg() -> dict:
    cfg = dict(DEFAULT_CFG)
    with CFG_LOCK:
        if CONFIG_FILE.exists():
            try:
                data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    cfg.update(data)
            except Exception:
                pass
        if not cfg.get("output_dir"):
            cfg["output_dir"] = DEFAULT_CFG["output_dir"]
    return cfg


def save_cfg(patch: dict) -> dict:
    cfg = load_cfg()
    for k, v in (patch or {}).items():
        if k in DEFAULT_CFG and v is not None:
            cfg[k] = v

    out = Path(str(cfg.get("output_dir") or DEFAULT_CFG["output_dir"])).expanduser()
    try:
        out.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        raise RuntimeError("Não consegui criar a pasta: %s" % exc)
    cfg["output_dir"] = str(out)

    with CFG_LOCK:
        CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    return cfg


# --------------------------------------------------------------------------- #
# ferramentas (yt-dlp / ffmpeg) — pasta bin, PATH, winget/choco e brew
# --------------------------------------------------------------------------- #
_EXE_CACHE = {}
_EXE_LOCK = threading.Lock()
_EXE_TTL = 60.0


def find_exe(name: str) -> str:
    with _EXE_LOCK:
        hit = _EXE_CACHE.get(name)
        if hit is not None:
            value, ts = hit
            if value and Path(value).exists():
                return value
            if not value and (time.time() - ts) < _EXE_TTL:
                return ""

        found = ""

        for cand in (BIN / name, BIN / (name + ".exe")):
            if cand.exists():
                found = str(cand)
                break

        if not found:
            found = shutil.which(name) or ""

        if not found and IS_WIN:
            roots = [
                Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages",
                Path(os.environ.get("ProgramData", "C:/ProgramData")) / "chocolatey" / "bin",
            ]
            for root in roots:
                try:
                    for p in root.glob("**/%s.exe" % name):
                        found = str(p)
                        break
                except Exception:
                    pass
                if found:
                    break

        if not found and IS_MAC:
            for p in ("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"):
                cand = Path(p) / name
                if cand.exists() and os.access(str(cand), os.X_OK):
                    found = str(cand)
                    break

        _EXE_CACHE[name] = (found, time.time())
        return found


def exe_path(name: str) -> str:
    return find_exe(name)


_IMPL_LOCK = threading.Lock()
_IMPL = {"checked": False, "ok": False}


def supports_impersonate() -> bool:
    """--impersonate (disfarce de navegador real) ajuda a furar bloqueio anti-bot."""
    with _IMPL_LOCK:
        if _IMPL["checked"]:
            return _IMPL["ok"]
        _IMPL["checked"] = True
        yt = exe_path("yt-dlp")
        if not yt:
            return False
        try:
            out = subprocess.run(
                [yt, "--help"], capture_output=True, text=True, timeout=25,
                creationflags=NO_WINDOW,
            )
            _IMPL["ok"] = "impersonate" in ((out.stdout or "") + (out.stderr or ""))
        except Exception:
            _IMPL["ok"] = False
        return _IMPL["ok"]


# --------------------------------------------------------------------------- #
# jobs
# --------------------------------------------------------------------------- #
JOBS = {}
JOBS_LOCK = threading.Lock()
MAX_CONCURRENT = 3
EXECUTOR = ThreadPoolExecutor(max_workers=MAX_CONCURRENT)

FORMAT_MAP = {
    "best": "bestvideo*+bestaudio/best",
    "1080": "bestvideo*[height<=1080]+bestaudio/best[height<=1080]/best",
    "720": "bestvideo*[height<=720]+bestaudio/best[height<=720]/best",
    "audio": "bestaudio[ext=m4a]/bestaudio",
}
FORMAT_NO_FFMPEG = {
    "best": "best[ext=mp4]/best",
    "1080": "best[height<=1080]/best",
    "720": "best[height<=720]/best",
    "audio": "bestaudio/best",
}

PCT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*%")
SPEED_RE = re.compile(r"\bat\s+([\d.,]+\s*[KMG]?i?B/s)", re.I)
DEST_RE = re.compile(r"\[download\]\s+Destination:\s+(.+)$", re.I)
MERGE_RE = re.compile(r'Merging formats into "(.+)"', re.I)
ALREADY_RE = re.compile(r"has already been downloaded", re.I)


def job_update(job_id: str, **kw):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if job:
            job.update(kw)


def build_cmd(url: str, fmt: str, out_tmpl: str, referer: str, ua: str,
              cookies_file: str, extra_args: str, impersonate: bool, single: bool = True):
    yt = exe_path("yt-dlp")
    has_ffmpeg = bool(exe_path("ffmpeg"))

    cmd = [
        yt, "--newline", "--no-playlist", "--no-warnings",
        "--concurrent-fragments", "16",
        "--retries", "10",
        "--fragment-retries", "20",
        "--retry-sleep", "1",
        "--socket-timeout", "30",
        "--extractor-retries", "3",
        "--trim-filenames", "150",
        "-f", fmt,
        "-o", out_tmpl,
    ]

    # um vídeo por pedido: evita baixar todos os <video> da página de uma vez
    if single:
        cmd += ["--playlist-items", "1"]

    if has_ffmpeg:
        cmd += ["--merge-output-format", "mp4"]

    if referer.startswith("http"):
        cmd += ["--referer", referer]
        try:
            origin = "%s://%s" % (urlparse(referer).scheme, urlparse(referer).netloc)
            cmd += ["--add-header", "Origin:%s" % origin]
        except Exception:
            pass

    if ua:
        cmd += ["--user-agent", ua]

    if cookies_file:
        cmd += ["--cookies", cookies_file]

    if impersonate:
        cmd += ["--impersonate", "chrome"]

    if extra_args:
        try:
            cmd += shlex.split(extra_args, posix=not IS_WIN)
        except Exception:
            pass

    cmd.append(url)
    return cmd, has_ffmpeg


def run_ytdlp(job_id: str, url: str, fmt: str, out_tmpl: str, referer: str,
              ua: str, cookies_file: str, extra_args: str, impersonate: bool, single: bool = True):
    cmd, _has_ffmpeg = build_cmd(url, fmt, out_tmpl, referer, ua, cookies_file, extra_args, impersonate, single)
    if not cmd[0]:
        raise RuntimeError("yt-dlp não encontrado. Rode o instalador do NOÉ VFX.")

    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace",
        creationflags=NO_WINDOW, bufsize=1,
    )

    tail = []
    last_pct = None
    for line in proc.stdout:
        line = line.rstrip()
        if not line:
            continue
        tail.append(line)
        if len(tail) > 12:
            tail.pop(0)

        m = DEST_RE.search(line)
        if m:
            job_update(job_id, file=m.group(1).strip())

        if MERGE_RE.search(line) or line.startswith("[Merger]"):
            job_update(job_id, status="merging", progress="unindo")
            continue

        if ALREADY_RE.search(line):
            job_update(job_id, progress="já baixado")
            continue

        m = PCT_RE.search(line)
        if m and "[download]" in line:
            pct = m.group(1).replace(",", ".") + "%"
            sp = SPEED_RE.search(line)
            upd = {"status": "downloading", "progress": pct}
            if sp:
                upd["speed"] = sp.group(1).replace(" ", "")
            job_update(job_id, **upd)
            last_pct = pct

        if line.startswith("ERROR:"):
            job_update(job_id, error=line[6:].strip()[:300])

    code = proc.wait()
    return code, tail, last_pct


def run_job(job_id: str, req: dict):
    cfg = load_cfg()
    quality = req.get("quality") or cfg.get("default_quality") or "best"
    url = req.get("url", "")
    fallback = req.get("fallback_stream") or req.get("fallbackStream") or ""
    referer = req.get("referer") or ""
    ua = req.get("userAgent") or req.get("user_agent") or ""
    extra = req.get("extra_args") or cfg.get("extra_args") or ""

    out_dir = Path(req.get("output_dir") or cfg.get("output_dir") or DEFAULT_CFG["output_dir"]).expanduser()
    if req.get("organizeBySite") or cfg.get("organize_by_site"):
        try:
            site = urlparse(url).netloc.replace(":", "_") or "outros"
            out_dir = out_dir / site
        except Exception:
            pass
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        out_dir = Path.home() / "Downloads"
        out_dir.mkdir(parents=True, exist_ok=True)

    job_update(job_id, status="downloading", output_dir=str(out_dir), progress="0%")

    cookies_file = ""
    try:
        cookie_txt = req.get("cookies") or ""
        if cookie_txt.strip() and cfg.get("use_cookies", True):
            fd, cookies_file = tempfile.mkstemp(prefix="nvf_ck_", suffix=".txt", dir=str(TMP))
            os.close(fd)
            Path(cookies_file).write_text(cookie_txt, encoding="utf-8")

        has_ff = bool(exe_path("ffmpeg"))
        fmt = (FORMAT_MAP if has_ff else FORMAT_NO_FFMPEG).get(quality, FORMAT_MAP["best"])
        out_tmpl = str(out_dir / "%(title).100s [%(id)s].%(ext)s")

        imp = supports_impersonate()
        single = req.get("single", True) is not False
        cmd_extra = extra
        if quality == "audio" and has_ff:
            cmd_extra = (extra + " -x --audio-format m4a").strip()

        code, tail, _pct = run_ytdlp(job_id, url, fmt, out_tmpl, referer, ua, cookies_file, cmd_extra, imp, single)

        if code != 0 and imp:
            job_update(job_id, progress="tentando modo compatível...")
            code, tail, _pct = run_ytdlp(job_id, url, fmt, out_tmpl, referer, ua, cookies_file, cmd_extra, False, single)

        if code != 0 and fallback and fallback != url:
            job_update(job_id, progress="usando stream capturado...")
            code, tail, _pct = run_ytdlp(job_id, fallback, fmt, out_tmpl, referer, ua, cookies_file, cmd_extra, imp, single)
            if code != 0 and imp:
                code, tail, _pct = run_ytdlp(job_id, fallback, fmt, out_tmpl, referer, ua, cookies_file, cmd_extra, False, single)

        if code == 0:
            job_update(job_id, status="done", progress="100%", finished=time.time())
        else:
            err = next((l[6:].strip() for l in reversed(tail) if l.startswith("ERROR:")), "")
            if not err:
                err = tail[-1] if tail else "Falha ao baixar (veja se o yt-dlp está atualizado)"
            job_update(job_id, status="error", error=err[:400], finished=time.time())

    except Exception as exc:
        job_update(job_id, status="error", error=str(exc)[:400], finished=time.time())
    finally:
        if cookies_file:
            try:
                os.remove(cookies_file)
            except Exception:
                pass


def new_job(req: dict) -> str:
    job_id = uuid.uuid4().hex[:16]
    with JOBS_LOCK:
        JOBS[job_id] = {
            "id": job_id,
            "status": "queued",
            "progress": "na fila",
            "url": req.get("url", ""),
            "title": req.get("title", ""),
            "created": time.time(),
        }
    EXECUTOR.submit(run_job, job_id, req)
    return job_id


# --------------------------------------------------------------------------- #
# miniatura (ffmpeg)
# --------------------------------------------------------------------------- #
THUMB_LOCK = threading.Lock()


def make_thumb(url: str, referer: str, ua: str) -> bytes:
    ff = exe_path("ffmpeg")
    if not ff or not url.startswith("http"):
        return b""
    THUMB_CACHE.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1((url + "|" + (referer or "")).encode("utf-8", "ignore")).hexdigest() + ".jpg"
    dest = THUMB_CACHE / key
    if dest.exists() and dest.stat().st_size > 600:
        return dest.read_bytes()

    with THUMB_LOCK:
        if dest.exists() and dest.stat().st_size > 600:
            return dest.read_bytes()
        cmd = [ff, "-hide_banner", "-loglevel", "error", "-y"]
        if ua:
            cmd += ["-user_agent", ua]
        if referer.startswith("http"):
            cmd += ["-headers", "Referer: %s\r\n" % referer]
        cmd += [
            "-analyzeduration", "12M", "-probesize", "12M",
            "-ss", "2",
            "-i", url,
            "-frames:v", "1",
            "-vf", "scale=320:-2",
            "-q:v", "6",
            str(dest),
        ]
        try:
            subprocess.run(cmd, timeout=25, creationflags=NO_WINDOW,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            return b""
        if dest.exists() and dest.stat().st_size > 600:
            return dest.read_bytes()
        return b""


# --------------------------------------------------------------------------- #
# seletor de pasta nativo
# --------------------------------------------------------------------------- #
PICK_LOCK = threading.Lock()

PICK_SCRIPT = r"""
import sys
out = sys.argv[1]
path = ""
try:
    import tkinter as tk
    from tkinter import filedialog
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    root.update()
    path = filedialog.askdirectory(title="NOE VFX - Escolha a pasta padrao para salvar os videos", mustexist=False) or ""
    root.destroy()
except Exception:
    path = ""
open(out, "w", encoding="utf-8").write(path)
"""


def _pick_windows() -> str:
    """Seletor de pasta nativo do Windows (PowerShell) — não depende do tkinter."""
    fd, tmp = tempfile.mkstemp(prefix="nvf_pick_", suffix=".txt", dir=str(TMP))
    os.close(fd)
    try:
        ini = (load_cfg().get("output_dir") or "").replace("'", "''")
        ps = "Add-Type -AssemblyName System.Windows.Forms;"
        ps += "$f = New-Object System.Windows.Forms.FolderBrowserDialog;"
        ps += "$f.Description = 'NOE VFX - escolha a pasta para salvar os videos';"
        ps += "$f.ShowNewFolderButton = $true;"
        if ini:
            ps += "$f.SelectedPath = '%s';" % ini
        ps += "if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {"
        ps += " Set-Content -LiteralPath '%s' -Value $f.SelectedPath -Encoding UTF8 }" % tmp.replace("'", "''")
        subprocess.run(
            ["powershell", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", ps],
            timeout=900, creationflags=NO_WINDOW,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        return Path(tmp).read_text(encoding="utf-8-sig", errors="replace").strip()
    except Exception:
        return ""
    finally:
        try:
            os.remove(tmp)
        except Exception:
            pass


def pick_folder() -> str:
    with PICK_LOCK:
        if IS_WIN:
            p = _pick_windows()
            if p:
                return p
        if IS_MAC:
            try:
                r = subprocess.run(
                    ["osascript", "-e",
                     'POSIX path of (choose folder with prompt "NOE VFX - escolha a pasta padrao para salvar os videos")'],
                    capture_output=True, text=True, timeout=600,
                )
                if r.returncode == 0:
                    return r.stdout.strip()
            except Exception:
                pass

        if not IS_WIN and not IS_MAC:
            for tool, args in (
                ("zenity", ["--file-selection", "--directory", "--title=Pasta padrao NOE VFX"]),
                ("kdialog", ["--getexistingdirectory", str(Path.home()), "--title", "Pasta padrao NOE VFX"]),
            ):
                if shutil.which(tool):
                    try:
                        r = subprocess.run([tool] + args, capture_output=True, text=True, timeout=600)
                        if r.returncode == 0:
                            return r.stdout.strip()
                    except Exception:
                        pass

        fd, tmp = tempfile.mkstemp(prefix="nvf_pick_", suffix=".txt", dir=str(TMP))
        os.close(fd)
        try:
            subprocess.run([sys.executable, "-c", PICK_SCRIPT, tmp], timeout=600,
                           creationflags=NO_WINDOW)
            return Path(tmp).read_text(encoding="utf-8", errors="replace").strip()
        except Exception:
            return ""
        finally:
            try:
                os.remove(tmp)
            except Exception:
                pass


def open_folder(path: str) -> bool:
    p = Path(path or load_cfg().get("output_dir") or DEFAULT_CFG["output_dir"]).expanduser()
    try:
        p.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    if not p.exists():
        return False
    try:
        if IS_WIN:
            os.startfile(str(p))  # type: ignore[attr-defined]
        elif IS_MAC:
            subprocess.Popen(["open", str(p)])
        else:
            subprocess.Popen(["xdg-open", str(p)])
        return True
    except Exception:
        return False


def py_version() -> str:
    return "%s (%d.%d)" % (platform.python_version(), sys.version_info.major, sys.version_info.minor)


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
class Handler(BaseHTTPRequestHandler):
    server_version = "NoeVFX/" + VERSION
    protocol_version = "HTTP/1.1"

    def _allowed(self) -> bool:
        origin = self.headers.get("Origin", "") or ""
        if origin and not origin.startswith("chrome-extension://") and not origin.startswith("moz-extension://"):
            return False
        return (self.headers.get("X-NoeVFX-Client", "") == "1"
                or origin.startswith(("chrome-extension://", "moz-extension://")))

    def _cors(self):
        origin = self.headers.get("Origin", "") or ""
        if origin.startswith(("chrome-extension://", "moz-extension://")):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    def _bytes(self, code: int, body: bytes, ctype: str):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=3600")
        self._cors()
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    def _body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except Exception:
            length = 0
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-NoeVFX-Client")
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if not self._allowed():
            self._json(403, {"error": "forbidden"})
            return

        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path == "/health":
            yt = exe_path("yt-dlp")
            ff = exe_path("ffmpeg")
            self._json(200, {
                "ok": True,
                "brand": BRAND,
                "version": VERSION,
                "platform": platform.system() + " " + platform.release(),
                "python": py_version(),
                "yt_dlp": bool(yt),
                "yt_dlp_path": yt,
                "ffmpeg": bool(ff),
                "ffmpeg_path": ff,
                "impersonate": supports_impersonate(),
                "output_dir": load_cfg().get("output_dir", ""),
                "default_output_dir": str(default_output_dir()),
                "config_file": str(CONFIG_FILE),
                "jobs": len(JOBS),
            })
            return

        if parsed.path == "/config":
            self._json(200, load_cfg())
            return

        if parsed.path == "/status":
            job_id = (qs.get("id") or [""])[0]
            with JOBS_LOCK:
                job = dict(JOBS.get(job_id) or {})
            if not job:
                self._json(404, {"error": "job not found"})
                return
            self._json(200, job)
            return

        if parsed.path == "/jobs":
            with JOBS_LOCK:
                items = sorted(JOBS.values(), key=lambda j: j.get("created", 0), reverse=True)[:25]
            self._json(200, {"jobs": items})
            return

        if parsed.path == "/thumb":
            url = (qs.get("url") or [""])[0]
            referer = (qs.get("referer") or [""])[0]
            ua = (qs.get("ua") or [""])[0]
            data = make_thumb(url, referer, ua) if url else b""
            if not data:
                self._json(404, {"error": "sem miniatura"})
                return
            self._bytes(200, data, "image/jpeg")
            return

        self._json(404, {"error": "not found"})

    def do_POST(self):
        if not self._allowed():
            self._json(403, {"error": "forbidden"})
            return

        path = urlparse(self.path).path

        if path == "/config":
            try:
                cfg = save_cfg(self._body())
            except Exception as exc:
                self._json(400, {"error": str(exc)})
                return
            self._json(200, cfg)
            return

        if path == "/pick-folder":
            folder = pick_folder()
            self._json(200, {"ok": bool(folder), "path": folder, "canceled": not folder})
            return

        if path == "/open-folder":
            body = self._body()
            ok = open_folder(body.get("path", ""))
            self._json(200 if ok else 500, {"ok": ok, "path": body.get("path", "")})
            return

        if path == "/download":
            body = self._body()
            url = (body.get("url") or "").strip()
            if not url.startswith("http"):
                self._json(400, {"error": "URL inválida"})
                return
            job_id = new_job(body)
            self._json(200, {"job_id": job_id, "output_dir": load_cfg().get("output_dir", "")})
            return

        self._json(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        pass


def already_running() -> bool:
    """Evita duas instâncias na mesma porta (Windows permite reutilizar a porta)."""
    try:
        req = UrlRequest(
            "http://127.0.0.1:%d/health" % PORT,
            headers={"X-NoeVFX-Client": "1"},
        )
        with url_open(req, timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


class QuietServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def handle_error(self, request, client_address):
        # o navegador aborta conexões o tempo todo; não poluir o log
        pass


def main():
    if already_running():
        print("[NOÉ VFX] Já existe um servidor rodando na porta %d." % PORT, flush=True)
        return 0
    if not exe_path("yt-dlp"):
        print("[NOÉ VFX] AVISO: yt-dlp não encontrado. Rode o instalador.", flush=True)
    try:
        httpd = QuietServer((HOST, PORT), Handler)
    except OSError as exc:
        print("[NOÉ VFX] Porta %d ocupada (%s). Já deve haver um servidor rodando." % (PORT, exc), flush=True)
        return 1
    print("[NOÉ VFX] Servidor %s em http://%s:%d" % (VERSION, HOST, PORT), flush=True)
    print("[NOÉ VFX] Pasta padrão: %s" % load_cfg().get("output_dir"), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
