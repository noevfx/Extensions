import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "extension"
VERSION = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))["version"]

OUT_DIST = ROOT / "dist" / ("noevfx-extension-%s.zip" % VERSION)
OUT_STORE = ROOT / "store" / "upload" / ("noevfx-extension-%s.zip" % VERSION)


def build(dest: Path):
    if dest.exists():
        dest.unlink()
    dest.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in sorted(EXT.rglob("*")):
            if not f.is_file():
                continue
            arc = f.relative_to(EXT).as_posix()
            zi = zipfile.ZipInfo(arc, date_time=(2026, 11, 12, 12, 0, 0))
            zi.create_system = 3
            zi.external_attr = 0o644 << 16
            zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, f.read_bytes())


def main():
    # limpa versões antigas da pasta de upload
    upload = ROOT / "store" / "upload"
    if upload.exists():
        for old in upload.glob("*.zip"):
            old.unlink()

    build(OUT_DIST)
    build(OUT_STORE)

    with zipfile.ZipFile(OUT_STORE) as z:
        names = z.namelist()
        assert "manifest.json" in names, "manifest precisa estar na raiz do zip"
        assert z.testzip() is None
        man = json.loads(z.read("manifest.json").decode("utf-8"))

    size = round(OUT_STORE.stat().st_size / 1024, 1)
    print("zip da loja:", OUT_STORE.relative_to(ROOT), "|", size, "KB |", len(names), "arquivos")
    print("manifest na raiz:", man["name"], man["version"])
    print("copia em dist:", OUT_DIST.relative_to(ROOT))


if __name__ == "__main__":
    main()
