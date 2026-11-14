# HANDOFF — Noe VFX Downloader

Para quem for continuar o projeto (pessoa ou agente). O resto da documentação: `README.md` (visão geral),
`docs/MANUAL-DE-USO.md` (manual com telas), `CHANGELOG.md` (histórico). Regras de versão e release:
`D:\.IA agents\global\RELEASES.md`.

## Estado atual — 3.2.0 local, aguardando aprovação

**Decisão mais recente do Eduardo:** nomes públicos definitivos **Noe VFX Downloader** e **Noe VFX Downloader for Editors**, sem Basic/Comum. Arquivos `NoeVFX-Downloader-<versão>.zip` e `NoeVFX-Downloader-for-Editors-<versão>.zip`. Atualizador, instaladores, empacotador, notas, CI, testes e documentação acompanham. Isso SUPERA os ensaios anteriores de atualização automática: versões anteriores à 3.2.0 precisam rodar o instalador por cima uma vez; próximas versões usam o botão. IDs internos de edição, pasta instalada e bundle Adobe são preservados para reconhecer as instalações existentes. Não publicar aliases ambíguos com os nomes antigos.

- Implementação e documentação da 3.2.0 prontas para teste local. Nenhum commit, push, tag ou release nesta rodada. A última release pública conferida é v3.1.0.
- Pacotes na raiz de `dist/`: `NoeVFX-Downloader-3.2.0.zip` e `NoeVFX-Downloader-for-Editors-3.2.0.zip`; hashes em `SHA256-3.2.0.txt`. A instalação real do usuário não foi alterada.
- Relatório da validação em `docs/VALIDACAO-3.2.0.md`. Importação física em Premiere/After Effects e testes físicos em macOS/Linux ainda dependem de validação. Não confundir demonstrações do manual com importações reais.
- Fontes compartilhadas: `browser/collection.js` e `.css`. `tools/build.py` copia para `adobe/` e ajusta os caminhos do HTML no pacote. `tools/manual_demos.py` atualiza demonstrações isoladas a partir das interfaces. Não editar as cópias geradas da coleção em docs/site/assets.
- Antes de publicar: aprovação do Eduardo e autorização explícita para git/release. Depois da aprovação e do fechamento de app/docs/git, iniciar o carrossel PSD pedido (referência ao final deste arquivo).

## Histórico do estado em 13/11/2026

- **Versão atual: 3.1.1** (`browser\manifest.json` é a fonte da versão; `server\server.py` tem `VERSION` igual). Ainda não publicada no GitHub (a publicada é a `v3.1.0`; a `v3.0.13`, só do Pinterest, ficou local e entrou na 3.0.14).
- Pacote: `release\v3.0.21\noevfx-downloader-3.0.21.zip` (+ `SHA256.txt`). Esta versão cobre Instagram, TikTok, G1/Globo, Vimeo, X, Facebook e Pinterest (um item por vídeo, miniatura própria, download pela página do post). As versões `v3.0.6` a `v3.0.11` ficaram só locais (passos até chegar aqui); `v3.0.2` a `v3.0.4` têm falhas já corrigidas.
- **Testes de sites** (`tests/e2e_sites.js`, 74 checagens com sites simulados em HTTPS; `tests/real_site.js` e `tests/dl_url.js` para site real). Ainda não visto em conta logada: feed do Facebook (em ajuste). Pinterest real visto sem login (pin aberto e feed); X confirmado pelo Eduardo. Limites: lives (cancelar perde o parcial), vídeos com DRM, Mac/Linux sem máquina real.
- **GitHub:** as releases **`v3.0.5`, `v3.0.12`, `v3.0.14`, `v3.0.15`, `v3.0.16`, `v3.0.17`, `v3.0.19` e `v3.0.20`** (Latest) estão publicadas (cada uma com o seu zip); o SHA-256 do asset está nas notas e em `release\v3.0.5\SHA256.txt`. A `v3.0.1` ficou com um aviso nas notas: tem um bug (leitura da extensão recusada com 403), **não distribuir**.
- **PC do Eduardo:** servidor e extensão **3.0.15** instalados em 13/11/2026 (desinstalado e reinstalado pelo Explorer, com o `config.json` dele restaurado). O Edge dele ainda carregava a extensão de `Desktop\windows\extension` (pasta extraída do zip, o erro mais comum): ele mesmo recarrega a pasta instalada. Espelho no Drive feito.
- Sem loja: projeto de **uso próprio e de amigos**. Todo o material de loja foi removido (v3.0.5).

## Como é feito

```text
browser/     extensão do navegador, MV3 sem build (no pacote/instalação a pasta continua extension/ - o navegador do usuário aponta para ela): background.js (service worker), content.js (ícone no vídeo), popup, options, i18n.js
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
- **Enviar p/ Premiere/AE (3.0.21):** `find_adobe_project` no `server.py` (só Windows): títulos das janelas de `Adobe Premiere Pro.exe`/`AfterFX.exe` (ctypes `EnumWindows`), `parse_project_title` (caminho inteiro ou abreviado com " ... "), arquivos recentes do Windows (`%APPDATA%\Microsoft\Windows\Recent\*.aep.lnk`) e busca limitada (4 s) na pasta do começo do caminho. `project_dest`: pasta do programa (`PROGRAM_DIRS`) sobe um nível; solto fica. `/download` com `target` resolve na hora e recusa com 409 e mensagem clara (sem job) se não houver projeto certo; com projeto, `project_dir` + `force_compat`. Rota de consulta `GET /adobe/project?app=`. Nos testes, `NOEVFX_ADOBE_TITLES_FILE` troca as janelas por um JSON (nada de Premiere de verdade). Bin/importar no projeto foi descartado: exigiria extensão CEP/UXP dentro do Premiere/AE, e a maioria dos usuários não tem nada disso.
- **Reorganização (13/11/2026):** o projeto saiu de `.Labs\Chrome Extensions\Noe VFX Downloader` para `.Labs\Noe VFX Downloader` (o produto agora inclui o painel do Premiere/AE) e a fonte da extensão foi de `extension/` para `browser/`. O pacote e a instalação continuam com `extension/` (o navegador de cada usuário aponta para essa pasta; o `update_apply_package` também espera `extension/`). **Repositório:** continua `noevfx/Extensions`. Renomear quebraria o botão de atualizar das versões 3.0.14-3.0.21 (só aceitam assets de `noevfx/Extensions`); a 3.1.0 aceita os dois nomes, então dá para renomear depois que todos estiverem nela.
- **3.1.0 - edições:** `tools/build.py` gera os dois zips; `browser/edition.js` (fonte = editors) é reescrito no pacote comum, e o nome do
  app vem de `_locales/*/messages.json` (`extName`). `popup.js`, `content.js` e `batch.js` escondem envio/H.264/painel quando `NVF_EDITION === "basic"`.
  O servidor é o mesmo; `installed_edition()` lê o `edition.js` instalado para o botão de atualizar baixar o pacote da edição certa.
- **3.1.0 - painel CEP (`adobe/`):** bundle `com.noevfx.downloader` com duas partes (`.panel` visível e `.bg` escondida, `StartOn applicationActivate`),
  Node ligado (`--enable-nodejs --mixed-context`). `js/core.js` lê `panel_token.txt` do app instalado e fala com `127.0.0.1:8765` pelo módulo
  `http` do Node (sem CORS). A cada 3 s: `POST /adobe/hello` (projeto ativo via `nvfProject()`) e `GET /adobe/imports` -> `nvfImport()` (cria o
  bin e importa; Premiere procura o projeto por caminho em `app.projects`) -> `POST /adobe/imported`. A fila usa "claim" de 60 s para o painel
  e a parte escondida não importarem o mesmo download. `find_adobe_project` usa o hello (até 12 s) antes do título da janela.
- **3.1.0 - instalação do painel:** Windows `%APPDATA%\Adobe\CEP\extensions\com.noevfx.downloader`, macOS `~/Library/Application Support/Adobe/CEP/extensions/...`;
  o instalador liga `PlayerDebugMode` (CSXS 9-20). Assinatura descartada: problema conhecido da Adobe (painel assinado em branco) e assinatura do Mac
  exige Mac. `update_apply_package` também troca o painel (`install_panel_files`, troca inteira).
- **Armadilha de teste:** copiar arquivos de dentro do Claude para `AppData` cai na pasta virtual do app do Claude (MSIX). Para implantar
  no PC do Eduardo, use um .bat aberto pelo `explorer.exe` (ex.: `build\implantar-teste.bat`).
- **3.1.1:** `--no-mtime` no yt-dlp (sem isso a data do arquivo era a do vídeo e `_videos_since` não achava o arquivo: sem H.264 e sem importar). `h264_encoder` testa NVENC/QSV/AMF e cai no libx264; `_faster_encoder` faz corrida de 4 s no próprio vídeo (>60 s) e guarda o vencedor na sessão. `ensure_panel` (thread na partida): edição editors sem painel ou com painel mais velho que o `VERSION` -> baixa o zip desta versão da release, confere o `digest`, instala `adobe/` e liga `PlayerDebugMode` (`enable_cep_panels`). A versão do painel (`adobe/CSXS/manifest.xml`) acompanha a do app.

## Continuação local — 3.1.1 (Codex)

- Mantida 3.1.1 por ordem do Eduardo, ainda local; pacotes de teste substituídos diretamente em `dist/`, sem pasta alternativa. Nenhum commit/push nesta sessão.
- Instaladores informam instalação e ativação Adobe; `PANEL_SETUP` em `/health` e popup mostram etapas/falha do `ensure_panel`. Desinstalador confere falha de remoção do painel; remoção em cada navegador/perfil segue manual.
- Cancelamento Windows: fallback quando `taskkill` retorna erro e checagem de cancelamento logo após registrar o processo. Falha apareceu duas vezes na suíte e passou após correção.
- Conversão real VP9/Opus -> H.264/AAC e fallback GPU inválida -> CPU verificados em arquivos temporários. NVIDIA e AMD disponíveis; Intel QSV recusado neste PC. CPU ganhou a corrida em amostra sintética 1080p. Não é medição de qualidade visual nem de desempenho em todos os vídeos.
- Seleção GPU atualizada: no Windows `windows_gpu_adapters()` usa IDXGIFactory6/EnumAdapterByGpuPreference(HIGH_PERFORMANCE); associa ao EnumAdapters1 pelo LUID e `gpu_candidates()` fixa dispositivo D3D11 (QSV derivado do mesmo D3D11). Prioridade não depende da marca. Se DXGI indisponível, CPU; se GPU falha, tenta próximas candidatas e depois CPU. Fora do Windows mantém o caminho anterior. A corrida ainda guarda um vencedor para toda a sessão, sem separar resolução/codec; não afirmar escolha ótima em todo vídeo.
- Instalação/desinstalação completas no perfil real aguardam validação do Eduardo; atualização automática de 3.0.x depende de release publicada.
- Resultado final desta rodada: suíte original 43/43 após correção, teste adicional do fallback de encerramento aprovado, cancelamento real repetido aprovado e navegador 74/74 (cópia diagnóstica do teste com registro de exceções). Primeira rodada do Instagram falhou; segunda passou sem alterar o código do navegador.

- Validação GPU explícita: 46 testes aprovados. RTX 4090 e Radeon integrada reais aceitam o índice selecionado; conversão real VP9/Opus -> H264/AAC usou RTX 4090 e mostrou modelo no progresso. Duas GPUs da mesma marca (incluindo nomes iguais e índices invertidos) cobertas em teste simulado; duas Intel reais ainda não verificadas. Identificação DXGI ~10 ms neste PC, teste de disponibilidade ~257 ms (medição única, não garantia de tempo).

## Novo fluxo público — repositório independente

- Renomeação autorizada pelo Eduardo nesta sessão: `noevfx/noevfx-downloader`; origin atualizado em SSH. Ele redistribuirá os arquivos para os usuários antigos. Migração pelo instalador, sem promessa de atualização pelo botão das versões antigas. `UPDATE_REPO` usa o novo nome; validação de assets mantém ambos.
- `docs/site/`: apresentação e manual HTML completo em oito páginas. Inclui interfaces atuais em demonstrações isoladas, sem chamadas ao app real; dados/ações de exemplo identificados. Capítulos de instalação, Edge, Adobe, formatos/GPU, configurações, atualização/desinstalação e ajuda. GitHub Pages via `.github/workflows/manual-pages.yml`.
- Protótipo local aprovado continua em `docs/preview-branding/` (ignorado no Git). Publicação usa apenas `docs/site/`. Nada de mover a pasta `extension` instalada: isso quebraria os perfis dos navegadores.
- Este envio publica código/documentação, sem criar tag ou release 3.1.1. Os ZIPs locais em `dist/` devem conter os novos endereços; a release 3.1.1 ainda precisa do fechamento e teste de atualização automática publicado.

- Ajustes visuais aprovados em direção: manual usa abertura azul, logo negativo, navegação horizontal e seções abertas como a apresentação (sem sidebar). Capítulo Adobe ilustra também navegador → menu → resultado no projeto, com demonstração interativa isolada. Apresentação identifica Chromium (Chrome/Edge/Brave/Opera/Vivaldi) e destaca for Editors em azul com integração visível.
- CI: extração dos pacotes agora seleciona somente o ZIP for Editors, evitando passar os dois ZIPs ao unzip/Expand-Archive. O problema histórico do teste e2e antigo ainda exige conferir os runners; não afirmar CI inteira aprovada só por testes locais.

## Padrão editorial — páginas voltadas ao usuário

- README é apresentação e escolha da edição; `docs/MANUAL-DE-USO.md` é guia de tarefas; `MANUAL.md` e `COMECE-AQUI.txt` são entradas rápidas. HTML segue a mesma ordem: instalar, encontrar no navegador, receber links no editor, baixar vários, configurar e resolver.
- Imagem + poucos passos + resultado esperado. Evitar repetir uma explicação em vários trechos; detalhes técnicos opcionais em blocos recolhíveis. Base Chromium, não exclusividade do Edge.
- Novas imagens `docs/img/*-3.1.1.png`: renderizações dos templates atuais com dados demonstrativos. Não são capturas de importação real nos programas Adobe. Fontes das demonstrações em `docs/site/assets/*-demo.html`; popup passa a exibir os controles Adobe e vários links. Substituir referências antigas ao popup no site e no Markdown.


## Implementação — playlists / 3.2.0 (ensaios de nomes antigos abaixo são históricos)

- `/inspect`: leitura autenticada de metadados sem baixar mídia, no máximo duas leituras simultâneas e 500 itens com aviso explícito de corte. HLS/DASH são recusados como coleções. O navegador fornece cookies quando habilitado; o painel Adobe não lê a sessão do navegador.
- `/batch`, `GET /batch?id=...`, `/batch/cancel`: fila no app local, até 500 itens e até oito jobs ativos por lista, respeitando o limite global. Projeto/pasta são fixados ao enviar; a organização por site é preservada. Fechar a interface não para a fila; reiniciar o app/PC não a restaura.
- MP3/M4A/WAV/FLAC/Opus para pasta. Destinos Adobe aceitam MP3/M4A/WAV. A lista de arquivos finais inclui WAV. Deduplicação distingue formato e pasta. Clientes antigos de áudio continuam com M4A.
- Cada colagem no seletor adiciona itens independentes. Links idênticos são ignorados. URL de vídeo do YouTube com `list=` continua individual até a escolha explícita da playlist. Sources e itens têm áreas limitadas para listas grandes não empurrarem os controles por milhares de linhas.
- Popup e player usam dropdown de qualidade; áudio abre o seletor. A edição comum não mostra destinos Adobe. A fila mais recente pode ser acompanhada ao reabrir a interface no mesmo perfil/programa.
- Documentos atualizados: README, manual Markdown, MANUAL.md, COMECE-AQUI, oito páginas HTML e demonstrações. Marca do README azul. Capturas novas em docs/img/*-3.2.0.png usam interfaces reais com dados demonstrativos, sem download/importação real no manual.
- Validação: 69 testes Python; 10 casos de links; teste de agrupamento do popup; rodada completa com 74/74 checagens do navegador. Há intermitência conhecida no aquecimento do cenário Instagram do teste headless (algumas inicializações não registram as mensagens); registrar sem esconder. Logs locais em build/.
- Áudio real verificado em cinco formatos por download HTTP local e ffprobe. Playlist pública real verificada em metadados (Computerphile), sem baixar toda a playlist.
- Ensaio histórico ANTES da troca definitiva dos nomes: atualização ensaiada com o servidor real da release 3.1.0 e o HEAD anterior 3.1.1, nas duas edições: pacote aceito, configuração preservada, extensão e painel novos completos. O endpoint antigo GitHub redireciona e a 3.1.0 já aceita a URL nova. Fluxo de rede completo da futura release só pode ser confirmado depois de publicada.
- Para teste AGORA: extrair o pacote 3.2.0 local e rodar instalador por cima, sem desinstalar. Para versões anteriores à 3.2.0: migração pelo instalador por cima uma vez, recarregar extensão instalada e reiniciar Adobe. O botão passa a reconhecer o padrão novo após migrar.
- Backup anterior criado a partir do HEAD limpo, sem sobrescrever: _backups/v3.1.1-before-playlists/fontes-HEAD.zip.

## Próxima tarefa — somente após aprovação e fechamento do app/docs/git

Carrossel Instagram editável em PSD, foco for Editors, didático e bem ilustrado. A quantidade de slides fica a nosso critério. Referência de identidade, rodapé, fontes e guias de safe margin: `D:/Noe VFX/.Labs/Windows/NetMonitor/docs/design/Instagram - Carrossel/NetMonitor - Carrossel v03.psd`. Preservar margens superior e inferior. O Eduardo determinou expressamente não iniciar essa tarefa antes de concluir e aprovar a atual.

- Fechamento dos nomes: 69 testes Python aprovados, mais testes Node de identidade em configurações/Sobre/menus. As notas e hashes são gerados por tools/release_notes.py; o workflow publica exatamente os dois ZIPs da versão. tools/release.py faz um único push atômico e não disputa a publicação com o workflow. Sem publicação nesta rodada.


## Limpeza solicitada — 14/11/2026

- dist contém somente os dois ZIPs 3.2.0, SHA256-3.2.0.txt e RELEASE-3.2.0.md. build.py agora arquiva pacotes de versões anteriores automaticamente, sem apagá-los, e separa compilações por versão/execução.
- 48 itens locais movidos, sem exclusão: builds antigos, rascunhos, pacotes 3.1.1 e imagens não referenciadas. Registro em build/ORGANIZACAO-2026-11-14.json. Cópias em _Arquivo/2026-11-14-limpeza; pasta ignorada pelo Git.
- GitHub: removidas as 10 releases anteriores à v3.0.21, após baixar e conferir seus assets, notas e metadados. Mantidas v3.0.21 (primeiro envio para a pasta do projeto Adobe) e v3.1.0 (painéis/importação). Tags e histórico preservados. A 3.2.0 continua local, sem publicação.
- Não foram varridas nem alteradas as pastas históricas release/ e _backups/. Mapa das pastas no README e índices em docs/ e tools/.

## Envio de preservação autorizado — 14/11/2026

- Eduardo pediu subir imediatamente todo o estado atual: código 3.2.0, documentação, manuais e site. Este envio não cria tag nem publica release instalável: a falha real do TikTok relatada em seguida ainda está em investigação.
- Próxima ação: investigar o erro “Este endereço não é suportado direto” no TikTok, comparar identificação do post e fallback de mídia com versões anteriores, corrigir e testar antes de fechar a release. Não considerar a correção feita só porque os testes simulados passam.
- Carrossel PSD continua adiado até aprovação e fechamento do fluxo do app.

## TikTok e painel compacto — 14/11/2026

- Falha TikTok confirmada no job instalado: URL enviada era somente https://www.tiktok.com/. Inspeção do site real mostrou ID no xgwrapper com vídeo blob e endereço genérico. content.js prioriza o ID do próprio player (URL embed aceita pelo yt-dlp), evita links vizinhos e mantém mídia direta do próprio vídeo como fallback quando disponível. O usuário confirmou que deseja baixar no feed sem abrir link individual.
- Download real por servidor isolado: 1920x1080, 461,9s, 74.136.715 bytes, HEVC + MP3 conferidos com ffprobe. Sem importação/conversão Adobe nesse ensaio.
- Painel aprovado pelo usuário: compacto por padrão, completo alternável, preferência local por programa. Revisão de seleção recolhível, playlist abre automaticamente, botão de confirmar antes da lista expandida no compacto. Mantém itens, marcações e formato ao alternar. Não muda o destino fixo nem o backend de importação.
- Rodada final atual: 83/83 no navegador; teste focado --panel-only 6/6; 5 testes de distribuição e casos Node aprovados. Uma tentativa anterior parou na intermitência conhecida do aquecimento Instagram; a rodada final completou. Não foi validado visualmente dentro dos hosts Adobe nesta rodada.
- Conferência visual do HTML real a 340 e 280 px, sem transbordamento horizontal; CTA visível ao expandir playlist. Demonstrações, imagens, manual Markdown, HTML e README atualizados.
- Mesma 3.2.0 ainda sem release instalável publicada. ZIPs de dist e hashes reconstruídos. Sete arquivos da instalação local (extensão e CEP) copiados com backup em build/antes-painel-compacto-*. Para ativar: usuário precisa recarregar extensão e F5 no TikTok, e reiniciar o Adobe após salvar o trabalho. Navegação automática a edge://extensions foi bloqueada pela política do navegador; não tentar contornar.
- GitHub preserva o commit 6170aaa do envio anterior. Estas correções posteriores ainda estão locais, sem commit/push. Carrossel PSD continua adiado até fechar/aprovar o app.

## Fechamento autorizado — 14/11/2026

- Eduardo aprovou o resultado e autorizou subir tudo e finalizar. Publicação v3.2.0 com os dois produtos, TikTok corrigido, modos compacto/completo Adobe e documentação final.
- Validação final: 83/83 checagens do navegador, 6/6 no ensaio focado do painel, 69 testes Python da implementação e 5 testes de distribuição após os ajustes finais. Download real do TikTok e cinco formatos de áudio conferidos. Limitações físicas de Adobe/macOS/Linux permanecem documentadas.
- Migração de versões anteriores à 3.2.0: instalador novo por cima uma vez; recarregar extensão e reiniciar Adobe após salvar. Não precisa desinstalar. Para a cópia 3.2.0 já atualizada localmente nesta sessão, basta recarregar as interfaces.
- Publicação pelo workflow release.yml, tag v3.2.0 e main no mesmo push atômico. Não reconstruir nem substituir assets após a publicação; eventual correção futura exige PATCH novo.
- Carrossel PSD permanece tarefa separada, ainda não iniciado.


## Fechamento 3.2.1 — capitalização aprovada

Usuário decidiu manter NoeVFX-downloader. Links públicos e atualizador alinhados; 3.2.0 publicada permanece imutável. Versões até 3.2.0 precisam do instalador 3.2.1 por cima uma vez devido ao validador antigo. Imagens distorcidas de links e playlist refeitas e inspecionadas a 640 px; painel a 360 px. Testes Python: 70 aprovados. Publicação autorizada no mesmo fluxo de finalização. CI 3.2.0 teve falhas em testes com caminhos Windows nos runners Unix e no carregamento de extensão Chrome; não declarar CI multiplataforma toda verde.
