#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Noe VFX Downloader — servidor local  (noevfx.com)
=================================================
Roda em segundo plano (Windows, macOS e Linux), só escuta 127.0.0.1 e só
responde a pedidos feitos pela extensão (origem chrome-extension:// com o ID
conhecido) vindos de um cabeçalho Host local.

Endpoints
  GET  /health          estado do motor (yt-dlp, ffmpeg, python, pastas)
  GET  /config          configuração atual
  POST /config          salva configuração (pasta padrão, qualidade, etc.)
  POST /pick-folder     abre o seletor de pasta NATIVO do sistema
  POST /open-folder     abre a pasta no gerenciador de arquivos
  GET  /thumb?url=      gera miniatura do vídeo (ffmpeg, com cache)
  POST /download        enfileira download
  POST /cancel          cancela um download (corpo: {"id": "..."})
  GET  /status?id=      progresso de um download
  GET  /jobs            últimos downloads

Sem dependências externas: só a biblioteca padrão do Python (3.9+).
"""

import hashlib
import hmac
import json
import os
import platform
import re
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request as UrlRequest
from urllib.request import urlopen as url_open

VERSION = "3.2.0"
API_VERSION = 2                      # sobe quando o protocolo extensão <-> servidor muda
AUDIO_FORMATS = {"mp3", "m4a", "wav", "flac", "opus"}
ADOBE_AUDIO_FORMATS = {"mp3", "m4a", "wav"}
COLLECTION_LIMIT = 500
INSPECT_SEM = threading.BoundedSemaphore(2)
BATCHES = {}
BATCH_LOCK = threading.RLock()
BRAND = "NOÉ VFX (noevfx.com)"
HOST = "127.0.0.1"
PORT = int(os.environ.get("NOEVFX_PORT", "8765"))

# ID fixo da extensão (vem da chave pública no manifest.json). Outros IDs
# (ex.: uma cópia da extensão carregada de outra pasta) entram por "allowed_extension_ids" no
# config.json ou pela variável NOEVFX_EXT_IDS (separados por vírgula).
EXT_IDS_BUILTIN = {"hdmfifeopbmjcfjbjpkfjinejneohlji"}

MAX_BODY = 2 * 1024 * 1024           # corpo máximo de um POST
MAX_ACTIVE = 60                      # downloads na fila + rodando
MAX_JOBS_KEPT = 200                  # jobs lembrados na memória
JOB_TTL = 3600                       # jobs terminados somem depois de 1 h
STALL_SECONDS = 600                  # yt-dlp sem nenhuma saída por 10 min é morto
MERGE_STALL_SECONDS = 3600           # ...e 1 h na fase de unir/converter (lives de horas)

BASE = Path(__file__).resolve().parent
BIN = BASE / "bin"
IS_WIN = os.name == "nt"
IS_MAC = sys.platform == "darwin"
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0) if IS_WIN else 0
TMP = Path(tempfile.gettempdir())
THUMB_CACHE = TMP / "NoeVFXThumbs"


# --------------------------------------------------------------------------- #
# argumentos extras do yt-dlp: só uma lista segura (nada de --exec, -o, ...)
# --------------------------------------------------------------------------- #
# nome -> quantos valores a opção recebe (0 ou 1). Comparação EXATA: abreviações
# ("--exe" no lugar de "--exec") não passam.
ARG_OK = {}
for _n in (
    "-f", "--format", "-S", "--format-sort", "--merge-output-format", "--remux-video",
    "--recode-video", "--extractor-args", "--impersonate", "--proxy",
    "--geo-verification-proxy", "--geo-bypass-country", "--sub-langs", "--sub-format",
    "--convert-subs", "--convert-thumbnails", "--add-header", "--user-agent", "--referer",
    "-r", "--limit-rate", "--throttled-rate", "-R", "--retries", "--fragment-retries",
    "--retry-sleep", "-N", "--concurrent-fragments", "--sleep-interval", "--min-sleep-interval",
    "--max-sleep-interval", "--sleep-requests", "--sleep-subtitles", "--socket-timeout",
    "--extractor-retries", "--video-password", "-u", "--username", "-p", "--password",
    "-2", "--twofactor", "--age-limit", "--max-filesize", "--min-filesize",
    "--match-filters", "--download-sections", "--audio-format", "--audio-quality",
    "--playlist-items", "--playlist-start", "--playlist-end", "--max-downloads",
    "--source-address", "--sponsorblock-mark", "--sponsorblock-remove",
):
    ARG_OK[_n] = 1
for _n in (
    "--write-subs", "--write-auto-subs", "--embed-subs", "--embed-thumbnail",
    "--embed-metadata", "--embed-chapters", "--write-thumbnail", "--write-description",
    "--write-info-json", "--geo-bypass", "--no-geo-bypass", "--hls-prefer-native",
    "--hls-prefer-ffmpeg", "--hls-use-mpegts", "--no-hls-use-mpegts", "--no-check-certificates",
    "--prefer-insecure", "--no-part", "--no-mtime", "--restrict-filenames",
    "--windows-filenames", "-4", "--force-ipv4", "-6", "--force-ipv6", "-i",
    "--ignore-errors", "--no-continue", "-x", "--extract-audio", "-k", "--keep-video",
    "--yes-playlist", "--no-playlist", "--no-overwrites", "--force-overwrites",
    "--live-from-start", "--no-live-from-start",
):
    ARG_OK[_n] = 0


def parse_extra_args(text):
    """Valida e separa o campo 'argumentos extras'. ValueError se algo não for permitido."""
    text = (text or "").strip()
    if not text:
        return []
    if len(text) > 1000:
        raise ValueError("argumentos extras: texto muito longo")
    try:
        toks = shlex.split(text, posix=True)
    except ValueError:
        raise ValueError("argumentos extras: aspas não fechadas")
    out = []
    i = 0
    while i < len(toks):
        tk = toks[i]
        if not tk.startswith("-"):
            raise ValueError("argumentos extras: valor solto '%s'" % tk[:40])
        if tk.startswith("--"):
            name, eq, _val = tk.partition("=")
        else:
            name, eq = tk, ""
        arity = ARG_OK.get(name)
        if arity is None:
            raise ValueError("argumentos extras: opção não permitida '%s'" % name[:40])
        out.append(tk)
        i += 1
        if arity == 1 and not eq:
            if i >= len(toks):
                raise ValueError("argumentos extras: falta o valor de %s" % name)
            out.append(toks[i])
            i += 1
        elif arity == 0 and eq:
            raise ValueError("argumentos extras: %s não recebe valor" % name)
    return out


# --------------------------------------------------------------------------- #
# configuração
# --------------------------------------------------------------------------- #
def _videos_dir() -> Path:
    """A pasta de vídeos de verdade do usuário, em qualquer sistema: Windows "Vídeos" (pasta conhecida do sistema: vale se foi movida,
    está no OneDrive ou tem outro nome), macOS "Filmes" (~/Movies), Linux "Vídeos" (xdg-user-dir)."""
    home = Path.home()
    if IS_WIN:
        try:
            import ctypes

            class GUID(ctypes.Structure):
                _fields_ = [("a", ctypes.c_ulong), ("b", ctypes.c_ushort), ("c", ctypes.c_ushort), ("d", ctypes.c_ubyte * 8)]

            # FOLDERID_Videos = {18989B1D-99B5-455B-841C-AB7C74E4DDFC}
            g = GUID(0x18989B1D, 0x99B5, 0x455B, (ctypes.c_ubyte * 8)(0x84, 0x1C, 0xAB, 0x7C, 0x74, 0xE4, 0xDD, 0xFC))
            p = ctypes.c_wchar_p()
            if ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(g), 0, None, ctypes.byref(p)) == 0 and p.value:
                out = p.value
                ctypes.windll.ole32.CoTaskMemFree(p)
                return Path(out)
        except Exception:
            pass
        return home / "Videos"
    if IS_MAC:
        return home / "Movies"
    try:
        out = subprocess.run(["xdg-user-dir", "VIDEOS"], capture_output=True, text=True, timeout=3).stdout.strip()
        if out and Path(out) != home:
            return Path(out)
    except Exception:
        pass
    return home / "Videos"


def default_output_dir() -> Path:
    return _videos_dir() / "NoeVFX"


DEFAULT_CFG = {
    "output_dir": str(default_output_dir()),
    "hover_action": "menu",       # "menu" | "direct"
    "default_quality": "best",
    "use_cookies": True,
    "compat_h264": False,         # opcional (o usuário liga): arquivo que abre no Premiere e em outros editores, H.264 + AAC (nada de AV1/VP9/Opus)
    "organize_by_site": False,
    "fab_enabled": True,
    "extra_args": "",
    "onboarded": False,
}
BOOL_KEYS = ("use_cookies", "organize_by_site", "fab_enabled", "onboarded", "compat_h264")


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


def clean_patch(patch: dict) -> dict:
    """Valida tipos e limites do que a extensão quer gravar. ValueError se algo estiver errado."""
    out = {}
    for k, v in (patch or {}).items():
        if k not in DEFAULT_CFG or v is None:
            continue
        if k == "output_dir":
            if not isinstance(v, str) or len(v) > 500 or any(ord(c) < 32 for c in v):
                raise ValueError("Pasta inválida")
            out[k] = v.strip()
        elif k == "hover_action":
            if v not in ("menu", "direct"):
                raise ValueError("hover_action inválido")
            out[k] = v
        elif k == "default_quality":
            if v not in FORMAT_MAP:
                raise ValueError("Qualidade inválida")
            out[k] = v
        elif k in BOOL_KEYS:
            if not isinstance(v, bool):
                raise ValueError("%s precisa ser verdadeiro/falso" % k)
            out[k] = v
        elif k == "extra_args":
            if not isinstance(v, str):
                raise ValueError("extra_args precisa ser texto")
            parse_extra_args(v)           # só valida; ValueError se tiver opção proibida
            out[k] = v.strip()
    return out


def save_cfg(patch: dict) -> dict:
    cfg = load_cfg()
    cfg.update(clean_patch(patch))

    out = Path(str(cfg.get("output_dir") or DEFAULT_CFG["output_dir"])).expanduser()
    try:
        out.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        raise RuntimeError("Não consegui criar a pasta: %s" % exc)
    cfg["output_dir"] = str(out)

    with CFG_LOCK:
        tmp = CONFIG_FILE.with_name(CONFIG_FILE.name + ".tmp")
        tmp.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(str(tmp), str(CONFIG_FILE))
    return cfg


_IDS_CACHE = {"at": 0.0, "ids": set()}


def allowed_ext_ids() -> set:
    now = time.time()
    if now - _IDS_CACHE["at"] < 5:
        return _IDS_CACHE["ids"]
    ids = set(EXT_IDS_BUILTIN)
    extra = load_cfg().get("allowed_extension_ids")
    if isinstance(extra, list):
        ids.update(str(x).strip() for x in extra if str(x).strip())
    env = os.environ.get("NOEVFX_EXT_IDS", "")
    ids.update(x.strip() for x in env.split(",") if x.strip())
    _IDS_CACHE.update(at=now, ids=ids)
    return ids


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

        if not found and not IS_WIN:
            # o serviço (launchd/systemd) roda com um PATH mínimo: procura nos lugares comuns
            dirs = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin",
                    str(Path.home() / ".local" / "bin"), str(Path.home() / ".deno" / "bin")]
            dirs += sorted(str(p) for p in (Path.home() / "Library" / "Python").glob("*/bin"))
            for p in dirs:
                cand = Path(p) / name
                if cand.exists() and os.access(str(cand), os.X_OK):
                    found = str(cand)
                    break

        _EXE_CACHE[name] = (found, time.time())
        return found


def exe_path(name: str) -> str:
    return find_exe(name)


def child_env() -> dict:
    """PATH dos subprocessos: inclui a pasta bin e onde estão deno/ffmpeg/ffprobe (o yt-dlp usa o Deno no YouTube)."""
    env = dict(os.environ)
    extra = [str(BIN)]
    for tool in ("deno", "ffmpeg", "ffprobe"):
        p = find_exe(tool)
        if p:
            d = str(Path(p).parent)
            if d not in extra:
                extra.append(d)
    env["PATH"] = os.pathsep.join(extra + [env.get("PATH", "")])
    env["PYTHONIOENCODING"] = "utf-8"
    return env


_FF_LOCK = threading.Lock()
_FF = {"stamp": None, "state": None}


def _runs_ok(exe: str) -> bool:
    try:
        r = subprocess.run([exe, "-version"], capture_output=True, timeout=15, creationflags=NO_WINDOW,
                           stdin=subprocess.DEVNULL)
        return r.returncode == 0
    except Exception:
        return False


def ffmpeg_state() -> dict:
    """FFmpeg de verdade: o arquivo existe E executa. {ok, probe, path, dir, same_dir}.

    Na 3.0 o servidor só checava se o arquivo existia e nunca dizia ao yt-dlp onde ele estava:
    o yt-dlp não achava o FFmpeg, deixava vídeo e áudio em arquivos separados (vídeo "sem áudio")
    e o m4a dava erro ('ffprobe and ffmpeg not found')."""
    ff = find_exe("ffmpeg")
    pr = find_exe("ffprobe")
    try:
        stamp = (ff, pr, os.stat(ff).st_mtime if ff else 0, os.stat(pr).st_mtime if pr else 0)
    except Exception:
        stamp = (ff, pr, 0, 0)
    with _FF_LOCK:
        if _FF["stamp"] == stamp and _FF["state"] is not None:
            return _FF["state"]
        ok = bool(ff) and _runs_ok(ff)
        probe = bool(pr) and _runs_ok(pr)
        st = {
            "ok": ok, "probe": probe, "path": ff, "probe_path": pr,
            "dir": str(Path(ff).parent) if ff else "",
            "same_dir": bool(ok and probe and Path(ff).parent == Path(pr).parent),
        }
        _FF.update(stamp=stamp, state=st)
        return st


_IMPL_LOCK = threading.Lock()
_IMPL = {"checked": False, "ok": False, "stamp": None}


def _yt_stamp():
    yt = exe_path("yt-dlp")
    try:
        return (yt, os.stat(yt).st_mtime) if yt else None
    except Exception:
        return None


def impersonate_cached():
    """Sem custo: True/False se já sabemos, None se ainda não verificamos."""
    with _IMPL_LOCK:
        if _IMPL["checked"] and _IMPL["stamp"] == _yt_stamp():
            return _IMPL["ok"]
    return None


_IMPL_RUN = threading.Lock()       # só serializa a verificação lenta; /health nunca espera por ela


def supports_impersonate() -> bool:
    """--impersonate (disfarce de navegador real) ajuda a furar bloqueio anti-bot. Roda 1 vez por versão do yt-dlp."""
    with _IMPL_RUN:
        stamp = _yt_stamp()
        with _IMPL_LOCK:
            if _IMPL["checked"] and _IMPL["stamp"] == stamp:
                return _IMPL["ok"]
        yt = exe_path("yt-dlp")
        if not yt:
            return False
        ok = False
        try:
            out = subprocess.run(
                [yt, "--ignore-config", "--help"], capture_output=True, text=True,
                encoding="utf-8", errors="replace", timeout=25, creationflags=NO_WINDOW,
                stdin=subprocess.DEVNULL, env=child_env(), cwd=str(BASE),
            )
            ok = "impersonate" in ((out.stdout or "") + (out.stderr or ""))
        except Exception:
            ok = False
        with _IMPL_LOCK:
            _IMPL.update(checked=True, ok=ok, stamp=stamp)
        return ok


# --------------------------------------------------------------------------- #
# validação de entradas
# --------------------------------------------------------------------------- #
_CTRL_RE = re.compile(r"[\x00-\x1f\x7f]")


def clean_url(value, maxlen=4096) -> str:
    if not isinstance(value, str):
        return ""
    value = value.strip()
    if not value or len(value) > maxlen or _CTRL_RE.search(value) or " " in value:
        return ""
    try:
        u = urlparse(value)
    except Exception:
        return ""
    if u.scheme.lower() not in ("http", "https") or not u.netloc:
        return ""
    return value


def clean_header(value, maxlen) -> str:
    if not isinstance(value, str):
        return ""
    return _CTRL_RE.sub("", value)[:maxlen].strip()


def clean_cookies(value) -> str:
    """Só aceita o formato Netscape (comentários + linhas de 7 campos separados por TAB)."""
    if not isinstance(value, str) or not value.strip():
        return ""
    lines = ["# Netscape HTTP Cookie File"]
    for ln in value.replace("\r", "").split("\n"):
        if ln.startswith("# Netscape"):
            continue
        if ln.startswith("#HttpOnly_") or (not ln.startswith("#") and ln.count("\t") == 6):
            if ln.count("\t") == 6 and not _CTRL_RE.search(ln.replace("\t", "")):
                lines.append(ln)
    return "\n".join(lines) + "\n" if len(lines) > 1 else ""


def sweep_temp():
    """Apaga sobras de cookies/seletor de execuções que caíram no meio."""
    cutoff = time.time() - 60
    try:
        for p in TMP.glob("nvf_ck_*"):
            try:
                if p.stat().st_mtime < cutoff:
                    p.unlink()
            except Exception:
                pass
        for p in TMP.glob("nvf_pick_*"):
            try:
                if p.stat().st_mtime < cutoff:
                    p.unlink()
            except Exception:
                pass
    except Exception:
        pass


# --------------------------------------------------------------------------- #
# jobs
# --------------------------------------------------------------------------- #
JOBS = {}
PROCS = {}
CANCELED = set()
JOBS_LOCK = threading.Lock()
MAX_CONCURRENT = 3
EXECUTOR = ThreadPoolExecutor(max_workers=MAX_CONCURRENT)
ACTIVE = ("queued", "downloading", "merging")


class QueueFull(Exception):
    pass


FORMAT_MAP = {
    "best": "bestvideo*+bestaudio/best",
    "1080": "bestvideo*[height<=1080]+bestaudio/best[height<=1080]/best",
    "720": "bestvideo*[height<=720]+bestaudio/best[height<=720]/best",
    # sem faixa só de áudio (HLS/MP4 "juntos"): cai no vídeo inteiro e o -x extrai o áudio
    "audio": "bestaudio[ext=m4a]/bestaudio/best",
}
FORMAT_NO_FFMPEG = {
    "best": "best[ext=mp4]/best",
    "1080": "best[height<=1080]/best",
    "720": "best[height<=720]/best",
    "audio": "bestaudio[ext=m4a]/bestaudio/best",
}

# Modo "compatível com editores": a MESMA resolução de sempre, mas entre formatos de mesma resolução prefere H.264 e áudio AAC
# (-S "res,vcodec:h264,acodec:aac"). Quando a maior resolução só existe em AV1/VP9 (ex.: 4K do YouTube), o arquivo é convertido
# para H.264 depois do download (compat_fix): nunca se perde resolução por causa do codec.
COMPAT_SORT = "res,vcodec:h264,acodec:aac"


COMPAT_LOCK = threading.Lock()
VIDEO_BAD_CODECS = {"av1", "vp9", "vp8"}               # não abrem no Premiere (nem em muitos editores)
AUDIO_OK_CODECS = {"aac", "mp3", "alac", "pcm_s16le", "pcm_s24le", "ac3", "eac3"}


def compat_plan(vcodec: str, acodec: str):
    """(converte_video, converte_audio) para o arquivo abrir em editores. Puro: testável sem ffmpeg."""
    v = (vcodec or "").lower()
    a = (acodec or "").lower()
    return (v in VIDEO_BAD_CODECS, bool(a) and a not in AUDIO_OK_CODECS)


def _probe_codecs(path: Path):
    """(vcodec, acodec, duração_s) pelo ffprobe, ou None se não der."""
    pr = ffmpeg_state().get("probe_path")
    if not pr:
        return None
    try:
        out = subprocess.run([pr, "-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration", "-of", "json", str(path)],
                             capture_output=True, text=True, timeout=60, creationflags=NO_WINDOW, stdin=subprocess.DEVNULL).stdout
        d = json.loads(out or "{}")
        v = next((s["codec_name"] for s in d.get("streams", []) if s.get("codec_type") == "video"), "")
        a = next((s["codec_name"] for s in d.get("streams", []) if s.get("codec_type") == "audio"), "")
        return v, a, float((d.get("format") or {}).get("duration") or 0)
    except Exception:
        return None


def compat_fix(job_id: str, out_dir: Path, since: float) -> list:
    """Converte para H.264 + AAC (MP4) os vídeos deste download que vieram em AV1/VP9/Opus. Devolve os arquivos finais."""
    st = ffmpeg_state()
    done = []
    if not (st.get("ok") and st.get("probe_path")):
        return done
    # ".temp.mp4" = o yt-dlp ainda está juntando vídeo e áudio; ".compat.mp4" = conversão de outro download em andamento
    files = [p for p in _videos_since(out_dir, since) if p.suffix.lower() in (".mp4", ".mkv", ".webm", ".mov", ".m4v")
             and not re.search(r"\.(temp|compat|part|ytdl)\.", p.name, re.I)]
    for n, p in enumerate(files, 1):
        if _is_canceled(job_id):
            break
        with COMPAT_LOCK:                                       # dois downloads na mesma pasta nunca convertem o mesmo arquivo juntos
            if not p.exists():
                continue                                        # outro download já converteu e trocou este arquivo
            r = _compat_one(job_id, p, n, len(files), st)
        done.append(r)
    return done


GPU_ENCODERS = [
    # (codificador, parâmetros, nome para o usuário): qualidade parecida com o libx264 crf 18, várias vezes mais rápido
    ("h264_nvenc", ["-preset", "p4", "-rc", "vbr", "-cq", "19", "-b:v", "0"], "placa NVIDIA"),
    ("h264_qsv", ["-global_quality", "20"], "Intel Quick Sync"),
    ("h264_amf", ["-quality", "quality", "-rc", "cqp", "-qp_i", "19", "-qp_p", "19"], "placa AMD"),
]
CPU_ENCODER = ("libx264", ["-crf", "18", "-preset", "fast"], "processador")
_ENC = {"v": None}


def windows_gpu_adapters():
    """DXGI: ordem de alto desempenho, ligada ao índice D3D11 pelo LUID (não pela marca)."""
    if not IS_WIN:
        return []
    import ctypes as c
    from ctypes import wintypes as w

    class GUID(c.Structure):
        _fields_ = [("data", c.c_ubyte * 16)]

    class LUID(c.Structure):
        _fields_ = [("low", w.DWORD), ("high", w.LONG)]

    class DESC(c.Structure):
        _fields_ = [("name", w.WCHAR * 128), ("vendor", w.UINT), ("device", w.UINT),
                    ("subsys", w.UINT), ("revision", w.UINT), ("vram", c.c_size_t),
                    ("system", c.c_size_t), ("shared", c.c_size_t), ("luid", LUID), ("flags", w.UINT)]

    def guid(value):
        return GUID((c.c_ubyte * 16).from_buffer_copy(uuid.UUID(value).bytes_le))

    def call(obj, slot, result, types, *args):
        table = c.cast(obj, c.POINTER(c.POINTER(c.c_void_p))).contents
        return c.WINFUNCTYPE(result, c.c_void_p, *types)(table[slot])(obj, *args)

    factory = c.c_void_p()
    try:
        iid = guid("c1b6694f-ff09-44a9-b03c-77900a0a1d17")  # IDXGIFactory6
        aid = guid("29038f61-3839-4626-91fd-086879011a05")  # IDXGIAdapter1
        create = c.WinDLL("dxgi").CreateDXGIFactory1
        create.argtypes = [c.POINTER(GUID), c.POINTER(c.c_void_p)]
        create.restype = w.LONG
        if create(c.byref(iid), c.byref(factory)) < 0:
            return []
        indices = {}
        for index in range(64):
            adapter = c.c_void_p()
            if call(factory, 12, w.LONG, [w.UINT, c.POINTER(c.c_void_p)], index, c.byref(adapter)) < 0:
                break
            try:
                desc = DESC()
                if call(adapter, 10, w.LONG, [c.POINTER(DESC)], c.byref(desc)) >= 0:
                    indices[(desc.luid.low, desc.luid.high)] = index
            finally:
                call(adapter, 2, w.ULONG, [])
        found = []
        for rank in range(64):
            adapter = c.c_void_p()
            if call(factory, 29, w.LONG, [w.UINT, w.UINT, c.POINTER(GUID), c.POINTER(c.c_void_p)],
                    rank, 2, c.byref(aid), c.byref(adapter)) < 0:  # HIGH_PERFORMANCE
                break
            try:
                desc = DESC()
                if call(adapter, 10, w.LONG, [c.POINTER(DESC)], c.byref(desc)) < 0 or desc.flags & 2:
                    continue  # ignora adaptador de software
                index = indices.get((desc.luid.low, desc.luid.high))
                if index is not None:
                    found.append({"index": index, "vendor": desc.vendor, "name": desc.name})
            finally:
                call(adapter, 2, w.ULONG, [])
        return found
    except (OSError, ValueError, AttributeError):
        return []
    finally:
        if factory:
            call(factory, 2, w.ULONG, [])


_GPU_DEVICE_ARGS = {}


def gpu_candidates(adapters):
    """Mantém a prioridade DXGI e seleciona explicitamente o mesmo adaptador no FFmpeg."""
    vendors = {0x10de: "h264_nvenc", 0x8086: "h264_qsv", 0x1002: "h264_amf"}
    specs = {enc[0]: enc for enc in GPU_ENCODERS}
    candidates = []
    for adapter in adapters:
        spec = specs.get(vendors.get(adapter["vendor"]))
        if not spec:
            continue
        enc = (spec[0], list(spec[1]), "%s (GPU %d)" % (adapter["name"], adapter["index"]))
        args = ["-init_hw_device", "d3d11va=nvf:%d" % adapter["index"]]
        if spec[0] == "h264_qsv":
            args += ["-init_hw_device", "qsv=nvfq@nvf", "-filter_hw_device", "nvfq"]
        else:
            args += ["-filter_hw_device", "nvf"]
        _GPU_DEVICE_ARGS[(enc[0], enc[2])] = args
        candidates.append(enc)
    return candidates


def encoder_device_args(enc):
    return _GPU_DEVICE_ARGS.get((enc[0], enc[2]), []) if enc else []


def h264_encoder(ffmpeg: str):
    """Testa a GPU indicada como alto desempenho; se não puder selecioná-la, usa a CPU."""
    if _ENC["v"] is None:
        _ENC["v"] = CPU_ENCODER
        candidates = gpu_candidates(windows_gpu_adapters()) if IS_WIN else GPU_ENCODERS
        for enc in candidates:
            try:
                r = subprocess.run([ffmpeg, "-hide_banner", "-v", "error"] + encoder_device_args(enc) +
                                   ["-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=1", "-c:v", enc[0]] +
                                   enc[1] + ["-pix_fmt", "yuv420p", "-f", "null", "-"],
                                   capture_output=True, timeout=25, creationflags=NO_WINDOW, stdin=subprocess.DEVNULL)
                if r.returncode == 0:
                    _ENC["v"] = enc
                    break
            except Exception:
                pass
    return _ENC["v"]


_RACE = {}


def _faster_encoder(ffmpeg: str, src: Path, duration: float, gpu):
    """Corrida de 4 s (do meio do PRÓPRIO vídeo) entre a placa e o processador; o vencedor fica guardado para os próximos.
    Em PCs com processador muito forte o libx264 ganha da placa no 4K; em PCs comuns a placa ganha."""
    if "v" in _RACE:
        return _RACE["v"]
    times = {}
    for enc in (gpu, CPU_ENCODER):
        t0 = time.time()
        try:
            r = subprocess.run([ffmpeg, "-hide_banner", "-v", "error"] + encoder_device_args(enc) + ["-ss", str(int(duration / 2)), "-t", "4", "-i", str(src),
                                "-an", "-c:v", enc[0]] + enc[1] + ["-pix_fmt", "yuv420p", "-f", "null", "-"],
                               capture_output=True, timeout=120, creationflags=NO_WINDOW, stdin=subprocess.DEVNULL)
            if r.returncode == 0:
                times[enc[0]] = time.time() - t0
        except Exception:
            pass
    win = gpu if times.get(gpu[0], 1e9) <= times.get(CPU_ENCODER[0], 1e9) else CPU_ENCODER
    _RACE["v"] = win
    return win


def _compat_one(job_id: str, p: Path, n: int, total: int, st: dict) -> Path:
    """Converte UM arquivo (chamado com COMPAT_LOCK). Devolve o arquivo final (o original, se não precisar ou não der)."""
    info = _probe_codecs(p)
    if not info:
        return p
    cv, ca = compat_plan(info[0], info[1])
    if not (cv or ca):
        return p
    tmp = p.with_name(p.stem + ".compat.mp4")
    encoders = [h264_encoder(st["path"])] if cv else [None]
    if cv and encoders[0] is not CPU_ENCODER:
        if info[2] > 60 and _faster_encoder(st["path"], p, info[2], encoders[0]) is CPU_ENCODER:
            encoders = [CPU_ENCODER]                       # neste PC o processador ganhou a corrida: usa ele
        else:
            encoders.append(CPU_ENCODER)                   # se a placa falhar no meio, refaz pelo processador
    for enc in encoders:
        cmd = [st["path"], "-y", "-v", "error"] + encoder_device_args(enc) + ["-nostats", "-progress", "pipe:1", "-i", str(p), "-map", "0:v:0", "-map", "0:a:0?"]
        cmd += (["-c:v", enc[0]] + enc[1] + ["-pix_fmt", "yuv420p"]) if enc else ["-c:v", "copy"]
        cmd += ["-c:a", "aac", "-b:a", "192k"] if ca else ["-c:a", "copy"]
        cmd += ["-movflags", "+faststart", str(tmp)]
        label = ("convertendo para H.264 (%s)" % enc[2]) if enc else "convertendo o áudio para AAC"
        if total > 1:
            label += " %d de %d" % (n, total)
        job_update(job_id, progress=label + "...")
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, text=True,
                                    creationflags=NO_WINDOW, start_new_session=not IS_WIN)
            with JOBS_LOCK:
                PROCS[job_id] = proc
            for line in proc.stdout:
                if _is_canceled(job_id):
                    kill_proc(proc)
                    break
                m = re.match(r"out_time_(?:us|ms)=(\d+)", line)
                if m and info[2] > 0:
                    pct = min(99, int(int(m.group(1)) / 1e6 / info[2] * 100))
                    job_update(job_id, progress="%s %d%%" % (label, pct))
            proc.wait(timeout=60)
            if proc.returncode == 0 and tmp.exists() and tmp.stat().st_size > 0 and not _is_canceled(job_id):
                final = p.with_suffix(".mp4")
                if final != p:
                    p.unlink()                              # o AV1/WebM que o próprio download criou: vira o MP4 compatível
                os.replace(str(tmp), str(final))
                return final
        except Exception:
            pass
        try:
            tmp.unlink()
        except Exception:
            pass
        if _is_canceled(job_id):
            break
    return p                                                # não deu para converter: fica o original (melhor que perder o vídeo)


# --------------------------------------------------------------------------- #
# "Enviar para o Premiere / After Effects": salva na pasta do PROJETO aberto (não na pasta padrão), já em H.264.
# Windows: o título da janela do programa traz o caminho do projeto ("Adobe Premiere - D:\...\x.prproj *"). Caminho comprido vem
# ABREVIADO ("D:\Jobs\Clie ... \AE\x.aep"): completa-se pelos arquivos recentes do Windows ou procurando o arquivo na pasta do início.
# Sem certeza = não baixa (nada de cair na pasta padrão em silêncio).
# --------------------------------------------------------------------------- #
ADOBE_APPS = {
    "premiere": {"ext": ".prproj", "exes": {"adobe premiere pro.exe"}, "name": "Premiere"},
    "aftereffects": {"ext": ".aep", "exes": {"afterfx.exe"}, "name": "After Effects"},
}
PROJECT_FOLDER = "_Noe VFX Downloader"
# pasta "do programa" dentro da pasta do trabalho: o projeto está organizado, então a pasta nova vai um nível acima
PROGRAM_DIRS = {"premiere", "premiere pro", "premierepro", "adobe premiere", "adobe premiere pro", "pr", "ppro", "prproj",
                "after effects", "aftereffects", "after", "adobe after effects", "ae", "aep"}
_TITLE_ELIDED = r"([A-Za-z]:\\.*?)\s\.\.\.\s(.*?{ext})(?:\s*\*)?\s*$"
_TITLE_WHOLE = r"([A-Za-z]:\\.*?{ext})(?:\s*\*)?\s*$"


def parse_project_title(title: str, ext: str):
    """(prefixo, sufixo) do caminho no título da janela; sufixo None = caminho inteiro; None = sem projeto salvo."""
    m = re.search(_TITLE_ELIDED.format(ext=re.escape(ext)), title or "", re.I)
    if m:
        return m.group(1), m.group(2)
    m = re.search(_TITLE_WHOLE.format(ext=re.escape(ext)), title or "", re.I)
    if m:
        return m.group(1), None
    return None


def project_dest(project_file) -> Path:
    """Pasta onde o vídeo entra: projeto dentro de uma pasta do programa (Premiere/AE...) -> sobe um nível; solto -> a própria pasta."""
    folder = Path(project_file).parent
    if folder.name.strip().lower() in PROGRAM_DIRS and folder.parent != folder:
        folder = folder.parent
    return folder / PROJECT_FOLDER


def _adobe_window_titles(exes: set) -> list:
    fake = os.environ.get("NOEVFX_ADOBE_TITLES_FILE")          # só para os testes automáticos (sem Premiere/AE de verdade)
    if fake:
        try:
            data = json.loads(Path(fake).read_text(encoding="utf-8"))
            return [t for e in exes for t in data.get(e, [])]
        except Exception:
            return []
    if not IS_WIN:
        return []
    import ctypes
    from ctypes import wintypes
    user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
    out = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _l):
        try:
            if not user32.IsWindowVisible(hwnd):
                return True
            n = user32.GetWindowTextLengthW(hwnd)
            if n <= 0:
                return True
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            h = kernel32.OpenProcess(0x1000, False, pid.value)          # PROCESS_QUERY_LIMITED_INFORMATION
            if not h:
                return True
            try:
                buf = ctypes.create_unicode_buffer(1024)
                size = wintypes.DWORD(1024)
                if kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)) and os.path.basename(buf.value).lower() in exes:
                    t = ctypes.create_unicode_buffer(n + 1)
                    user32.GetWindowTextW(hwnd, t, n + 1)
                    out.append(t.value)
            finally:
                kernel32.CloseHandle(h)
        except Exception:
            pass
        return True

    user32.EnumWindows(cb, 0)
    return out


# O Windows mostra alguns nomes de pasta traduzidos ("C:\Usuários\x\Área de Trabalho\..."), mas no disco eles são em inglês.
_LOCALIZED_DIRS = {"usuários": "Users", "usuarios": "Users", "área de trabalho": "Desktop", "area de trabalho": "Desktop",
                   "documentos": "Documents", "imagens": "Pictures", "vídeos": "Videos", "videos": "Videos", "músicas": "Music",
                   "musicas": "Music", "transferências": "Downloads", "escritorio": "Desktop", "escritório": "Desktop",
                   "benutzer": "Users", "bureau": "Desktop", "utilisateurs": "Users", "documents": "Documents"}


def _delocalize(path: str) -> str:
    parts = path.replace("/", "\\").split("\\")
    fixed = [_LOCALIZED_DIRS.get(p.lower(), p) for p in parts]
    cand = "\\".join(fixed)
    return cand if cand != path and os.path.isfile(cand) else ""


def _recent_project_paths(ext: str) -> list:
    """Caminhos completos guardados pelo Windows nos atalhos de arquivos recentes (mais novos primeiro)."""
    if not IS_WIN:
        return []
    rec = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Recent"
    try:
        lnks = sorted((p for p in rec.glob("*" + ext + ".lnk")), key=lambda p: -p.stat().st_mtime)[:60]
    except Exception:
        return []
    if not lnks:
        return []
    ps = "$s=New-Object -ComObject WScript.Shell; " + "; ".join(
        "$s.CreateShortcut('%s').TargetPath" % str(p).replace("'", "''") for p in lnks)
    try:
        txt = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps], capture_output=True, text=True,
                             timeout=20, creationflags=NO_WINDOW, stdin=subprocess.DEVNULL).stdout
        return [l.strip() for l in txt.splitlines() if l.strip()]
    except Exception:
        return []


def _search_project(prefix: str, suffix: str, budget: float = 4.0) -> list:
    root = prefix
    while root and not os.path.isdir(root):
        root = root.rsplit("\\", 1)[0] if "\\" in root else ""
    if not root:
        return []
    name = suffix.replace("/", "\\").rsplit("\\", 1)[-1].lower()
    t0, hits = time.time(), []
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x.lower() not in ("node_modules", ".git", "$recycle.bin", "system volume information")]
        for f in files:
            if f.lower() == name:
                full = os.path.join(d, f)
                if full.lower().startswith(prefix.lower()) and full.lower().endswith(suffix.lower()):
                    hits.append(full)
        if time.time() - t0 > budget:
            break
    return hits


# --------------------------------------------------------------------------- #
# Painel "Noe VFX for Editors" dentro do Premiere / After Effects (CEP).
# - chave própria: o painel lê panel_token.txt (criado aqui, só legível pelo usuário) e manda no cabeçalho X-NoeVFX-Panel;
#   nenhum site consegue isso (não lê arquivo local e não passa pelo teste de Host/CORS).
# - "hello": a cada poucos segundos o painel diz qual é o PROJETO ATIVO (no Premiere, o ativo no painel Project). Isso vale
#   mais que o título da janela.
# - importação: downloads com destino Premiere/AE ficam numa fila; o painel importa no bin _Noe VFX Downloader e confirma.
# --------------------------------------------------------------------------- #
PANEL_TOKEN_FILE = BASE / "panel_token.txt"
ADOBE_HELLO = {}                # app -> {"project", "state", "at", "version"}
HELLO_FRESH = 12.0              # segundos: depois disso o painel é considerado fechado
_TOKEN = {"v": ""}


def panel_token() -> str:
    if _TOKEN["v"]:
        return _TOKEN["v"]
    try:
        t = PANEL_TOKEN_FILE.read_text(encoding="utf-8").strip()
        if re.match(r"^[0-9a-f]{48}$", t):
            _TOKEN["v"] = t
            return t
    except Exception:
        pass
    import secrets
    t = secrets.token_hex(24)
    try:
        PANEL_TOKEN_FILE.write_text(t, encoding="utf-8")
        try:
            os.chmod(str(PANEL_TOKEN_FILE), 0o600)
        except Exception:
            pass
    except Exception:
        pass
    _TOKEN["v"] = t
    return t


def adobe_hello(app: str, project: str, state: str, version: str = ""):
    if app in ADOBE_APPS:
        ADOBE_HELLO[app] = {"project": str(project or "")[:1024], "state": str(state or "")[:20],
                            "version": str(version or "")[:40], "at": time.time()}


def _hello(app: str):
    h = ADOBE_HELLO.get(app)
    return h if h and time.time() - h["at"] < HELLO_FRESH else None


def _job_final_files(job: dict) -> list:
    """Arquivos de vídeo que o download deixou (o .webm convertido vira .mp4; pedaços f137/f140 já foram apagados)."""
    out = []
    for f in job.get("all_files") or []:
        p = Path(f)
        for c in (p, p.with_suffix(".mp4")):
            if c.is_file() and c.suffix.lower() in VIDEO_EXTS and not re.search(r"\.(temp|compat|part|ytdl)\.", c.name, re.I):
                s = str(c)
                if s not in out:
                    out.append(s)
                break
    return out


def pending_imports(app: str) -> list:
    now = time.time()
    with JOBS_LOCK:
        # "claim": a parte escondida e o painel aberto pedem a fila ao mesmo tempo; quem pegou primeiro importa (60 s)
        jobs = [j for j in JOBS.values() if j.get("import_app") == app and j.get("status") == "done"
                and not j.get("imported") and now - (j.get("finished") or now) < 3600 and now - j.get("import_claim", 0) > 60]
        for j in jobs:
            j["import_claim"] = now
        jobs = [dict(j) for j in jobs]
    out = []
    for j in jobs:
        files = _job_final_files(j)
        if files:
            out.append({"job_id": j["id"], "project": j.get("project", ""), "files": files, "title": j.get("title", "")})
        else:
            job_update(j["id"], imported=True, import_error="nenhum arquivo para importar")
    return out


def find_adobe_project(app: str) -> dict:
    """{status, message, project, dest}. status: ok | not_running | no_project | unsaved | not_found | ambiguous | unsupported."""
    info = ADOBE_APPS.get(app)
    if not info:
        return {"status": "unsupported", "message": "Programa desconhecido."}
    nm = info["name"]
    h = _hello(app)
    if h:
        if h["project"] and os.path.isfile(h["project"]):
            return {"status": "ok", "message": "", "project": h["project"], "dest": str(project_dest(h["project"])), "via": "painel"}
        if h["state"] == "unsaved":
            return {"status": "unsaved", "message": "Salve o projeto do %s dentro da pasta do trabalho e tente de novo." % nm}
        return {"status": "no_project", "message": "O %s está aberto, mas sem projeto. Abra o projeto do trabalho e tente de novo." % nm}
    if not IS_WIN and not os.environ.get("NOEVFX_ADOBE_TITLES_FILE"):
        return {"status": "unsupported", "message": "Enviar para o %s por enquanto só funciona no Windows." % nm}
    titles = _adobe_window_titles(info["exes"])
    if not titles:
        return {"status": "not_running", "message": "Abra o %s com o seu projeto e tente de novo." % nm}
    found, unsaved, cache = set(), False, {}
    for t in titles:
        p = parse_project_title(t, info["ext"])
        if not p:
            if info["ext"] in t.lower() or re.search(r"untitled|sem t[ií]tulo|sin t[ií]tulo", t, re.I):
                unsaved = True                         # "Untitled Project.aep": projeto novo, ainda sem pasta
            continue
        prefix, suffix = p
        if suffix is None:
            real = prefix if os.path.isfile(prefix) else _delocalize(prefix)
            if not real:
                # caminho do título não existe como está (ex.: nomes traduzidos): procura pelo nome nos arquivos recentes
                if "recent" not in cache:
                    cache["recent"] = _recent_project_paths(info["ext"])
                name = prefix.replace("/", "\\").rsplit("\\", 1)[-1].lower()
                same = [r for r in cache["recent"] if r.replace("/", "\\").rsplit("\\", 1)[-1].lower() == name and os.path.isfile(r)]
                real = same[0] if len(set(os.path.normcase(x) for x in same)) == 1 else ""
            if real:
                found.add(os.path.normcase(os.path.abspath(real)) + "|" + real)
            continue
        if "recent" not in cache:
            cache["recent"] = _recent_project_paths(info["ext"])
        hit = next((r for r in cache["recent"] if r.lower().startswith(prefix.lower()) and r.lower().endswith(suffix.lower())
                    and os.path.isfile(r)), "")
        hits = [hit] if hit else _search_project(prefix, suffix)
        if len(hits) == 1:
            found.add(os.path.normcase(os.path.abspath(hits[0])) + "|" + hits[0])
        elif len(hits) > 1:
            return {"status": "ambiguous", "message": "Achei mais de um projeto com esse nome e não sei qual está aberto no %s. Nada foi baixado." % nm}
    if len(found) == 1:
        project = next(iter(found)).split("|", 1)[1]
        return {"status": "ok", "message": "", "project": project, "dest": str(project_dest(project))}
    if len(found) > 1:
        return {"status": "ambiguous", "message": "Há mais de um projeto aberto no %s. Deixe só o projeto certo aberto e tente de novo." % nm}
    if unsaved:
        return {"status": "unsaved", "message": "Salve o projeto do %s dentro da pasta do trabalho e tente de novo." % nm}
    if any(parse_project_title(t, info["ext"]) for t in titles):
        return {"status": "not_found", "message": "Não consegui achar o arquivo do projeto aberto no %s. Nada foi baixado." % nm}
    return {"status": "no_project", "message": "O %s está aberto, mas sem projeto. Abra o projeto do trabalho e tente de novo." % nm}


PCT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*%")
SPEED_RE = re.compile(r"\bat\s+([\d.,]+\s*[KMG]?i?B/s)", re.I)
DEST_RE = re.compile(r"\[(?:download|ExtractAudio|VideoRemuxer|VideoConvertor)\]\s+Destination:\s+(.+)$", re.I)
MERGE_RE = re.compile(r'Merging formats into "(.+)"', re.I)
ALREADY_RE = re.compile(r"\[download\]\s+(.+?)\s+has already been downloaded", re.I)
PART_SUFFIXES = (".part", ".ytdl", ".temp", ".tmp")


def job_update(job_id: str, **kw):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if job:
            f = kw.get("file")
            if f:
                lst = job.setdefault("all_files", [])
                if f not in lst:
                    lst.append(f)
            job.update(kw)


def kill_proc(proc):
    """Mata o yt-dlp e os filhos dele (ffmpeg)."""
    try:
        if IS_WIN:
            result = subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                                    capture_output=True, creationflags=NO_WINDOW, timeout=15)
            if result.returncode != 0 and proc.poll() is None:
                proc.kill()
        else:
            os.killpg(proc.pid, signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


VIMEO_PAGE_RE = re.compile(
    r"^https?://(?:www\.)?vimeo\.com/(?:(?:channels|groups)/[^/]+/(?:videos/)?|album/\d+/video/|video/|showcase/\d+/video/)?(\d{6,})(?:/([0-9a-f]{8,}))?/?(?:[?#].*)?$", re.I)
RANGE_URL_RE = re.compile(r"/range/prot/|[?&](?:bytestart|byteend)=", re.I)
DRM_URL_RE = re.compile(r"/drm/(?:cenc|widevine|playready|fairplay)", re.I)
FRAGMENT_RE = re.compile(r"(?:/|[-_.])(?:segment|seg|frag|fragment|chunk|init)[-_\d]*\.(?:mp4|m4v|m4a|webm)(?:[?#]|$)", re.I)


def normalize_target(url: str, referer: str):
    """vimeo.com/ID exige login no yt-dlp; o player (player.vimeo.com/video/ID) com o Referer do site não."""
    m = VIMEO_PAGE_RE.match(url or "")
    if m:
        url = "https://player.vimeo.com/video/" + m.group(1) + ("?h=" + m.group(2) if m.group(2) else "")
        if not referer or "player.vimeo.com" in referer:
            referer = "https://vimeo.com/"
    elif re.match(r"^https?://player\.vimeo\.com/video/", url or "", re.I):
        if not referer or "player.vimeo.com" in referer:
            referer = "https://vimeo.com/"
    return url, referer


# post do Instagram OU tweet do X: podem ter VÁRIOS vídeos (e fotos no meio); baixa todos os vídeos e pula as fotos
IG_POST_URL_RE = re.compile(
    r"^https?://(?:(?:www\.)?instagram\.com/(?:[\w.]+/)?(?:p|reel|reels|tv)/[\w-]+|(?:www\.|mobile\.)?(?:x|twitter)\.com/\w+/status/\d+)", re.I)
VIDEO_EXTS = (".mp4", ".mkv", ".webm", ".mov", ".m4v", ".m4a", ".mp3", ".wav", ".flac", ".opus")


def _videos_since(folder: Path, since: float) -> list:
    """Arquivos de vídeo/áudio criados por ESTE download (carrossel do Instagram = vários vídeos)."""
    out = []
    try:
        for p in folder.iterdir():
            if p.is_file() and p.suffix.lower() in VIDEO_EXTS and p.stat().st_mtime >= since:
                out.append(p)
    except Exception:
        pass
    return sorted(out, key=lambda x: x.stat().st_mtime)


# ---- Pinterest: o yt-dlp falha em pin com CARROSSEL de vídeos ("No video formats found") e dá o nome genérico "Pinterest video #ID".
# A API pública do próprio Pinterest (a que o site usa) devolve todos os vídeos do pin e o título: baixamos cada vídeo direto.
PIN_RE = re.compile(r"^https?://(?:[\w-]+\.)?pinterest\.[a-z.]+/pin/(\d{6,})", re.I)


def _safe_name(t, n: int = 100) -> str:
    t = re.sub(r'[<>:"/\\|?*%\x00-\x1f]', " ", str(t or ""))
    return re.sub(r"\s+", " ", t).strip(" .")[:n]


PIN_MEDIA_RE = re.compile(r"/videos/.*?([0-9a-f]{32})", re.I)


def pin_pick(data: dict):
    """(título, [urls]) a partir da resposta da API: vídeo único, carrossel e story pin. MP4 se houver, senão o HLS."""
    lists = []

    def add(vid):
        vl = (vid or {}).get("video_list") if isinstance(vid, dict) else None
        if isinstance(vl, dict) and vl:
            lists.append(vl)

    add(data.get("videos"))
    for s in ((data.get("carousel_data") or {}).get("carousel_slots") or []):
        add((s or {}).get("videos"))
    for p in ((data.get("story_pin_data") or {}).get("pages") or []):
        for b in (p or {}).get("blocks") or []:
            add((b or {}).get("video"))

    urls = []
    for vl in lists:
        mp4 = [v for v in vl.values() if isinstance(v, dict) and str(v.get("url") or "").lower().split("?")[0].endswith(".mp4")]
        hls = [v for v in vl.values() if isinstance(v, dict) and str(v.get("url") or "").lower().split("?")[0].endswith(".m3u8")]
        best = max(mp4, key=lambda v: int(v.get("width") or 0)) if mp4 else (hls[0] if hls else None)
        if best and best["url"] not in urls:
            urls.append(best["url"])
    title = str(data.get("seo_title") or data.get("title") or data.get("grid_title") or "").split(" | ")[0]
    return _safe_name(title), urls


def pin_media(pin_id: str):
    """Pergunta à API do Pinterest. Qualquer falha devolve ("", []): o fluxo normal (yt-dlp pelo link do pin) continua valendo."""
    try:
        q = urlencode({"data": json.dumps({"options": {"field_set_key": "unauth_react_main_pin", "id": pin_id}})})
        req = UrlRequest(
            "https://www.pinterest.com/resource/PinResource/get/?" + q,
            headers={"Accept": "application/json", "X-Pinterest-PWS-Handler": "www/[username]/[slug].js",
                     "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"})
        with url_open(req, timeout=20) as r:
            data = (json.load(r).get("resource_response") or {}).get("data") or {}
        return pin_pick(data)
    except Exception:
        return "", []


MEDIA_FILE_RE = re.compile(r"\.(m3u8|mpd|mp4|m4v|webm|mov|mkv|flv|m4a|mp3)$", re.I)


def build_cmd(url: str, fmt: str, out_tmpl: str, referer: str, ua: str,
              cookies_file: str, extra: list, impersonate: bool, single: bool = True,
              use_ffmpeg: bool = True):
    yt = exe_path("yt-dlp")
    ff = ffmpeg_state()
    has_ffmpeg = bool(use_ffmpeg and ff["ok"])

    # (sem --no-warnings: os avisos do yt-dlp, como "ffmpeg not found", precisam chegar até aqui)
    cmd = [
        yt, "--ignore-config", "--newline", "--no-playlist",
        "--concurrent-fragments", "16",
        "--retries", "10",
        "--fragment-retries", "20",
        "--retry-sleep", "1",
        "--socket-timeout", "30",
        "--extractor-retries", "3",
        "--trim-filenames", "150",
        "--no-mtime",                      # data do arquivo = hora do download (com a data do vídeo, o app não achava o arquivo para converter/importar)
        "-f", fmt,
        "-o", out_tmpl,
    ]

    ig_post = bool(IG_POST_URL_RE.match(url or ""))
    if ig_post:
        # carrossel do Instagram: baixa TODOS os vídeos do post. As fotos do carrossel não têm vídeo ("No video formats
        # found"): o yt-dlp pula e segue para o próximo (--ignore-errors), então só os vídeos são salvos.
        if "--no-playlist" in cmd:
            cmd.remove("--no-playlist")
        cmd += ["--ignore-errors", "--no-write-thumbnail"]
    elif single:
        # um vídeo por pedido: evita baixar todos os <video> da página de uma vez
        cmd += ["--playlist-items", "1"]

    if has_ffmpeg:
        cmd += ["--merge-output-format", "mp4"]
        if ff["same_dir"]:
            cmd += ["--ffmpeg-location", ff["dir"]]     # diz ao yt-dlp ONDE está o ffmpeg/ffprobe

    if referer.startswith("http"):
        cmd += ["--referer", referer]
        try:
            pr = urlparse(referer)
            cmd += ["--add-header", "Origin:%s://%s" % (pr.scheme, pr.netloc)]
        except Exception:
            pass

    if ua:
        cmd += ["--user-agent", ua]

    if cookies_file:
        cmd += ["--cookies", cookies_file]

    if impersonate:
        cmd += ["--impersonate", "chrome"]

    if extra:
        cmd += list(extra)          # já validado por parse_extra_args()

    # URL que já é o ARQUIVO/PLAYLIST de mídia (.m3u8, .mpd, .mp4...): usa só o extrator genérico. Sem isto, extratores
    # de site "sequestram" o endereço (ex.: o de matérias da Globo assume qualquer *.globo.com, inclusive video.globo.com,
    # e quebra com 'NoneType' has no attribute 'strip' mesmo com o HLS respondendo 200).
    try:
        if MEDIA_FILE_RE.search(urlparse(url).path or ""):
            cmd += ["--use-extractors", "generic"]
    except Exception:
        pass

    cmd.append(url)
    return cmd, has_ffmpeg


FF_MISSING_RE = re.compile(
    r"ffmpeg is not installed|won't be merged|ffprobe and ffmpeg not found|ffmpeg not found|"
    r"ffmpeg or avconv not found|Postprocessing:.*(ffmpeg|ffprobe)", re.I)


def run_ytdlp(job_id: str, url: str, fmt: str, out_tmpl: str, referer: str,
              ua: str, cookies_file: str, extra: list, impersonate: bool, single: bool = True,
              use_ffmpeg: bool = True):
    cmd, _has_ffmpeg = build_cmd(url, fmt, out_tmpl, referer, ua, cookies_file, extra, impersonate, single, use_ffmpeg)
    if not cmd[0]:
        raise RuntimeError("yt-dlp não encontrado. Rode o instalador do NOÉ VFX.")

    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
        text=True, encoding="utf-8", errors="replace",
        creationflags=NO_WINDOW, bufsize=1, env=child_env(), cwd=str(BASE),
        start_new_session=not IS_WIN,
    )
    with JOBS_LOCK:
        PROCS[job_id] = proc
        canceled = job_id in CANCELED
    if canceled:
        kill_proc(proc)

    state = {"last": time.time(), "stalled": False}

    def watchdog():
        while proc.poll() is None:
            time.sleep(5)
            # unir vídeo+áudio de uma live de horas pode ficar muito tempo sem imprimir nada
            limit = MERGE_STALL_SECONDS if state.get("merging") else STALL_SECONDS
            if time.time() - state["last"] > limit:
                state["stalled"] = True
                kill_proc(proc)
                return

    threading.Thread(target=watchdog, daemon=True).start()

    tail = []
    last_pct = None
    try:
        for line in proc.stdout:
            state["last"] = time.time()
            line = line.rstrip()
            if not line:
                continue
            tail.append(line)
            if len(tail) > 12:
                tail.pop(0)
            if FF_MISSING_RE.search(line):
                state["ffmissing"] = True
                if "ffmissing_line" not in state:
                    state["ffmissing_line"] = line[:200]

            m = DEST_RE.search(line)
            if m:
                job_update(job_id, file=m.group(1).strip())

            m = MERGE_RE.search(line)
            if m:
                state["merging"] = True
                job_update(job_id, status="merging", progress="unindo", file=m.group(1).strip())
                continue
            if line.startswith("[Merger]") or line.startswith("[ExtractAudio]") or line.startswith("[VideoRemuxer]"):
                state["merging"] = True
                job_update(job_id, status="merging", progress="unindo")
                continue

            m = ALREADY_RE.search(line)
            if m:
                job_update(job_id, progress="já baixado", file=m.group(1).strip())
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
    finally:
        with JOBS_LOCK:
            PROCS.pop(job_id, None)
    if state["stalled"]:
        tail.append("ERROR: sem resposta por %d s (download cancelado)" % STALL_SECONDS)
        code = code or 1
    if state.get("ffmissing"):
        job_update(job_id, ffmpeg_problem=True)
    return code, tail, last_pct


def _newest_since(folder: Path, since: float):
    best, best_t = None, 0.0
    try:
        for p in folder.iterdir():
            if p.is_file() and not p.name.endswith(PART_SUFFIXES):
                t = p.stat().st_mtime
                if t >= since and t > best_t:
                    best, best_t = p, t
    except Exception:
        pass
    return best


UNMERGED_RE = re.compile(r"\]\.f[\w-]+\.[A-Za-z0-9]{2,5}$")     # "Titulo [id].f251.webm" = pedaço que não foi unido


def _unmerged_since(folder: Path, since: float) -> list:
    out = []
    try:
        for p in folder.iterdir():
            if p.is_file() and UNMERGED_RE.search(p.name) and p.stat().st_mtime >= since - 2:
                out.append(p)
    except Exception:
        pass
    return out


def _remove_unmerged(folder: Path, since: float):
    for p in _unmerged_since(folder, since):
        try:
            p.unlink()
        except Exception:
            pass


# erros comuns do yt-dlp em português claro (o texto original vai junto, entre parênteses)
FRIENDLY = (
    (r"live event will begin|Premieres in|will begin in", "A live/estreia ainda não começou."),
    (r"live event has ended|being processed|processing this video|still processing|is processing", "A live acabou, mas o site ainda está processando a gravação. Tente de novo mais tarde."),
    (r"Sign in to confirm you.re not a bot|confirm you.re not a bot", "O site pediu confirmação de que você não é um robô: entre na sua conta no navegador (com os cookies ligados nas Configurações) e tente de novo."),
    (r"Private video|members-only|Join this channel|This video is available to", "Vídeo privado ou só para membros: entre na sua conta no navegador e deixe os cookies ligados."),
    (r"HTTP Error 403|403: Forbidden", "O site negou o acesso (403). Entre na sua conta, atualize a página do vídeo e tente de novo."),
    (r"HTTP Error 404|404: Not Found", "O endereço do vídeo expirou (404). Atualize a página e tente de novo."),
    (r"Requested format is not available", "Esse formato não existe nesse vídeo. Tente 'Qualidade nativa'."),
    (r"DRM protected|DRM-protected|has DRM", "Esse vídeo tem proteção DRM (criptografia do próprio site). Não dá para baixar: nenhum programa consegue."),
    (r"No video could be found|no video in this tweet", "Esse tweet não tem vídeo (só foto ou texto)."),
    (r"NSFW tweet|requires authentication|Could not authenticate|[Ll]ogin required|log in to|Sign in to view|protected tweet", "Esse conteúdo exige login: entre na sua conta no navegador (com os cookies ligados nas Configurações) e tente de novo."),
    (r"\[facebook\].*(Cannot parse data|login|log in|private|not available)", "Não consegui ler esse vídeo do Facebook (privado, apagado ou exige login). Entre na sua conta no navegador (com os cookies ligados nas Configurações) e tente de novo."),
    (r"Unsupported URL", "Este endereço não é suportado direto. Dê play no vídeo e baixe pelo ícone sobre o player."),
    (r"ffprobe and ffmpeg not found|ffmpeg is not installed", "FFmpeg não encontrado. Rode o instalador do Noe VFX de novo."),
)


def friendly_error(err: str) -> str:
    for pat, msg in FRIENDLY:
        if re.search(pat, err, re.I):
            return "%s (%s)" % (msg, err[:160])
    return err


def _is_canceled(job_id: str) -> bool:
    with JOBS_LOCK:
        return job_id in CANCELED


def run_job(job_id: str, req: dict):
    if _is_canceled(job_id):
        job_update(job_id, status="canceled", progress="cancelado", finished=time.time())
        return

    cfg = load_cfg()
    quality = req.get("quality") or cfg.get("default_quality") or "best"
    url = req.get("url", "")
    fallback = req.get("fallback_stream") or ""
    referer = req.get("referer") or ""
    url, referer = normalize_target(url, referer)
    if fallback and (FRAGMENT_RE.search(urlparse(fallback).path or "") or DRM_URL_RE.search(fallback) or RANGE_URL_RE.search(fallback)):
        fallback = ""                  # pedaço de DASH/HLS ou manifesto com DRM não é o vídeo: nunca serve de plano B
    ua = req.get("userAgent") or ""
    try:
        extra = parse_extra_args(cfg.get("extra_args") or "")
    except ValueError:
        extra = []                      # config antiga com opção hoje proibida: ignora

    out_dir = Path(cfg.get("output_dir") or DEFAULT_CFG["output_dir"]).expanduser()
    project_dir = req.get("project_dir") or ""
    compat = bool(req.get("force_compat")) or (req["compat_override"] if isinstance(req.get("compat_override"), bool) else bool(cfg.get("compat_h264", False)))
    if project_dir:
        try:
            Path(project_dir).mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            job_update(job_id, status="error", finished=time.time(),
                       error="Não consegui criar a pasta %s na pasta do projeto (%s)." % (PROJECT_FOLDER, str(exc)[:120]))
            return
        out_dir = Path(project_dir)
    elif req.get("organizeBySite") or cfg.get("organize_by_site"):
        try:
            site = urlparse(url).netloc.replace(":", "_") or "outros"
            site = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", site)
            out_dir = out_dir / site
        except Exception:
            pass
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        out_dir = Path.home() / "Downloads"
        out_dir.mkdir(parents=True, exist_ok=True)

    started = time.time()
    job_update(job_id, status="downloading", output_dir=str(out_dir), progress="0%", started=started)

    cookies_file = ""
    try:
        cookie_txt = req.get("cookies") or ""
        if cookie_txt.strip() and cfg.get("use_cookies", True):
            fd, cookies_file = tempfile.mkstemp(prefix="nvf_ck_", suffix=".txt", dir=str(TMP))
            os.close(fd)
            try:
                os.chmod(cookies_file, 0o600)
            except Exception:
                pass
            Path(cookies_file).write_text(cookie_txt, encoding="utf-8")

        out_tmpl = str(out_dir / "%(title).100s [%(id)s].%(ext)s")
        pmm = PIN_MEDIA_RE.search(urlparse(url or "").path or "")
        if pmm and (urlparse(url or "").hostname or "").endswith("pinimg.com"):
            out_tmpl = str(out_dir / ((_safe_name(req.get("title")) or "Pinterest") + " [" + pmm.group(1)[:8] + "].%(ext)s"))
        imp = supports_impersonate()
        single = req.get("single", True) is not False
        use_ff = ffmpeg_state()["ok"]          # FFmpeg que realmente EXECUTA (não basta o arquivo existir)

        def attempt(u, rf, imp_flag, tmpl=None):
            """Uma tentativa. Se o yt-dlp reclamar do FFmpeg (vídeo/áudio separados, m4a com erro),
            limpa os pedaços e refaz sozinho em formato único: nunca entrega vídeo sem áudio."""
            nonlocal use_ff

            def once(ff_on):
                fm = (FORMAT_MAP if ff_on else FORMAT_NO_FFMPEG).get(quality, FORMAT_MAP["best"])
                ex = list(extra)
                if quality != "audio" and compat:
                    ex += ["-S", COMPAT_SORT]
                if quality == "audio":
                    if not ff_on:
                        raise RuntimeError("FFmpeg e ffprobe são necessários para entregar o formato de áudio escolhido. Rode o instalador novamente.")
                    if (req.get("audio_format") or "m4a") != "m4a":
                        fm = "bestaudio/best"
                    ex += ["-x", "--audio-format", req.get("audio_format") or "m4a", "--audio-quality", "0"]
                job_update(job_id, ffmpeg_problem=False)
                return run_ytdlp(job_id, u, fm, tmpl or out_tmpl, rf, ua, cookies_file, ex, imp_flag, single, ff_on)

            code_, tail_, pct_ = once(use_ff)
            with JOBS_LOCK:
                flagged = bool((JOBS.get(job_id) or {}).get("ffmpeg_problem"))
            if (flagged or _unmerged_since(out_dir, started)) and not _is_canceled(job_id):
                _remove_unmerged(out_dir, started)
                use_ff = False
                job_update(job_id, progress="FFmpeg indisponível: baixando em formato único...",
                           warning="ffmpeg")
                code_, tail_, pct_ = once(False)
            return code_, tail_, pct_

        pin_m = PIN_RE.match(url or "")
        if pin_m:
            pin_id = pin_m.group(1)
            pin_title, pin_urls = pin_media(pin_id)
            if pin_urls:
                # pin do Pinterest: baixa CADA vídeo do pin (carrossel) com o nome do pin; foto no carrossel não conta
                total = len(pin_urls)
                last_tail = []
                for i, mu in enumerate(pin_urls):
                    if _is_canceled(job_id):
                        break
                    stem = (pin_title or "Pinterest") + (" (%d de %d)" % (i + 1, total) if total > 1 else "") + " [%s]" % pin_id
                    job_update(job_id, progress=("vídeo %d de %d..." % (i + 1, total)) if total > 1 else "0%")
                    c_, last_tail, _p = attempt(mu, "https://www.pinterest.com/", imp, str(out_dir / (stem + ".%(ext)s")))
                    if c_ != 0 and imp and not _is_canceled(job_id):
                        c_, last_tail, _p = attempt(mu, "https://www.pinterest.com/", False, str(out_dir / (stem + ".%(ext)s")))
                if compat and quality != "audio":
                    compat_fix(job_id, out_dir, started - 2)
                got = _videos_since(out_dir, started - 2)
                if _is_canceled(job_id):
                    job_update(job_id, status="canceled", progress="cancelado", error="", finished=time.time())
                elif got:
                    job_update(job_id, status="done", progress="100%", file=str(got[-1]), files=len(got), error="", finished=time.time())
                else:
                    err = next((l[6:].strip() for l in reversed(last_tail) if l.startswith("ERROR:")), "") or "Falha ao baixar o vídeo do Pinterest."
                    job_update(job_id, status="error", error=friendly_error(err)[:400], finished=time.time())
                return

        code, tail, _pct = attempt(url, referer, imp)

        def ig_saved():
            """Carrossel do Instagram: as FOTOS falham de propósito; se já saiu vídeo, não há o que refazer."""
            return bool(IG_POST_URL_RE.match(url or "")) and bool(_videos_since(out_dir, started - 2))

        if code != 0 and imp and not _is_canceled(job_id) and not ig_saved():
            job_update(job_id, progress="tentando modo compatível...")
            code, tail, _pct = attempt(url, referer, False)

        if code != 0 and fallback and fallback != url and not _is_canceled(job_id) and not ig_saved():
            job_update(job_id, progress="usando stream capturado...")
            fb_ref = req.get("fallback_referer") or referer          # Referer do iframe que pediu esse stream
            code, tail, _pct = attempt(fallback, fb_ref, imp)
            if code != 0 and imp and not _is_canceled(job_id):
                code, tail, _pct = attempt(fallback, fb_ref, False)

        if compat and quality != "audio" and not _is_canceled(job_id):
            compat_fix(job_id, out_dir, started - 2)
        ig_videos = _videos_since(out_dir, started - 2) if (IG_POST_URL_RE.match(url or "") and code != 0) else []
        if _is_canceled(job_id):
            job_update(job_id, status="canceled", progress="cancelado", error="", finished=time.time())
        elif ig_videos:
            # carrossel: os itens que são FOTO falham de propósito; o que importa é que os vídeos foram salvos
            job_update(job_id, status="done", progress="100%", file=str(ig_videos[-1]), files=len(ig_videos),
                       error="", finished=time.time())
        elif code == 0:
            with JOBS_LOCK:
                recorded = (JOBS.get(job_id) or {}).get("file") or ""
            found = Path(recorded) if recorded and Path(recorded).exists() else _newest_since(out_dir, started - 2)
            if found:
                n_videos = len(_videos_since(out_dir, started - 2)) if IG_POST_URL_RE.match(url or "") else 1
                job_update(job_id, status="done", progress="100%", file=str(found), files=n_videos, finished=time.time())
            else:
                if any(re.search(r"Downloading 0 items|0 videos|no video formats found", l or "", re.I) for l in (tail or [])):
                    msg = ("O yt-dlp não achou nenhum vídeo baixável nesse endereço. Se for uma transmissão ao vivo ou um player da matéria, "
                           "dê play no vídeo, espere carregar e baixe pelo ícone sobre o player.")
                else:
                    msg = "O yt-dlp terminou, mas nenhum arquivo apareceu em %s" % out_dir
                job_update(job_id, status="error", finished=time.time(), error=msg)
        else:
            err = next((l[6:].strip() for l in reversed(tail) if l.startswith("ERROR:")), "")
            if not err:
                err = tail[-1] if tail else "Falha ao baixar (veja se o yt-dlp está atualizado)"
            job_update(job_id, status="error", error=friendly_error(err)[:400], finished=time.time())

    except Exception as exc:
        job_update(job_id, status="error", error=str(exc)[:400], finished=time.time())
    finally:
        if cookies_file:
            try:
                os.remove(cookies_file)
            except Exception:
                pass


def _prune_jobs_locked():
    now = time.time()
    for jid in [j for j, v in JOBS.items() if v.get("finished") and now - v["finished"] > JOB_TTL]:
        JOBS.pop(jid, None)
        CANCELED.discard(jid)
    if len(JOBS) > MAX_JOBS_KEPT:
        done = sorted((v for v in JOBS.values() if v["status"] not in ACTIVE
                       and not (v.get("import_app") and not v.get("imported"))), key=lambda v: v.get("created", 0))
        for v in done[: len(JOBS) - MAX_JOBS_KEPT]:
            JOBS.pop(v["id"], None)
            CANCELED.discard(v["id"])


def new_job(req: dict):
    """Devolve (job_id, duplicado). Levanta QueueFull se a fila estiver cheia."""
    quality = req.get("quality") or "best"
    with JOBS_LOCK:
        _prune_jobs_locked()
        active = [j for j in JOBS.values() if j["status"] in ACTIVE]
        for j in active:
            if (j.get("url") == req["url"] and j.get("quality") == quality
                    and j.get("audio_format", "m4a") == req.get("audio_format", "m4a")
                    and j.get("import_app", "") == req.get("import_app", "")
                    and j.get("requested_dir", "") == req.get("project_dir", "")):
                return j["id"], True
        if len(active) >= MAX_ACTIVE:
            raise QueueFull()
        job_id = uuid.uuid4().hex[:16]
        JOBS[job_id] = {
            "id": job_id,
            "status": "queued",
            "progress": "na fila",
            "url": req["url"],
            "quality": quality,
            "audio_format": req.get("audio_format") or "m4a",
            "requested_dir": req.get("project_dir", ""),
            "title": req.get("title", ""),
            "created": time.time(),
            "import_app": req.get("import_app", ""),
            "project": req.get("project", ""),
        }
    EXECUTOR.submit(run_job, job_id, req)
    return job_id, False


def cancel_job(job_id: str) -> bool:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job or job["status"] not in ACTIVE:
            return False
        CANCELED.add(job_id)
        proc = PROCS.get(job_id)
        queued = job["status"] == "queued"
    if queued:
        job_update(job_id, status="canceled", progress="cancelado", finished=time.time())
    if proc is not None:
        kill_proc(proc)
    return True


# --------------------------------------------------------------------------- #
# miniatura (ffmpeg)
# --------------------------------------------------------------------------- #
THUMB_SEM = threading.BoundedSemaphore(2)
_THUMB_LOCKS = {}
_THUMB_LOCKS_GUARD = threading.Lock()
_THUMB_FAIL = {}
THUMB_MAX_FILES = 400
THUMB_MAX_BYTES = 60 * 1024 * 1024
THUMB_FAIL_TTL = 180


def _prune_thumbs():
    try:
        files = sorted(THUMB_CACHE.glob("*.jpg"), key=lambda p: p.stat().st_mtime)
        total = sum(p.stat().st_size for p in files)
        while files and (len(files) > THUMB_MAX_FILES or total > THUMB_MAX_BYTES):
            p = files.pop(0)
            total -= p.stat().st_size
            p.unlink()
    except Exception:
        pass


def make_thumb(url: str, referer: str, ua: str) -> bytes:
    ff = exe_path("ffmpeg")
    url = clean_url(url, 2048)
    if not ff or not url:
        return b""
    referer = clean_header(referer, 2048)
    ua = clean_header(ua, 300)
    THUMB_CACHE.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1((url + "|" + referer).encode("utf-8", "ignore")).hexdigest()
    dest = THUMB_CACHE / (key + ".jpg")
    if dest.exists() and dest.stat().st_size > 600:
        return dest.read_bytes()
    if time.time() - _THUMB_FAIL.get(key, 0) < THUMB_FAIL_TTL:
        return b""

    with _THUMB_LOCKS_GUARD:
        lock = _THUMB_LOCKS.setdefault(key, threading.Lock())
    with lock:
        try:
            if dest.exists() and dest.stat().st_size > 600:
                return dest.read_bytes()
            with THUMB_SEM:
                cmd = [ff, "-hide_banner", "-loglevel", "error", "-y",
                       # só rede (nada de file:, concat:, etc.): impede ler arquivos locais por playlist HLS
                       "-protocol_whitelist", "http,https,tcp,tls,crypto,data"]
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
                    subprocess.run(cmd, timeout=25, creationflags=NO_WINDOW, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except Exception:
                    pass
            if dest.exists() and dest.stat().st_size > 600:
                _prune_thumbs()
                return dest.read_bytes()
            if len(_THUMB_FAIL) > 2000:
                _THUMB_FAIL.clear()
            _THUMB_FAIL[key] = time.time()
            try:
                dest.unlink()
            except Exception:
                pass
            return b""
        finally:
            with _THUMB_LOCKS_GUARD:
                if len(_THUMB_LOCKS) > 500:
                    _THUMB_LOCKS.clear()


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

# O caminho inicial e o arquivo de saída vão por variável de ambiente: nunca
# viram texto do comando (antes, aspas tipográficas no caminho quebravam o escape).
PICK_PS = (
    "Add-Type -AssemblyName System.Windows.Forms;"
    "$f = New-Object System.Windows.Forms.FolderBrowserDialog;"
    "$f.Description = 'NOE VFX - escolha a pasta para salvar os videos';"
    "$f.ShowNewFolderButton = $true;"
    "if ($env:NVF_INI) { $f.SelectedPath = $env:NVF_INI };"
    "if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {"
    " Set-Content -LiteralPath $env:NVF_OUT -Value $f.SelectedPath -Encoding UTF8 }"
)


def _pick_windows() -> str:
    """Seletor de pasta nativo do Windows (PowerShell) — não depende do tkinter."""
    fd, tmp = tempfile.mkstemp(prefix="nvf_pick_", suffix=".txt", dir=str(TMP))
    os.close(fd)
    try:
        env = dict(os.environ, NVF_INI=load_cfg().get("output_dir") or "", NVF_OUT=tmp)
        subprocess.run(
            ["powershell", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", PICK_PS],
            timeout=900, creationflags=NO_WINDOW, env=env, stdin=subprocess.DEVNULL,
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
    """Abre uma PASTA no gerenciador de arquivos. Nunca abre/executa arquivos."""
    raw = (path or "").strip() or load_cfg().get("output_dir") or DEFAULT_CFG["output_dir"]
    if len(raw) > 500 or _CTRL_RE.search(raw):
        return False
    p = Path(raw).expanduser()
    try:
        p.mkdir(parents=True, exist_ok=True)   # falha se já existir como arquivo
    except Exception:
        pass
    if not p.is_dir():
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
class TooLarge(Exception):
    pass


def inspect_collection(body):
    """Lê metadados, nunca baixa mídia. Manifestos HLS/DASH não são coleções."""
    url = clean_url(body.get("url"))
    if not url or MEDIA_FILE_RE.search(urlparse(url).path):
        raise ValueError("Cole o endereço da playlist na plataforma, não um manifesto ou arquivo de mídia.")
    if not INSPECT_SEM.acquire(blocking=False):
        raise RuntimeError("Já estou lendo duas listas. Aguarde e tente novamente.")
    cookie_path = ""
    try:
        yt = exe_path("yt-dlp")
        if not yt:
            raise RuntimeError("yt-dlp não encontrado. Rode o instalador novamente.")
        cmd = [yt, "--ignore-config", "--flat-playlist", "--dump-single-json", "--skip-download",
               "--yes-playlist", "--ignore-errors", "--playlist-end", str(COLLECTION_LIMIT + 1),
               "--socket-timeout", "12", "--retries", "1", "--extractor-retries", "1"]
        cookies = clean_cookies(body.get("cookies"))
        if cookies and load_cfg().get("use_cookies", True):
            fd, cookie_path = tempfile.mkstemp(prefix="nvf_list_", suffix=".txt")
            os.close(fd)
            os.chmod(cookie_path, 0o600)
            Path(cookie_path).write_text(cookies, encoding="utf-8")
            cmd += ["--cookies", cookie_path]
        referer = clean_url(body.get("referer"))
        if referer:
            cmd += ["--referer", referer]
        cmd.append(url)
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                                    timeout=80, creationflags=NO_WINDOW, env=child_env(), cwd=str(BASE))
        except subprocess.TimeoutExpired:
            raise RuntimeError("A playlist demorou a responder. Tente novamente ou cole links individuais.") from None
        if len(result.stdout) > 12 * 1024 * 1024:
            raise RuntimeError("Esta lista é grande demais para a leitura. Use uma lista menor.")
        try:
            data = json.loads(result.stdout)
        except (ValueError, TypeError):
            raise RuntimeError("Não consegui ler a playlist. Confira o link, o acesso pela sua conta e tente novamente.") from None
        return collection_entries(data, url)
    finally:
        if cookie_path:
            Path(cookie_path).unlink(missing_ok=True)
        INSPECT_SEM.release()


def collection_entries(data, source):
    raw = data.get("entries")
    if not isinstance(raw, list):
        raise ValueError("Esse endereço não retornou uma playlist. Use-o como vídeo individual.")
    items = []
    for index, entry in enumerate(raw[:COLLECTION_LIMIT]):
        entry = entry if isinstance(entry, dict) else {}
        url = clean_url(entry.get("webpage_url") or entry.get("url"))
        video_id = str(entry.get("id") or "")
        if not url and re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id) and "youtube" in str(data.get("extractor") or source).lower():
            url = "https://www.youtube.com/watch?v=" + video_id
        available = bool(url) and entry.get("availability") not in ("private", "needs_auth", "premium_only", "subscriber_only")
        title = str(entry.get("title") or "Item indisponível")[:300]
        if title in ("[Private video]", "[Deleted video]"):
            available = False
        items.append({"url": url, "title": title, "index": index + 1, "available": available,
                      "thumbnail": clean_url(entry.get("thumbnail") or next((t.get("url") for t in reversed(entry.get("thumbnails") or []) if isinstance(t, dict) and t.get("url")), "")),
                      "duration": entry.get("duration") if isinstance(entry.get("duration"), (int, float)) else None})
    return {"title": str(data.get("title") or "Playlist")[:300], "items": items,
            "truncated": len(raw) > COLLECTION_LIMIT, "limit": COLLECTION_LIMIT}


def prepare_download(body):
    url = clean_url(body.get("url"))
    if not url:
        raise ValueError("URL inválida")
    quality = body.get("quality") or load_cfg().get("default_quality") or "best"
    if not isinstance(quality, str) or quality not in FORMAT_MAP:
        raise ValueError("Qualidade inválida")
    audio_format = body.get("audio_format") or "m4a"  # clientes antigos continuam em M4A
    if not isinstance(audio_format, str) or audio_format not in AUDIO_FORMATS:
        raise ValueError("Formato de áudio inválido")
    target = body.get("target") or ""
    if not isinstance(target, str) or (target and target not in ADOBE_APPS):
        raise ValueError("Destino inválido")
    if target and quality == "audio" and audio_format not in ADOBE_AUDIO_FORMATS:
        raise ValueError("Para importar no Adobe, escolha MP3, M4A ou WAV. FLAC e Opus podem ser salvos em uma pasta.")
    req = {"url": url, "quality": quality, "audio_format": audio_format,
           "fallback_stream": clean_url(body.get("fallbackStream") or body.get("fallback_stream")),
           "referer": clean_url(body.get("referer"), 2048),
           "fallback_referer": clean_url(body.get("fallbackReferer") or body.get("fallback_referer"), 2048),
           "userAgent": clean_header(body.get("userAgent"), 300), "title": clean_header(body.get("title"), 300),
           "cookies": clean_cookies(body.get("cookies")), "organizeBySite": body.get("organizeBySite") is True,
           "single": body.get("single") is not False}
    if isinstance(body.get("compat"), bool):
        req["compat_override"] = body["compat"]
    if target:
        proj = find_adobe_project(target)
        if proj.get("status") != "ok":
            raise RuntimeError(proj.get("message") or "Abra e salve o projeto no editor.")
        req.update(project_dir=proj["dest"], force_compat=True, organizeBySite=False, import_app=target, project=proj["project"])
    else:
        od = body.get("outDir")
        if isinstance(od, str) and od.strip():
            path = Path(od.strip()).expanduser()
            if not path.is_absolute():
                raise ValueError("Pasta inválida")
            req.update(project_dir=str(path), organizeBySite=False)
        if body.get("compat") is True:
            req["force_compat"] = True
    return req


def batch_snapshot(batch_id):
    with BATCH_LOCK:
        batch = BATCHES.get(batch_id)
        if not batch:
            return None
        records = []
        with JOBS_LOCK:
            for item in batch["items"]:
                record = dict(item)
                job = JOBS.get(item.get("job_id"))
                if job:
                    record.update({key: job.get(key) for key in ("status", "progress", "error", "import_app", "imported", "import_error", "file")})
                    item.update(record)  # preserva o resultado quando o histórico de jobs for podado
                records.append(record)
        return {"id": batch_id, "items": records, "canceled": batch["canceled"], "finished": batch.get("finished", False)}


def create_batch(body):
    raw = body.get("items")
    if not isinstance(raw, list) or not 1 <= len(raw) <= COLLECTION_LIMIT:
        raise ValueError("Selecione entre 1 e %d itens." % COLLECTION_LIMIT)
    # Resolve projeto/destino uma vez: mudar de projeto durante a fila não desvia os próximos arquivos.
    base = prepare_download(dict(body, url=raw[0].get("url") if isinstance(raw[0], dict) else ""))
    if not base.get("project_dir"):
        cfg = load_cfg()
        base["project_dir"] = cfg.get("output_dir") or DEFAULT_CFG["output_dir"]
        base["batch_site_folder"] = bool(cfg.get("organize_by_site"))
    items, seen = [], set()
    for item in raw:
        if not isinstance(item, dict) or not clean_url(item.get("url")):
            raise ValueError("Há um endereço inválido na seleção.")
        url = clean_url(item["url"])
        if url not in seen:
            seen.add(url)
            items.append({"url": url, "title": clean_header(item.get("title"), 300), "status": "pending",
                          "fallbackStream": clean_url(item.get("fallbackStream")), "referer": clean_url(item.get("referer"))})
    batch_id = uuid.uuid4().hex[:16]
    with BATCH_LOCK:
        for key in list(BATCHES):
            if BATCHES[key].get("finished") and time.time() - BATCHES[key]["created"] > JOB_TTL:
                del BATCHES[key]
        if sum(not b.get("finished") for b in BATCHES.values()) >= 10:
            raise RuntimeError("Há muitas listas em andamento. Aguarde uma terminar.")
        BATCHES[batch_id] = {"items": items, "canceled": False, "created": time.time()}
    def dispatch():
        while True:
            with BATCH_LOCK:
                batch = BATCHES[batch_id]
                with JOBS_LOCK:
                    for item in items:
                        job = JOBS.get(item.get("job_id"))
                        if job:
                            item.update({key: job.get(key) for key in ("status", "progress", "error", "import_app", "imported", "import_error", "file")})
                    active = sum(JOBS.get(it.get("job_id"), {}).get("status") in ACTIVE for it in items)
                pending = next((it for it in items if it["status"] == "pending"), None)
                if batch["canceled"]:
                    for it in items:
                        if it["status"] == "pending":
                            it["status"] = "canceled"
                    pending = None
                if pending and active < 8:
                    req = dict(base, url=pending["url"], title=pending["title"], single=True,
                               fallback_stream=pending["fallbackStream"], referer=pending["referer"] or base.get("referer", ""))
                    if base.get("batch_site_folder"):
                        site = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", urlparse(req["url"]).netloc) or "outros"
                        req["project_dir"] = str(Path(base["project_dir"]) / site)
                    try:
                        jid, _ = new_job(req)
                        pending.update(job_id=jid, status="queued")
                    except QueueFull:
                        pass  # aguarda vaga sem descartar itens
                if not pending and not active:
                    batch["finished"] = True
                    return
            time.sleep(0.5)
    threading.Thread(target=dispatch, daemon=True, name="playlist-" + batch_id).start()
    return batch_id


class Handler(BaseHTTPRequestHandler):
    server_version = "NoeVFX/" + VERSION
    protocol_version = "HTTP/1.1"
    timeout = 60                      # conexão ociosa não segura thread para sempre

    # -- autenticação ------------------------------------------------------- #
    def _host_ok(self) -> bool:
        host = (self.headers.get("Host") or "").strip().lower()
        return host in ("127.0.0.1:%d" % PORT, "localhost:%d" % PORT)

    def _origin_id(self):
        origin = self.headers.get("Origin", "") or ""
        if origin.startswith("chrome-extension://"):
            return origin[len("chrome-extension://"):].strip("/")
        return None

    def _auth(self, path: str):
        """'ext' = extensão com ID conhecido (cabeçalho Origin) | 'read' = LEITURA (GET) com o cabeçalho próprio | None = negado.

        O Chrome só manda Origin nos POST: um GET feito pela extensão (config, status, miniatura) chega SEM Origin.
        Por isso a leitura aceita o cabeçalho X-NoeVFX-Client, que um site não consegue enviar (exige o
        preflight CORS, que só a extensão passa) e que o teste de Host já protege contra DNS rebinding.
        Escrever ou executar qualquer coisa (POST) continua exigindo o ID da extensão."""
        if not self._host_ok():            # barra DNS rebinding
            return None
        tok = self.headers.get("X-NoeVFX-Panel", "")
        if tok:
            return "ext" if hmac.compare_digest(tok.encode(), panel_token().encode()) else None
        if self.headers.get("Origin"):
            return "ext" if self._origin_id() in allowed_ext_ids() else None
        if self.command == "GET" and self.headers.get("X-NoeVFX-Client", "") == "1":
            return "read"
        return None

    def _cors(self):
        eid = self._origin_id()
        if eid and eid in allowed_ext_ids() and self._host_ok():
            self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin"))
            self.send_header("Vary", "Origin")

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
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
        self.send_header("X-Content-Type-Options", "nosniff")
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
        if length > MAX_BODY:
            raise TooLarge()
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def do_OPTIONS(self):
        path = urlparse(self.path).path
        if self._auth(path) != "ext":
            self.send_response(403)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-NoeVFX-Client")
        self.send_header("Access-Control-Max-Age", "600")
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        level = self._auth(parsed.path)
        if not level:
            self._json(403, {"error": "forbidden"})
            return
        qs = parse_qs(parsed.query)

        if parsed.path == "/batch":
            snapshot = batch_snapshot(qs.get("id", [""])[0])
            self._json(200 if snapshot else 404, snapshot or {"error": "Lista não encontrada nesta sessão do app."})
            return

        if parsed.path == "/health":
            yt = exe_path("yt-dlp")
            fst = ffmpeg_state()
            ff = fst["path"]
            with JOBS_LOCK:
                running = sum(1 for j in JOBS.values() if j["status"] in ACTIVE)
            self._json(200, {
                "ok": True,
                "brand": BRAND,
                "version": VERSION,
                "api_version": API_VERSION,
                "platform": platform.system() + " " + platform.release(),
                "python": py_version(),
                "yt_dlp": bool(yt),
                "yt_dlp_path": yt,
                "ffmpeg": bool(ff),
                "ffmpeg_path": ff,
                "ffmpeg_ok": fst["ok"],          # existe E executa
                "ffprobe_ok": fst["probe"],      # sem o ffprobe o "só áudio (m4a)" não converte
                "deno": bool(find_exe("deno")),
                "impersonate": bool(impersonate_cached()),
                "output_dir": load_cfg().get("output_dir", ""),
                "default_output_dir": str(default_output_dir()),
                "config_file": str(CONFIG_FILE),
                "jobs": running,
                "panel_setup": PANEL_SETUP["stage"],
            })
            return

        if parsed.path == "/config":
            self._json(200, load_cfg())
            return

        if parsed.path == "/adobe/imports":
            if level != "ext":
                self._json(403, {"error": "forbidden"})
                return
            self._json(200, {"imports": pending_imports((qs.get("app") or [""])[0])})
            return

        if parsed.path == "/adobe/project":
            self._json(200, find_adobe_project((qs.get("app") or [""])[0]))
            return

        if parsed.path == "/update/check":
            try:
                self._json(200, update_check(force=(qs.get("force") or [""])[0] == "1"))
            except Exception as exc:
                self._json(502, {"error": "não consegui consultar o GitHub (%s)" % str(exc)[:120]})
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
                items = [dict(j) for j in items]
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
        path = urlparse(self.path).path
        if self._auth(path) != "ext":
            self.close_connection = True  # corpo recusado não vira um segundo pedido na conexão
            self._json(403, {"error": "forbidden"})
            return

        try:
            body = self._body()
        except TooLarge:
            self.close_connection = True
            self._json(413, {"error": "corpo muito grande"})
            return

        if path == "/config":
            try:
                cfg = save_cfg(body)
            except (ValueError, RuntimeError) as exc:
                self._json(400, {"error": str(exc)})
                return
            self._json(200, cfg)
            return

        if path == "/adobe/hello":
            adobe_hello(str(body.get("app") or ""), str(body.get("project") or ""), str(body.get("state") or ""),
                        str(body.get("version") or ""))
            self._json(200, {"ok": True, "version": VERSION})
            return

        if path == "/adobe/imported":
            jid = str(body.get("job_id") or "")
            with JOBS_LOCK:
                ok = jid in JOBS
            if ok:
                job_update(jid, imported=True, import_error=str(body.get("error") or "")[:300])
            self._json(200 if ok else 404, {"ok": ok})
            return

        if path == "/update/apply":
            try:
                self._json(200, update_apply())
            except RuntimeError as exc:
                self._json(409, {"error": str(exc)})
            except Exception as exc:
                self._json(500, {"error": "falha ao atualizar: %s" % str(exc)[:160]})
            return

        if path == "/pick-folder":
            folder = pick_folder()
            self._json(200, {"ok": bool(folder), "path": folder, "canceled": not folder})
            return

        if path == "/open-folder":
            ok = open_folder(body.get("path", "") if isinstance(body.get("path", ""), str) else "")
            self._json(200 if ok else 500, {"ok": ok})
            return

        if path == "/inspect":
            try:
                self._json(200, inspect_collection(body))
            except ValueError as exc:
                self._json(400, {"error": str(exc)})
            except RuntimeError as exc:
                self._json(409, {"error": str(exc)})
            except Exception:
                self._json(500, {"error": "Não consegui ler esta lista. Confira o link e tente novamente."})
            return

        if path == "/batch":
            try:
                self._json(200, {"batch_id": create_batch(body)})
            except ValueError as exc:
                self._json(400, {"error": str(exc)})
            except RuntimeError as exc:
                self._json(409, {"error": str(exc)})
            return

        if path == "/batch/cancel":
            with BATCH_LOCK:
                batch = BATCHES.get(str(body.get("id") or ""))
                if batch:
                    batch["canceled"] = True
                    for item in batch["items"]:
                        if item.get("job_id"):
                            cancel_job(item["job_id"])
            self._json(200 if batch else 404, {"ok": bool(batch)})
            return

        if path == "/download":
            try:
                req = prepare_download(body)
            except ValueError as exc:
                self._json(400, {"error": str(exc)})
                return
            except RuntimeError as exc:
                self._json(409, {"error": str(exc)})
                return
            proj = {"dest": req["project_dir"], "project": req["project"]} if req.get("import_app") else None
            try:
                job_id, dup = new_job(req)
            except QueueFull:
                self._json(429, {"error": "fila cheia (%d downloads)" % MAX_ACTIVE})
                return
            self._json(200, {"job_id": job_id, "duplicate": dup,
                             "output_dir": proj["dest"] if proj else (req.get("project_dir") or load_cfg().get("output_dir", "")),
                             "project": proj["project"] if proj else ""})
            return

        if path == "/cancel":
            jid = body.get("id", "")
            ok = isinstance(jid, str) and cancel_job(jid)
            self._json(200 if ok else 404, {"ok": ok})
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
            data = json.loads(r.read().decode("utf-8", "replace"))
            return r.status == 200 and bool(data.get("ok")) and "NOÉ" in str(data.get("brand", ""))
    except Exception:
        return False


class QuietServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def handle_error(self, request, client_address):
        # o navegador aborta conexões o tempo todo; não poluir o log
        pass


YTDLP_STAMP = BASE / ".ytdlp_checked"


def maybe_update_ytdlp():
    """Os sites mudam toda semana e o yt-dlp acompanha: atualiza sozinho (no máx. 1x por dia),
    só o yt-dlp que o instalador pôs na pasta bin (o do sistema fica com o gerenciador dele)."""
    yt = exe_path("yt-dlp")
    if not yt or Path(yt).parent != BIN:
        return
    try:
        if YTDLP_STAMP.exists() and time.time() - YTDLP_STAMP.stat().st_mtime < 86400:
            return
    except Exception:
        pass
    with JOBS_LOCK:
        if any(j["status"] in ACTIVE for j in JOBS.values()):
            return                      # não troca o arquivo no meio de um download
    try:
        subprocess.run([yt, "--ignore-config", "-U"], capture_output=True, timeout=180, creationflags=NO_WINDOW,
                       stdin=subprocess.DEVNULL, cwd=str(BASE))
        YTDLP_STAMP.write_text(str(time.time()), encoding="utf-8")
    except Exception:
        pass


def _updater_loop():
    time.sleep(30)
    while True:
        maybe_update_ytdlp()
        time.sleep(6 * 3600)


# --------------------------------------------------------------------------- #
# atualização pelo GitHub (botão "Verificar atualizações")
# A extensão carregada em modo desenvolvedor não se atualiza sozinha. O servidor local, que já está instalado ao lado da pasta
# "extension", consulta a última release, baixa o zip, confere o SHA-256 e troca os arquivos; a extensão então se recarrega.
# --------------------------------------------------------------------------- #
UPDATE_REPO = "noevfx/noevfx-downloader"
# Endereço atual; aceita também URLs históricas do repositório antes da renomeação.
UPDATE_ASSET_RE = re.compile(r"^https://github\.com/noevfx/(?:Extensions|noevfx-downloader)/releases/download/v\d+\.\d+\.\d+/(?:NoeVFX-Downloader(?:-for-Editors)?|noevfx-downloader(?:-basic)?)-\d+\.\d+\.\d+\.zip$")
UPDATE_LOCK = threading.Lock()
_UPD_CACHE = {"at": 0.0, "data": None}
UPDATE_MAX_BYTES = 80 * 1024 * 1024
HTTPD = None


def _vtuple(v: str):
    return tuple(int(x) for x in (re.findall(r"\d+", str(v or ""))[:3] + ["0", "0", "0"])[:3])


def installed_edition() -> str:
    """"basic" ou "editors" (a extensão instalada diz qual pacote é; sem o arquivo = instalação antiga = editores)."""
    try:
        txt = (BASE.parent / "extension" / "edition.js").read_text(encoding="utf-8")
        return "basic" if '"basic"' in txt else "editors"
    except Exception:
        return "editors"


def installed_layout() -> bool:
    """Só atualiza a instalação de verdade (pasta instalada: server/ + extension/). Nunca a pasta de desenvolvimento (tem .git/tools)."""
    root = BASE.parent
    return (BASE.name == "server" and (root / "extension" / "manifest.json").exists()
            and not (root / ".git").exists() and not (root / "tools" / "build.py").exists())


def update_info(rel: dict) -> dict:
    """Resposta da API de releases do GitHub -> o que a extensão precisa saber (puro: testável sem rede)."""
    tag = str((rel or {}).get("tag_name") or "").lstrip("vV")
    out = {"current": VERSION, "latest": tag, "newer": False, "page": str((rel or {}).get("html_url") or ""),
           "can_apply": False, "reason": ""}
    if not re.match(r"^\d+\.\d+\.\d+$", tag):
        out["reason"] = "release sem versão válida"
        return out
    out["newer"] = _vtuple(tag) > _vtuple(VERSION)
    name = ("NoeVFX-Downloader-%s.zip" if installed_edition() == "basic" else "NoeVFX-Downloader-for-Editors-%s.zip") % tag
    asset = next((a for a in (rel.get("assets") or []) if a.get("name") == name), None)
    sha = ""
    if asset:
        sha = str(asset.get("digest") or "").lower().replace("sha256:", "")
        out["asset"] = str(asset.get("browser_download_url") or "")
    if not re.match(r"^[0-9a-f]{64}$", sha):
        notes = str(rel.get("body") or "")
        line = next((line for line in notes.splitlines() if name in line and re.search(r"\b[0-9a-fA-F]{64}\b", line)), "")
        # Dois pacotes têm hashes diferentes: a nota deve identificar o arquivo correspondente.
        if not line and len(rel.get("assets") or []) == 1:
            line = notes
        m = re.search(r"\b([0-9a-fA-F]{64})\b", line)
        sha = m.group(1).lower() if m else ""
    out["sha256"] = sha
    if not out["newer"]:
        return out
    if not asset or not UPDATE_ASSET_RE.match(out.get("asset", "")):
        out["reason"] = "a release não tem o pacote esperado"
    elif not sha:
        out["reason"] = "a release não informa o SHA-256 do pacote"
    elif not installed_layout():
        out["reason"] = "esta cópia não é a instalada (pasta de desenvolvimento): atualize pelo instalador"
    else:
        out["can_apply"] = True
    return out


def update_check(force: bool = False) -> dict:
    now = time.time()
    if not force and _UPD_CACHE["data"] and now - _UPD_CACHE["at"] < 600:
        return _UPD_CACHE["data"]
    req = UrlRequest("https://api.github.com/repos/%s/releases/latest" % UPDATE_REPO,
                     headers={"User-Agent": "NoeVFX-Downloader", "Accept": "application/vnd.github+json"})
    with url_open(req, timeout=15) as r:
        rel = json.load(r)
    data = update_info(rel)
    _UPD_CACHE.update(at=now, data=data)
    return data


def update_apply_package(zip_path: Path, latest: str, root: Path, plat: str) -> dict:
    """Troca os arquivos de <root>/extension e <root>/server/server.py pelos do pacote. Guarda cópia do que sai (nunca sobrescreve backup)."""
    import zipfile
    prefix = "noevfx-downloader/%s/" % plat
    with zipfile.ZipFile(zip_path) as z:
        names = [n for n in z.namelist() if n.startswith(prefix) and not n.endswith("/")]
        for n in z.namelist():
            if n.startswith("/") or ".." in n.split("/") or ":" in n:
                raise RuntimeError("pacote com caminho inválido")
        want = {n[len(prefix):]: n for n in names if n.startswith(prefix + "extension/") or n == prefix + "server/server.py"}
        if "extension/manifest.json" not in want or "server/server.py" not in want:
            raise RuntimeError("pacote sem a extensão ou o servidor")
        man = json.loads(z.read(want["extension/manifest.json"]).decode("utf-8"))
        if str(man.get("version")) != latest or ('VERSION = "%s"' % latest) not in z.read(want["server/server.py"]).decode("utf-8", "replace"):
            raise RuntimeError("a versão dentro do pacote não é a anunciada")
        old = _read_installed_version(root)
        bk = root / "_backups" / ("v%s" % old)
        n = 1
        while bk.exists():
            n += 1
            bk = root / "_backups" / ("v%s_%d" % (old, n))
        shutil.copytree(root / "extension", bk / "extension")
        shutil.copy2(root / "server" / "server.py", bk / "server.py")
        for rel_name, member in sorted(want.items()):
            dest = root / rel_name
            dest.parent.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_name(dest.name + ".novo")
            tmp.write_bytes(z.read(member))
            os.replace(str(tmp), str(dest))
        panel = {n[len(prefix + "adobe/"):]: n for n in names if n.startswith(prefix + "adobe/")}
        panel_ok = install_panel_files({k: z.read(v) for k, v in panel.items()}) if panel else None
    return {"backup": str(bk), "files": len(want), "panel": panel_ok}


def cep_panel_dir():
    """Pasta do painel do Premiere/After Effects (só Windows e macOS)."""
    if IS_WIN:
        return Path(os.environ.get("APPDATA", "")) / "Adobe" / "CEP" / "extensions" / "com.noevfx.downloader"
    if IS_MAC:
        return Path.home() / "Library" / "Application Support" / "Adobe" / "CEP" / "extensions" / "com.noevfx.downloader"
    return None


def install_panel_files(files: dict, base=None):
    """Troca o painel inteiro (arquivos novos numa pasta ao lado e depois a troca), para nunca ficar meio velho e meio novo."""
    dest = base or cep_panel_dir()
    if not dest or not files or "CSXS/manifest.xml" not in files:
        return False
    if any(r.startswith("/") or ".." in r.replace("\\", "/").split("/") or ":" in r for r in files):
        return False
    tmp = dest.with_name(dest.name + ".novo")
    try:
        if tmp.exists():
            shutil.rmtree(tmp)
        for rel, data in files.items():
            f = tmp / rel
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(data)
        if dest.exists():
            shutil.rmtree(dest)
        os.replace(str(tmp), str(dest))
        return True
    except Exception:
        return False



def panel_installed_version() -> str:
    d = cep_panel_dir()
    try:
        m = re.search(r'ExtensionBundleVersion="([\d.]+)"', (d / "CSXS" / "manifest.xml").read_text(encoding="utf-8"))
        return m.group(1) if m else ""
    except Exception:
        return ""


def enable_cep_panels():
    """Liga o "modo de painéis" da Adobe (PlayerDebugMode) deste usuário: é o que a Adobe indica para painéis de terceiros."""
    try:
        if IS_WIN:
            import winreg
            for v in range(9, 21):
                with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Adobe\CSXS.%d" % v) as k:
                    winreg.SetValueEx(k, "PlayerDebugMode", 0, winreg.REG_SZ, "1")
        elif IS_MAC:
            for v in range(9, 21):
                subprocess.run(["defaults", "write", "com.adobe.CSXS.%d" % v, "PlayerDebugMode", "1"], capture_output=True, timeout=10, check=True)
        return True
    except Exception:
        return False


PANEL_SETUP = {"stage": ""}

def ensure_panel():
    """Edição for Editors: se o painel do Premiere/AE não está instalado (ou é mais velho que este app), baixa o pacote DESTA versão
    da release do GitHub, confere o SHA-256 e instala só o painel. Assim quem atualizou pelo botão de uma 3.0.x (cujo atualizador não
    conhecia o painel) também recebe o painel, sem rodar o instalador."""
    if not (installed_layout() and installed_edition() == "editors" and cep_panel_dir()):
        return
    have = panel_installed_version()
    if have and _vtuple(have) >= _vtuple(VERSION):
        return
    PANEL_SETUP["stage"] = "checking"
    import zipfile
    zp = None
    try:
        req = UrlRequest("https://api.github.com/repos/%s/releases/tags/v%s" % (UPDATE_REPO, VERSION),
                         headers={"User-Agent": "NoeVFX-Downloader", "Accept": "application/vnd.github+json"})
        with url_open(req, timeout=20) as r:
            rel = json.load(r)
        name = "NoeVFX-Downloader-for-Editors-%s.zip" % VERSION
        asset = next((x for x in rel.get("assets") or [] if x.get("name") == name), None)
        url = str((asset or {}).get("browser_download_url") or "")
        sha = str((asset or {}).get("digest") or "").lower().replace("sha256:", "")
        if not UPDATE_ASSET_RE.match(url) or not re.match(r"^[0-9a-f]{64}$", sha):
            PANEL_SETUP["stage"] = "error"
            return
        PANEL_SETUP["stage"] = "downloading"
        fd, tmp = tempfile.mkstemp(prefix="nvf_painel_", suffix=".zip", dir=str(TMP))
        os.close(fd)
        zp = Path(tmp)
        h = hashlib.sha256()
        with url_open(UrlRequest(url, headers={"User-Agent": "NoeVFX-Downloader"}), timeout=60) as r, open(zp, "wb") as f:
            while True:
                chunk = r.read(1 << 16)
                if not chunk:
                    break
                h.update(chunk)
                f.write(chunk)
        PANEL_SETUP["stage"] = "verifying"
        if h.hexdigest() != sha:
            PANEL_SETUP["stage"] = "error"
            return
        PANEL_SETUP["stage"] = "installing"
        plat = "windows" if IS_WIN else "mac"
        prefix = "noevfx-downloader/%s/adobe/" % plat
        with zipfile.ZipFile(zp) as z:
            files = {n[len(prefix):]: z.read(n) for n in z.namelist() if n.startswith(prefix) and not n.endswith("/")}
        if install_panel_files(files):
            PANEL_SETUP["stage"] = "done" if enable_cep_panels() else "error"
        else:
            PANEL_SETUP["stage"] = "error"
    except Exception:
        PANEL_SETUP["stage"] = "error"
    finally:
        if zp:
            try:
                zp.unlink()
            except Exception:
                pass


def _read_installed_version(root: Path) -> str:
    try:
        return str(json.loads((root / "extension" / "manifest.json").read_text(encoding="utf-8")).get("version") or VERSION)
    except Exception:
        return VERSION


def update_apply() -> dict:
    """Baixa, confere e instala a última release. Levanta RuntimeError com mensagem para o usuário."""
    if not UPDATE_LOCK.acquire(blocking=False):
        raise RuntimeError("já há uma atualização em andamento")
    zip_path = None
    try:
        info = update_check(force=True)
        if not info["newer"]:
            raise RuntimeError("você já está na versão mais recente")
        if not info["can_apply"]:
            raise RuntimeError("não dá para atualizar sozinho: " + (info["reason"] or "motivo desconhecido"))
        with JOBS_LOCK:
            if any(j["status"] in ACTIVE for j in JOBS.values()):
                raise RuntimeError("há downloads em andamento: espere terminar e tente de novo")
        latest = info["latest"]
        fd, zp = tempfile.mkstemp(prefix="nvf_upd_", suffix=".zip", dir=str(TMP))
        os.close(fd)
        zip_path = Path(zp)
        h = hashlib.sha256()
        size = 0
        req = UrlRequest(info["asset"], headers={"User-Agent": "NoeVFX-Downloader"})
        with url_open(req, timeout=60) as r, open(zip_path, "wb") as f:
            while True:
                chunk = r.read(1 << 16)
                if not chunk:
                    break
                size += len(chunk)
                if size > UPDATE_MAX_BYTES:
                    raise RuntimeError("pacote grande demais")
                h.update(chunk)
                f.write(chunk)
        if h.hexdigest() != info["sha256"]:
            raise RuntimeError("o SHA-256 do pacote baixado não confere: nada foi alterado")
        plat = "windows" if IS_WIN else ("mac" if sys.platform == "darwin" else "linux")
        res = update_apply_package(zip_path, latest, BASE.parent, plat)
        _UPD_CACHE["data"] = None
        threading.Thread(target=_restart_self, daemon=True).start()
        return {"ok": True, "version": latest, "backup": res["backup"], "restarting": True}
    finally:
        if zip_path:
            try:
                zip_path.unlink()
            except Exception:
                pass
        UPDATE_LOCK.release()


def _restart_self():
    """Fecha a porta e sobe o servidor novo (mesmo Python, mesmo arquivo já trocado), desligado deste processo."""
    time.sleep(1.0)                                  # deixa a resposta do /update/apply chegar na extensão
    try:
        if HTTPD is not None:
            HTTPD.server_close()
    except Exception:
        pass
    try:
        kw = {"cwd": str(BASE), "stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
        if IS_WIN:
            kw["creationflags"] = 0x00000008 | 0x00000200 | NO_WINDOW        # DETACHED_PROCESS | NEW_PROCESS_GROUP | sem janela
        else:
            kw["start_new_session"] = True
        subprocess.Popen([sys.executable, str(BASE / "server.py")] + sys.argv[1:], **kw)
    finally:
        time.sleep(0.3)
        os._exit(0)


def main():
    global HTTPD
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
    HTTPD = httpd
    panel_token()                       # o painel do Premiere/AE lê esta chave do disco
    threading.Thread(target=ensure_panel, daemon=True).start()      # painel para quem atualizou de uma 3.0.x
    sweep_temp()
    threading.Thread(target=supports_impersonate, daemon=True).start()   # aquece em segundo plano
    threading.Thread(target=ffmpeg_state, daemon=True).start()
    threading.Thread(target=_updater_loop, daemon=True).start()
    print("[NOÉ VFX] Servidor %s (api %d) em http://%s:%d" % (VERSION, API_VERSION, HOST, PORT), flush=True)
    print("[NOÉ VFX] Pasta padrão: %s" % load_cfg().get("output_dir"), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
