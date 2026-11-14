"""Monta o pacote distribuível (windows/mac/linux) e gera os ZIPs NoeVFX-Downloader e NoeVFX-Downloader-for-Editors em dist/.

Uso:
    python tools/build.py
"""

import json
import os
import shutil
import zipfile
import tempfile
import re
from datetime import datetime, timezone
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
    # IDs internos preservados para reconhecer instalações existentes; nomes públicos identificam os dois produtos.
    "editors": {"zip": "NoeVFX-Downloader-for-Editors-%s.zip", "name": "Noe VFX Downloader for Editors", "panel": True},
    "basic": {"zip": "NoeVFX-Downloader-%s.zip", "name": "Noe VFX Downloader", "panel": False},
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
    for page in ext_dir.glob("*.html"):
        text = page.read_text(encoding="utf-8")
        text = re.sub(r"Noe VFX Downloader(?! for Editors)", lambda match: name, text)
        text = re.sub(r'(id="(?:ver|aboutVer)"[^>]*>)v\d+\.\d+\.\d+', lambda match: match.group(1) + "v" + m["version"], text)
        page.write_text(text, encoding="utf-8")


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
        guide = (ROOT / "installers" / "common" / "guia-extensao.html").read_text(encoding="utf-8")
        (dest / "guia-extensao.html").write_text(guide.replace("Noe VFX Downloader", spec["name"]), encoding="utf-8")
        if spec["panel"] and plat in ("windows", "mac"):            # Linux não tem Premiere/After Effects
            shutil.copytree(PANEL_DIR, dest / "adobe")
            # Uma fonte da interface para browser e CEP; sem versões divergentes do seletor.
            for name in ("collection.js", "collection.css"):
                shutil.copy2(ROOT / "browser" / name, dest / "adobe" / name)
            index = dest / "adobe" / "index.html"
            index.write_text(index.read_text(encoding="utf-8").replace("../browser/collection.", "collection."), encoding="utf-8")
        for f in files:
            src = ROOT / inst_dir / f
            data = src.read_bytes()
            text = data.decode("utf-8")
            text = re.sub(r"(Noe VFX Downloader\s+v?)\d+\.\d+\.\d+", lambda match: match.group(1) + version, text)
            data = text.replace("Noe VFX Downloader", spec["name"]).encode("utf-8")
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
    print("%s: %s  (%d arquivos, %.1f KB)" % (spec["name"], zip_path.name, count, zip_path.stat().st_size / 1024))
    return zip_path


def main():
    global WORK
    # a versão vem do manifest da extensão (fonte única) e entra no NOME dos zips e num VERSION.txt dentro deles
    version = json.loads((ROOT / "browser" / "manifest.json").read_text(encoding="utf-8"))["version"]
    WORK = WORK / version / datetime.now(timezone.utc).strftime("compilacao-%Y%m%dT%H%M%S%fZ")
    WORK.mkdir(parents=True)
    DIST.mkdir(parents=True, exist_ok=True)
    archive_old_packages(version)
    print("versao:", version)
    for e in EDITIONS:
        build_edition(e, version)


def archive_old_packages(version):
    """dist contém só a versão atual; pacotes anteriores vão para arquivo, sem exclusão."""
    patterns = (
        r"(?:NoeVFX-Downloader(?:-for-Editors)?|noevfx-downloader(?:-basic)?)-(\d+\.\d+\.\d+)\.zip",
        r"(?:SHA256-|RELEASE-)(\d+\.\d+\.\d+)\.(?:txt|md)",
    )
    for source in list(DIST.iterdir()):
        if not source.is_file():
            continue
        match = next((m for p in patterns if (m := re.fullmatch(p, source.name, re.I))), None)
        if not match or match.group(1) == version:
            continue
        dest_dir = ROOT / "_Arquivo" / "pacotes-anteriores" / match.group(1)
        if not source.resolve().is_relative_to(DIST.resolve()) or not dest_dir.resolve().is_relative_to(ROOT.resolve()):
            raise RuntimeError("Destino de arquivo fora do projeto")
        dest_dir.mkdir(parents=True, exist_ok=True)
        destination = dest_dir / source.name
        if destination.exists():
            destination = dest_dir / (source.stem + "-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + source.suffix)
        shutil.move(str(source), str(destination))
        print("Arquivado:", source.name)


if __name__ == "__main__":
    main()
