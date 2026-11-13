<p align="center">
  <img src="extension/icons/logo.svg" width="96" alt="Noe VFX">
</p>

<h1 align="center">Noe VFX Downloader</h1>

<p align="center">
  Salva para assistir offline os vídeos que você <b>já consegue assistir</b> na página,<br>
  na melhor qualidade que o player entrega — com a pasta e a qualidade que você escolher.
  <br><sub>NOÉ VFX · <a href="https://noevfx.com">noevfx.com</a> · <a href="mailto:labs@noevfx.com">labs@noevfx.com</a></sub>
</p>

<p align="center">
  <img alt="versão" src="https://img.shields.io/badge/vers%C3%A3o-3.0.12-0066FF">
  <img alt="plataformas" src="https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-171a24">
  <img alt="navegadores" src="https://img.shields.io/badge/Chrome%20%C2%B7%20Edge%20%C2%B7%20Brave%20%C2%B7%20Opera%20%C2%B7%20Vivaldi-171a24">
</p>

---

## Baixar

**Pacote completo (extensão + servidor + instaladores):**
[`noevfx-downloader-3.0.12.zip`](https://github.com/noevfx/Extensions/releases/download/v3.0.12/noevfx-downloader-3.0.12.zip)  <sub>(a versão está no nome do arquivo e no `VERSION.txt` dentro dele)</sub>

<sub>Todas as versões ficam na página de [releases](https://github.com/noevfx/Extensions/releases).</sub>

| Sistema | Pasta no zip | Instalador |
|---|---|---|
| Windows 10/11 | `windows/` | `INSTALAR_NOEVFX.bat` |
| macOS (Intel e Apple Silicon) | `mac/` | `INSTALAR-MAC.command` (ou `instalar-noevfx.sh`) |
| Linux | `linux/` | `instalar-noevfx.sh` |

> A pasta extraída serve **somente para instalar**. O programa é copiado para uma pasta do sistema e roda de lá — depois você pode apagar o que extraiu.

---

## O que ele faz

- **Encontra o vídeo que a página já carrega** (HLS, DASH, MP4, WebM e players embutidos) e mostra o que está disponível.
- **Ícone no canto do vídeo**: um clique para salvar, arraste para mover, liga/desliga em 3 lugares.
- **Miniatura de preview** de cada vídeo encontrado.
- **Contador no ícone** da extensão: quantos vídeos existem na aba.
- **Salvar um ou todos**, com fila de downloads.
- **Pasta padrão escolhida por você**, perguntada no primeiro uso.
- **Qualidade**: a melhor que o player oferece, ou 1080p / 720p / somente áudio.
- **Idioma automático**: português ou inglês, conforme o idioma do sistema.

---

## Como funciona

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  Extensão (Chromium)         │  HTTP  │  Aplicativo local (Python)   │
│  · lê a mídia da aba         │ ─────► │  127.0.0.1:8765              │
│  · ícone no vídeo            │        │  · yt-dlp  · ffmpeg          │
│  · popup, configurações      │ ◄───── │  · fila de downloads         │
└──────────────────────────────┘        └──────────────────────────────┘
                                                  │
                                                  ▼
                                        pasta escolhida por você
```

- O aplicativo escuta **apenas `127.0.0.1`**, exige o cabeçalho `X-NoeVFX-Client`
  e aceita origem somente de extensões (`chrome-extension://`).
- Nada sai do seu computador: a extensão conversa só com o aplicativo local.

---

## Compatibilidade

| Tipo | Suporte |
|---|---|
| HLS (`.m3u8`) | sim |
| DASH (`.mpd`) | sim |
| MP4 / WebM diretos | sim |
| Players embutidos (YouTube, Vimeo, Dailymotion) | sim |
| Conteúdo atrás do seu próprio login | sim, usando a sua sessão |
| Conteúdo protegido por DRM | **não** — a ferramenta não contorna proteções |

> A ferramenta usa a sessão que **você** já tem aberta. Ela não cria acesso,
> não quebra login, não ignora assinatura e não remove DRM.

---

## Como fica

<p align="center">
  <img src="docs/img/02-painel-no-video.png" alt="Painel de download sobre o vídeo" width="720">
</p>

<table>
<tr>
<td width="50%"><img src="docs/img/05-popup.png" alt="Popup com os vídeos detectados"></td>
<td width="50%"><img src="docs/img/06-popup-baixando.png" alt="Popup baixando, com progresso e botão Cancelar"></td>
</tr>
<tr>
<td align="center"><sub>Popup: tudo que a página carrega, com miniatura</sub></td>
<td align="center"><sub>Progresso e botão Cancelar</sub></td>
</tr>
</table>

📖 **[Manual de uso completo, com todas as telas](docs/MANUAL-DE-USO.md)** — instalar, configurar, baixar
(ícone no vídeo, popup, botão direito, YouTube), qualidades, cursos com login e o que fazer quando algo falha.

---
## Instalação

### Windows

O instalador faz tudo sozinho, **sem administrador e sem nada instalado antes**
(Python, yt-dlp com checagem SHA-256, FFmpeg e Deno para o YouTube; só baixa o que faltar).
Pode rodar de novo para atualizar.

1. Baixe e **extraia** o zip
2. Abra `windows\INSTALAR_NOEVFX.bat`
   - copia tudo para `%LOCALAPPDATA%\NoeVFXDownloader`
   - cria o aplicativo oculto que inicia com o Windows
   - abre um **guia visual** no navegador com o último passo
3. No navegador: **Modo de desenvolvedor** → **arraste a pasta `extension`** (o Explorer abre com ela selecionada) para a página de extensões
   (ou **Carregar sem pacote** → cole o caminho copiado → entre na pasta → clique 1x em `extension` → **Selecionar pasta**)

### macOS / Linux

macOS: botão direito em `mac/INSTALAR-MAC.command` → **Abrir** (só na 1ª vez). Ou, em qualquer um dos dois:

```bash
cd mac        # ou: cd linux
bash instalar-noevfx.sh
```

Copia para `~/.local/share/NoeVFXDownloader` e cria o serviço de inicialização
(LaunchAgent no macOS, `systemd --user` no Linux). O log fica em `install.log`.
A instalação nos três sistemas é testada automaticamente a cada versão
(GitHub Actions: Windows, macOS Apple/Intel, Linux x64/ARM).

> **O erro mais comum:** carregar a extensão da pasta **extraída do zip**. O
> navegador guarda o caminho e a extensão quebra quando você apaga a pasta.
> Carregue sempre da pasta **instalada**.

---

## Primeiro uso

1. **Aplicativo local** → deve mostrar `online`, `yt-dlp ✓`, `FFmpeg ✓`
2. **Pasta padrão** → **Escolher pasta…**
3. **Ícone no vídeo** → *perguntar antes de salvar* ou *salvar direto*
4. **Qualidade padrão** → melhor disponível, 1080p, 720p ou só áudio
5. **Concluir**

---

## Usando no dia a dia

| Ação | Como |
|---|---|
| Salvar um vídeo | Passe o mouse no vídeo → clique no ícone azul |
| Ligar/desligar o ícone | Popup (botão de energia), botão direito ou rodapé do cartão |
| Mover o ícone | Arraste — a posição fica salva por site |
| Salvar todos | Botão no popup ou no cartão do vídeo |
| Atualizar a detecção | Botão **⟳** no popup (`Shift`+clique recarrega a página) |
| Abrir a pasta | Popup → **abrir** |

---

## Atualizar

A extensão é carregada da pasta instalada e **não tem auto-update**. Para atualizar:

1. Rode o instalador do zip novo — ele detecta a instalação existente, substitui
   os arquivos e reinicia o aplicativo local
2. Em `chrome://extensions` (ou `edge://extensions`), clique em **Recarregar**

Configurações, pasta escolhida e posições salvas são preservadas.

---

## Uso responsável

- Salve apenas conteúdo que **você tem o direito** de baixar.
- A ferramenta **não contorna DRM, paywall, login ou bloqueio regional**.
- Respeite os termos de uso e os direitos autorais de cada site.
- Veja [`TERMS.md`](TERMS.md) e [`PRIVACY.md`](PRIVACY.md).

---

## Problemas comuns

| Sintoma | Solução |
|---|---|
| Selo **Offline** | Rode o instalador novamente; o aplicativo sobe com o sistema |
| Nenhum vídeo detectado | Dê **play** e clique em **⟳** |
| Erro de FFmpeg | Rode o instalador (a união vídeo+áudio depende dele) |
| Vídeo só aparece logado | Ative **Usar os cookies do navegador** nas configurações |
| Erro 403 | Atualize o yt-dlp: `yt-dlp -U` (ou rode o instalador) |

**Logs:** Windows `%LOCALAPPDATA%\NoeVFXDownloader\server.log` · macOS/Linux `/tmp/noevfx-downloader.log`

**Suporte:** [labs@noevfx.com](mailto:labs@noevfx.com)

---

## Estrutura do repositório

```
extension/                 extensão MV3 (fonte)
  manifest.json            nome/descrição localizados (_locales en, pt_BR)
  i18n.js                  dicionário pt/en (idioma do sistema)
  background.js            sniffer, badge, fila, configuração
  content.js               ícone no vídeo, miniaturas, leitura instantânea
  popup.html / popup.js    janela da extensão
  options.html / options.js configurações e primeiro uso
  styles.css
  icons/

server/server.py           aplicativo local (Python puro, sem dependências)

installers/
  windows/                 INSTALAR_NOEVFX.bat + instalar-noevfx.ps1 · DESINSTALAR_NOEVFX.bat
  mac/                     INSTALAR-MAC.command · instalar-noevfx.sh · desinstalar-noevfx.sh
  linux/                   instalar-noevfx.sh · desinstalar-noevfx.sh
  common/                  guia-extensao.html (guia visual do último passo)

docs/                      MANUAL-DE-USO.md + img/ (telas; geradas por tools/capturar-telas.js)
tests/                     test_server.py · e2e.js · install_smoke.py
tools/
  build.py                 gera dist/noevfx-downloader-<versão>.zip (+ VERSION.txt dentro)
  release.py               build + commit + tag + GitHub Release


MANUAL.md · TERMS.md · PRIVACY.md · CHANGELOG.md · LICENSE
```

---

## Build

```bash
python tools/build.py           # pacote completo (windows/mac/linux)
python tools/release.py         # release completa no GitHub
```

---

## Aviso

Ferramenta para uso pessoal. Salve apenas conteúdo que você tem direito de
baixar. A responsabilidade pelo uso é de quem baixa. Veja [`TERMS.md`](TERMS.md).

---

<p align="center">
  <sub>© NOÉ VFX — <a href="https://noevfx.com">noevfx.com</a> · <a href="mailto:labs@noevfx.com">labs@noevfx.com</a></sub>
</p>
