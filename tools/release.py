"""Publica uma release do Noe VFX Downloader.

Faz: build dos pacotes -> commit -> tag -> push -> GitHub Release com os zips.

Uso:
    python tools/release.py          # mostra o que vai fazer e pede confirmação
    python tools/release.py -y       # sem confirmação
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "browser" / "manifest.json"


def run(cmd, check=True):
    print("  >", " ".join(cmd))
    r = subprocess.run(cmd, cwd=str(ROOT), text=True, capture_output=True)
    out = (r.stdout or "").strip()
    err = (r.stderr or "").strip()
    if out:
        print("    " + out.replace("\n", "\n    "))
    if check and r.returncode != 0:
        if "nothing to commit" in out + err:
            print("    (nada novo para commitar)")
            return r
        print("    ERRO:", err or out)
        raise SystemExit(r.returncode)
    return r


def main():
    version = json.loads(MANIFEST.read_text(encoding="utf-8"))["version"]
    tag = "v" + version

    print("\nNoe VFX Downloader — release %s\n" % tag)
    exists = run(["git", "tag", "-l", tag], check=False).stdout.strip()
    if exists:
        print("A tag %s já existe. Suba a versão em extension/manifest.json primeiro." % tag)
        raise SystemExit(1)

    dirty = run(["git", "status", "--porcelain"], check=False).stdout.strip()
    if dirty:
        print("Alterações pendentes:")
        print("  " + dirty.replace("\n", "\n  "))

    if "-y" not in sys.argv:
        if input("\nContinuar? (s/n) ").strip().lower() != "s":
            print("Cancelado.")
            return

    print("\n[1/5] Gerando pacotes")
    run([sys.executable, "tools/build.py"])

    print("\n[2/5] Commit")
    run(["git", "add", "-A"])
    run(["git", "commit", "-m", "release %s" % tag], check=False)

    print("\n[3/5] Tag")
    run(["git", "tag", "-a", tag, "-m", "Noe VFX Downloader %s" % version])

    print("\n[4/5] Push")
    run(["git", "push"])
    run(["git", "push", "origin", tag])

    print("\n[5/5] GitHub Release")
    run([
        "gh", "release", "create", tag,
        str(ROOT / "dist" / ("noevfx-downloader-%s.zip" % version)),
        "--title", "Noe VFX Downloader %s" % version,
        "--generate-notes",
    ], check=False)

    print("\nPronto: https://github.com/noevfx/noevfx-downloader/releases/tag/%s" % tag)


if __name__ == "__main__":
    main()
