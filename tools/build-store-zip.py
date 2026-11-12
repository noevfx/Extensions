import json
import zipfile
from pathlib import Path

ROOT = Path(r"D:\Noe VFX\.Labs\Chrome Extensions\Extensions")
EXT = ROOT / "extension"
version = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))["version"]
out = ROOT / "dist" / ("noevfx-extension-%s.zip" % version)

if out.exists():
    out.unlink()

count = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for f in sorted(EXT.rglob("*")):
        if not f.is_file():
            continue
        arc = f.relative_to(EXT).as_posix()
        zi = zipfile.ZipInfo(arc, date_time=(2026, 11, 12, 12, 0, 0))
        zi.create_system = 3
        zi.external_attr = 0o644 << 16
        zi.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(zi, f.read_bytes())
        count += 1

with zipfile.ZipFile(out) as z:
    names = z.namelist()
    assert "manifest.json" in names, "manifest precisa estar na raiz"
    assert z.testzip() is None
    man = json.loads(z.read("manifest.json").decode("utf-8"))

print("zip:", out.name, "|", round(out.stat().st_size / 1024, 1), "KB |", count, "arquivos")
print("manifest na raiz:", man["name"], man["version"])
print("conteudo:", ", ".join(names))
