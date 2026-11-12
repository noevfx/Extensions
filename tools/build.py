"""Monta o pacote distribuível (windows/mac/linux) e gera dist/noevfx-downloader.zip.

Uso:
    python tools/build.py
"""

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


def main():
    if WORK.exists():
        shutil.rmtree(WORK)
    DIST.mkdir(parents=True, exist_ok=True)

    pkg = WORK / PKG_NAME
    pkg.mkdir(parents=True)

    # docs comuns
    for f in ("COMECE-AQUI.txt", "MANUAL.md", "README.md"):
        src = ROOT / f
        if src.exists():
            shutil.copy2(src, pkg / f)

    platforms = {
        "windows": ("installers/windows", ["INSTALAR_NOEVFX.bat", "DESINSTALAR_NOEVFX.bat"]),
        "mac": ("installers/mac", ["instalar-noevfx.sh", "desinstalar-noevfx.sh"]),
        "linux": ("installers/linux", ["instalar-noevfx.sh", "desinstalar-noevfx.sh"]),
    }

    for plat, (inst_dir, files) in platforms.items():
        dest = pkg / plat
        (dest / "extension").mkdir(parents=True)
        (dest / "server").mkdir(parents=True)
        copy_tree(ROOT / "extension", dest / "extension")
        shutil.copy2(ROOT / "server" / "server.py", dest / "server" / "server.py")
        for f in files:
            src = ROOT / inst_dir / f
            data = src.read_bytes()
            data = crlf(data) if f.endswith(".bat") else data.replace(b"\r\n", b"\n")
            (dest / f).write_bytes(data)

    zip_path = DIST / "noevfx-downloader.zip"
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
                zi.external_attr = (0o755 if f.endswith(".sh") else 0o644) << 16
                zi.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(zi, full.read_bytes())
                count += 1

    with zipfile.ZipFile(zip_path) as z:
        assert z.testzip() is None

    print("pacote:", zip_path)
    print("arquivos:", count)
    print("tamanho:", round(zip_path.stat().st_size / 1024, 1), "KB")


if __name__ == "__main__":
    main()
