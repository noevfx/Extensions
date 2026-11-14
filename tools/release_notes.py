"""Gera notas, links e SHA-256 dos dois produtos; não publica nada."""
import hashlib
import json
import os
from pathlib import Path
from build import EDITIONS

ROOT = Path(__file__).resolve().parents[1]

def main():
    version = json.loads((ROOT / "browser/manifest.json").read_text(encoding="utf-8"))["version"]
    if os.environ.get("GITHUB_REF_TYPE") == "tag" and os.environ.get("GITHUB_REF_NAME") != "v" + version:
        raise SystemExit("A tag não corresponde à versão do manifest.")
    title = "Noe VFX Downloader %s — Vídeos, playlists e áudio" % version
    base = "https://github.com/noevfx/noevfx-downloader/releases/download/v%s/" % version
    rows, hashes = [], []
    for edition in ("basic", "editors"):
        spec = EDITIONS[edition]
        name = spec["zip"] % version
        file = ROOT / "dist" / name
        if not file.is_file():
            raise SystemExit("Gere o pacote antes: " + name)
        sha = hashlib.sha256(file.read_bytes()).hexdigest()
        hashes.append(sha + "  " + name)
        purpose = "Vídeos, playlists e áudio para sua pasta." if edition == "basic" else "O mesmo fluxo, com envio e importação no Premiere e After Effects."
        rows.append("| **%s** | %s | [Baixar ZIP](%s) |" % (spec["name"], purpose, base + name))
    checksum = ROOT / "dist" / ("SHA256-%s.txt" % version)
    checksum.write_text("\n".join(hashes) + "\n", encoding="utf-8")
    notes = """## Escolha seu Downloader

| Produto | Para quê | Download |
|---|---|---|
%s

Selecione uma playlist inteira ou só alguns itens. Escolha vídeo ou áudio, confira o formato e confirme. No for Editors, referências do navegador e links do roteiro podem seguir direto ao projeto Adobe aberto.

### Instalar ou migrar

1. Baixe o produto desejado e extraia o ZIP inteiro.
2. Abra o instalador da pasta do seu sistema. **Não precisa desinstalar para atualizar.**
3. Recarregue a extensão da pasta instalada. Em for Editors, reinicie Premiere/After Effects.

**Vem de uma versão anterior à 3.2.0?** A mudança dos nomes dos pacotes exige executar o instalador uma vez, por cima. Sua configuração e os vídeos baixados são preservados. Os atualizadores antigos não reconhecem os nomes novos. Depois de migrar, o botão Atualizar agora volta a servir para as próximas releases.

**[Conheça o produto](https://noevfx.github.io/noevfx-downloader/)** · **[Manual ilustrado](https://noevfx.github.io/noevfx-downloader/instalar.html)** · **[O que mudou](https://github.com/noevfx/noevfx-downloader/blob/main/CHANGELOG.md)**

<details>
<summary>Conferir integridade dos pacotes</summary>

```text
%s
```

</details>
""" % ("\n".join(rows), "\n".join(hashes))
    path = ROOT / "dist" / ("RELEASE-%s.md" % version)
    path.write_text(notes, encoding="utf-8")
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as stream:
            stream.write("version=%s\ntitle=%s\n" % (version, title))
    print(title)
    print("Notas: " + str(path))

if __name__ == "__main__":
    main()
