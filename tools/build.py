"""Monta o pacote distribuível (windows/mac/linux) e gera dist/noevfx-downloader-<versão>.zip.

Uso:
    python tools/build.py
"""

import json
import os
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
WORK = ROOT / "build"
PKG_NAME = "noevfx-downloader"

SKIP = {"__pycache__", ".git", "bin"}


def crlf(data: bytes) -> bytes:
    return data.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")


def copy_tree(src: Path, dst: Path):
    for root, dirs, files in os.walk(src):
        dirs[:] = sorted(d for d in dirs if d not in SKIP)
        for f in sorted(files):
            if f.endswith((".pyc", ".log")) or f in ("config.json", "server.log"):
                continue
            full = Path(root) / f
            rel = full.relative_to(src)
            out = dst / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            data = full.read_bytes()
            if f.endswith(".bat"):
                data = crlf(data)
            elif f.endswith(".sh"):
                data = data.replace(b"\r\n", b"\n")
            out.write_bytes(data)


EDITIONS = {
    # pacote de editores: nome de zip de sempre (quem já usa recebe a atualização sem perder nada) + painel do Premiere/AE
    "editors": {"zip": "noevfx-downloader-%s.zip", "name": "Noe VFX Downloader for Editors", "panel": True},
    "basic": {"zip": "noevfx-downloader-basic-%s.zip", "name": "Noe VFX Downloader", "panel": False},
}
PANEL_DIR = ROOT / "adobe"                 # painel do Premiere/AE; o instalador liga o modo de painéis da Adobe (PlayerDebugMode)


def set_edition(ext_dir: Path, edition: str, name: str):
    (ext_dir / "edition.js").write_text(
        "// Edição do pacote (gerado pelo build).\nglobalThis.NVF_EDITION = %s;\n" % json.dumps(edition), encoding="utf-8")
    for msgs in ext_dir.glob("_locales/*/messages.json"):
        d = json.loads(msgs.read_text(encoding="utf-8"))
        d["extName"]["message"] = name
        msgs.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    man = ext_dir / "manifest.json"
    m = json.loads(man.read_text(encoding="utf-8"))
    m.setdefault("action", {})["default_title"] = name
    man.write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_edition(edition: str, version: str) -> Path:
    spec = EDITIONS[edition]
    pkg = WORK / edition / PKG_NAME
    pkg.mkdir(parents=True)
    (pkg / "VERSION.txt").write_text("%s %s\n" % (spec["name"], version), encoding="utf-8")
    for f in ("COMECE-AQUI.txt", "MANUAL.md", "README.md"):
        src = ROOT / f
        if src.exists():
            shutil.copy2(src, pkg / f)

    platforms = {
        "windows": ("installers/windows", ["INSTALAR_NOEVFX.bat", "instalar-noevfx.ps1", "DESINSTALAR_NOEVFX.bat"]),
        "mac": ("installers/mac", ["INSTALAR-MAC.command", "instalar-noevfx.sh", "desinstalar-noevfx.sh"]),
        "linux": ("installers/linux", ["instalar-noevfx.sh", "desinstalar-noevfx.sh"]),
    }
    for plat, (inst_dir, files) in platforms.items():
        dest = pkg / plat
        (dest / "extension").mkdir(parents=True)
        (dest / "server").mkdir(parents=True)
        copy_tree(ROOT / "browser", dest / "extension")
        set_edition(dest / "extension", edition, spec["name"])
        shutil.copy2(ROOT / "server" / "server.py", dest / "server" / "server.py")
        shutil.copy2(ROOT / "installers" / "common" / "guia-extensao.html", dest / "guia-extensao.html")
        if spec["panel"] and plat in ("windows", "mac"):            # Linux não tem Premiere/After Effects
            shutil.copytree(PANEL_DIR, dest / "adobe")
        for f in files:
            src = ROOT / inst_dir / f
            data = src.read_bytes()
            data = crlf(data) if f.endswith((".bat", ".ps1")) else data.replace(b"\r\n", b"\n")
            (dest / f).write_bytes(data)

    zip_path = DIST / (spec["zip"] % version)
    if zip_path.exists():
        zip_path.unlink()
    count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for root, dirs, files in os.walk(pkg):
            dirs[:] = sorted(dirs)
            for f in sorted(files):
                full = Path(root) / f
                arc = PKG_NAME + "/" + full.relative_to(pkg).as_posix()
                zi = zipfile.ZipInfo(arc, date_time=(2026, 11, 12, 12, 0, 0))
                zi.create_system = 3
                zi.external_attr = (0o755 if f.endswith((".sh", ".command")) else 0o644) << 16
                zi.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(zi, full.read_bytes())
                count += 1
    with zipfile.ZipFile(zip_path) as z:
        assert z.testzip() is None
    print("%-8s %s  (%d arquivos, %.1f KB)" % (edition, zip_path.name, count, zip_path.stat().st_size / 1024))
    return zip_path


def main():
    if WORK.exists():
        shutil.rmtree(WORK)
    DIST.mkdir(parents=True, exist_ok=True)
    # a versão vem do manifest da extensão (fonte única) e entra no NOME dos zips e num VERSION.txt dentro deles
    version = json.loads((ROOT / "browser" / "manifest.json").read_text(encoding="utf-8"))["version"]
    keep = {EDITIONS[e]["zip"] % version for e in EDITIONS}
    for old in DIST.glob("noevfx-downloader*.zip"):             # só os zips da versão atual ficam na dist
        if old.name not in keep:
            old.unlink()
    print("versao:", version)
    for e in EDITIONS:
        build_edition(e, version)


if __name__ == "__main__":
    main()
