# HANDOFF — Noe VFX Downloader

Para quem for continuar o projeto (pessoa ou agente). O resto da documentação: `README.md` (visão geral),
`docs/MANUAL-DE-USO.md` (manual com telas), `CHANGELOG.md` (histórico). Regras de versão e release:
`D:\.IA agents\global\RELEASES.md`.

## Estado (13/11/2026)

- **Versão atual: 3.0.20** (`extension\manifest.json` é a fonte da versão; `server\server.py` tem `VERSION` igual). Ainda não publicada no GitHub (a publicada é a `v3.0.19`; a `v3.0.13`, só do Pinterest, ficou local e entrou na 3.0.14).
- Pacote: `release\v3.0.20\noevfx-downloader-3.0.20.zip` (+ `SHA256.txt`). Esta versão cobre Instagram, TikTok, G1/Globo, Vimeo, X, Facebook e Pinterest (um item por vídeo, miniatura própria, download pela página do post). As versões `v3.0.6` a `v3.0.11` ficaram só locais (passos até chegar aqui); `v3.0.2` a `v3.0.4` têm falhas já corrigidas.
- **Testes de sites** (`tests/e2e_sites.js`, 61 checagens com sites simulados em HTTPS; `tests/real_site.js` e `tests/dl_url.js` para site real). Ainda não visto em conta logada: feed do Facebook (em ajuste). Pinterest real visto sem login (pin aberto e feed); X confirmado pelo Eduardo. Limites: lives (cancelar perde o parcial), vídeos com DRM, Mac/Linux sem máquina real.
- **GitHub:** as releases **`v3.0.5`, `v3.0.12`, `v3.0.14`, `v3.0.15`, `v3.0.16`, `v3.0.17` e `v3.0.19`** (Latest) estão publicadas (cada uma com o seu zip); o SHA-256 do asset está nas notas e em `release\v3.0.5\SHA256.txt`. A `v3.0.1` ficou com um aviso nas notas: tem um bug (leitura da extensão recusada com 403), **não distribuir**.
- **PC do Eduardo:** servidor e extensão **3.0.15** instalados em 13/11/2026 (desinstalado e reinstalado pelo Explorer, com o `config.json` dele restaurado). O Edge dele ainda carregava a extensão de `Desktop\windows\extension` (pasta extraída do zip, o erro mais comum): ele mesmo recarrega a pasta instalada. Espelho no Drive feito.
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

- **CI (próxima revisão, combinado com o Eduardo em 13/11/2026):** o job `extensão no navegador` (`tests/e2e.js`) falha no GitHub em Ubuntu e Windows com "sem service worker" (já falhava na v3.0.5); os jobs de macOS cancelam por falta de máquina do GitHub. Plano: trocar o `e2e.js` pelo `tests/e2e_sites.js` no `test.yml` e validar nos runners antes de dizer que ficou certo. Não afeta o uso da extensão.

- **Atualização pelo botão (3.0.14):** `server.py` tem `update_check`/`update_apply` (rotas `GET /update/check`, `POST /update/apply`, cache de 10 min; GitHub sem login limita 60 consultas/hora). Baixa só de `github.com/noevfx/Extensions/releases/download/vX.Y.Z/noevfx-downloader-X.Y.Z.zip`, confere o SHA-256 (campo `digest` do asset, ou o hash nas notas da release), valida que `extension/manifest.json` e `server.py` do pacote têm a versão anunciada, guarda cópia em `_backups\v<antiga>` da pasta instalada, troca `extension/` e `server/server.py` e reinicia o servidor (`_restart_self`). Recusa se houver download ativo ou se a pasta tiver `.git`/`tools\build.py` (desenvolvimento). **Toda release nova precisa ter o hash do zip no `digest` do asset ou nas notas**, senão `can_apply` fica falso. O popup (`popup.js`) e as Configurações (`options.js`) falam com o servidor pelas mensagens `UPDATE_CHECK`/`UPDATE_APPLY` do `background.js`. Teste real: instalação falsa 3.0.11 → release v3.0.12 (feito em 13/11/2026). Versões antes da 3.0.14 não têm o botão (atualizam pelo instalador).

- **Pinterest (3.0.15):** pin aberto = `pinInfo` (API do próprio site, mesma origem) dá título, miniatura e quantos vídeos; o servidor baixa cada vídeo pelo `pin_media` (MP4 de preferência, story pin só HLS). Feed: o cartão pode não ter link de pin (sem login); aí o vídeo se reconhece pelo hash de 32 hex do pôster, o `background.js` guarda o endereço do HLS/MP4 por hash (`PIN_MEDIA`, mensagem `PIN_STREAM`) e a playlist principal é `<hash>.m3u8` (as variantes `_360w`/`_audio` ficam na mesma pasta). Nome do arquivo: `Nome do pin [ID]` ou `Vídeo do Pinterest [8 primeiros do hash]`. **Vídeo do pin aberto (3.0.16):** `pinIsMain` no `content.js` — no Pinterest logado o vídeo principal pode estar dentro de `relatedPins` e sem `CloseupMainPin`, com pôster sem hash; vale como o pin da página o vídeo mais largo (>= 380 px) e maior da tela.
- **Pasta padrão (3.0.15):** `NoeVFX` dentro da pasta de Vídeos do usuário em todos os sistemas (`_videos_dir` no `server.py`: Windows pelo `SHGetKnownFolderPath`, macOS `~/Movies`, Linux `xdg-user-dir VIDEOS`). Config já salva não muda.
- **Armadilha de instalação:** o instalador copia a extensão para a pasta do sistema, mas o navegador só usa a pasta que foi carregada. Se ele carregou a pasta extraída do zip, o botão de atualizar troca arquivos que o navegador não lê. Sintoma: popup com versão diferente do servidor.
- **Vários perfis (3.0.17):** cada perfil do navegador tem a sua cópia da extensão; o app local é um só. Se um perfil atualiza pelo botão, os outros ficam com a extensão antiga em memória e o app já na versão nova (sem "nova versão" para mostrar). `popup.js`/`options.js` comparam a versão do app (`/health`, `/update/check`) com `chrome.runtime.getManifest().version` e mostram o botão "Recarregar extensão" (`chrome.runtime.reload()`, só por clique: recarregar automático entraria em laço se a extensão estiver carregada de outra pasta).
- **Modo H.264 / Premiere (3.0.19):** config `compat_h264` (padrão DESLIGADO desde a 3.0.19: o usuário liga quando o editor não abre o arquivo), checkbox no popup (`compatBox`), no painel do ícone (`data-compat`, via `SAVE_CONFIG` permitido ao content script em `sanitizePatch`) e nas Configurações. No servidor: `COMPAT_SORT = "res,vcodec:h264,acodec:aac"` entra como `-S` do yt-dlp (resolução primeiro, depois H.264/AAC: **nunca troca resolução por codec**) e `compat_fix` roda depois do download: `ffprobe` lê os codecs, `compat_plan` decide, e converte para H.264 (`libx264 crf 18`) se for AV1/VP9/VP8 e/ou para AAC se o áudio não for AAC/MP3/etc. (o arquivo AV1/WebM do próprio download é trocado pelo `.mp4`). Pula "Só áudio". Por que não baixar sempre em H.264: o YouTube só tem H.264 até 1080p; o 4K só existe em VP9/AV1, então a conversão depois é o único caminho.
- **Aba órfã (3.0.20):** depois de atualizar/recarregar a extensão, as abas abertas ficam com a cópia antiga do `content.js` (sem `chrome.runtime.id`). `staleNotice()` (chamada de `sendMsg` e dos timers) esconde o ícone e mostra o aviso uma vez (`staleTab`). Só funciona para cópias já na 3.0.20+; abas mais antigas precisam de F5. O teste (`e2e_sites.js`, último cenário) recarrega a extensão pelo service worker com a página aberta.
