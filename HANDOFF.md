# HANDOFF — Noe VFX Downloader

Para quem for continuar o projeto (pessoa ou agente). O resto da documentação: `README.md` (visão geral),
`docs/MANUAL-DE-USO.md` (manual com telas), `CHANGELOG.md` (histórico). Regras de versão e release:
`D:\.IA agents\global\RELEASES.md`.

## Estado (13/11/2026)

- **Versão atual: 3.0.12** (`extension\manifest.json` é a fonte da versão; `server\server.py` tem `VERSION` igual). Publicada no GitHub como `v3.0.12`.
- Pacote: `release\v3.0.12\noevfx-downloader-3.0.12.zip` (+ `SHA256.txt`). Esta versão cobre Instagram, TikTok, G1/Globo, Vimeo, X e Facebook (um item por vídeo, miniatura própria, download pela página do post). As versões `v3.0.6` a `v3.0.11` ficaram só locais (passos até chegar aqui); `v3.0.2` a `v3.0.4` têm falhas já corrigidas.
- **Testes de sites** (`tests/e2e_sites.js`, 40 checagens com sites simulados em HTTPS; `tests/real_site.js` e `tests/dl_url.js` para site real). Ainda não vistos em feed real logado: X e Facebook. Limites: lives (cancelar perde o parcial), vídeos com DRM, Mac/Linux sem máquina real.
- **GitHub:** as releases **`v3.0.5` e `v3.0.12`** estão publicadas com `noevfx-downloader-3.0.5.zip`; o SHA-256 do asset está nas notas e em `release\v3.0.5\SHA256.txt`. A `v3.0.1` ficou com um aviso nas notas: tem um bug (leitura da extensão recusada com 403), **não distribuir**.
- **PC do Eduardo:** instalação feita pelo próprio Eduardo (3.0.12 em teste em 13/11/2026; antes: 3.0.5) (backup em `_backups\instalacao-do-pc-2026-11-13-antes-3.0.5`). Espelho no Drive feito.
- Sem loja: projeto de **uso próprio e de amigos**. Todo o material de loja foi removido (v3.0.5).

## Como é feito

```text
extension/   MV3 sem build: background.js (service worker), content.js (ícone no vídeo), popup, options, i18n.js
server/      server.py: servidor local em Python puro (stdlib), 127.0.0.1:8765, chama yt-dlp e ffmpeg
installers/ windows (.bat + .ps1) · mac (.command + .sh) · linux (.sh) · common/guia-extensao.html
tests/       test_server.py (unidade) · e2e.js (navegador real via CDP) · install_smoke.py (instalação real)
tools/       build.py (gera dist/noevfx-downloader-<versão>.zip) · release.py · capturar-telas.js (telas do manual)
docs/        MANUAL-DE-USO.md + img/ (telas geradas pelo app real)
.github/     release.yml (tag v* publica o zip) · test.yml (CI: instalador em Win/Mac/Linux + e2e)
```

Comandos (na raiz do projeto):

```bash
python tools/build.py                       # gera dist/noevfx-downloader-<versão>.zip (versão = manifest.json)
python -m unittest discover -s tests        # 24 testes do servidor
node tests/e2e.js                           # navegador de verdade (Edge/Chrome headless); BROWSER=... para escolher
node tools/capturar-telas.js                # refaz as telas do manual em docs/img
```

## O que NÃO pode ser desfeito sem pensar

- **`key` no `manifest.json`**: fixa o ID da extensão (`hdmfifeopbmjcfjbjpkfjinejneohlji`). O servidor só
  aceita esse ID (constante `EXT_IDS_BUILTIN` em `server.py`; outros IDs entram por `allowed_extension_ids`
  no `config.json` ou `NOEVFX_EXT_IDS`). Trocar a chave = trocar o ID = a extensão para de funcionar.
- **Autenticação** (`Handler._auth`): escrever/executar (POST) exige `Origin` com o ID da extensão. A
  **leitura (GET)** aceita o cabeçalho `X-NoeVFX-Client` porque o Chrome **não manda `Origin` em GET** da
  extensão (foi o bug da 3.0.1). Sempre checa `Host` local (anti DNS rebinding).
- **`extra_args`**: só uma lista de opções seguras do yt-dlp (`ARG_OK` em `server.py`); nunca `--exec`, `-o` etc.
- **FFmpeg**: `ffmpeg_state()` testa se executa; o servidor passa `--ffmpeg-location` e o PATH ao yt-dlp e,
  se ainda falhar, refaz em formato único. Foi a causa do "vídeo sem áudio" da 3.0.
- Instaladores são testados pela CI; mexeu neles, rode `tests/install_smoke.py` num ambiente limpo.

## Onde fica cada coisa na máquina do usuário

| Sistema | Programa | Config / log |
|---|---|---|
| Windows | `%LOCALAPPDATA%\NoeVFXDownloader` | `server\config.json`, `server.log`, `install.log` |
| macOS / Linux | `~/.local/share/NoeVFXDownloader` | idem; log extra do serviço em `~/Library/Logs/NoeVFXDownloader.log` (Mac) |

## Pendências / atenção

1. Acompanhar a CI da 3.0.5 (`gh run list`; `gh run rerun <id> --failed` se o runner Apple Silicon não vier).
2. **macOS Apple Silicon** na CI: nas últimas rodadas o GitHub não entregou o runner ("capacity"); rodar
   de novo (`gh run rerun <id> --failed`). O resto da matriz (Windows, Linux x64/ARM, macOS Intel, serviços)
   passou.
3. Jobs `extensão no navegador` da CI falharam por falta de `--no-sandbox` no runner; já corrigido em
   `tests/e2e.js`, falta ver na próxima rodada.
4. **Nunca testado em máquina real:** macOS e Linux (só pela CI) e o **Hotmart real** (só simulado:
   iframe de outra origem exigindo o Referer do iframe).
5. Teste e2e tem 1 verificação intermitente (mídia sem extensão e fora do DOM): vira AVISO, não falha.
6. Considerar `yt-dlp` fixo/versão mínima se algum site quebrar (hoje ele se atualiza sozinho 1x/dia).
