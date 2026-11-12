# Changelog

Todas as mudanças relevantes do Noe VFX Downloader.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) ·
versionamento [SemVer](https://semver.org/lang/pt-BR/).

---

## [3.0.0] — 2026-11-12

### Adicionado
- **Pasta padrão configurável**, perguntada no primeiro uso, com seletor nativo
  do sistema (PowerShell no Windows, Finder no macOS, zenity/kdialog no Linux).
- **Ícone flutuante sobre cada vídeo** (Shadow DOM), com:
  - arrastar dentro da área do player (posição salva por site);
  - sumir automaticamente após **2 s** com o mouse parado;
  - liga/desliga em três lugares: popup, botão direito e rodapé do cartão do vídeo.
- **Miniatura de preview** por vídeo (og:image → poster → frame do `<video>` → FFmpeg).
- **Lista de streams com o dobro da altura** (135 px → 270 px).
- **Badge vermelho `#E01B24` com número branco** = vídeos distintos na aba.
- **Baixar todos** (fila com 3 downloads simultâneos) ou individual.
- **Menu de contexto ampliado**: baixar, baixar todos, ligar/desligar ícone,
  abrir pasta, configurações.
- **Leitura instantânea** de streams: `performance entries` + DOM + `webRequest` filtrado.
- **Servidor local** sem dependências (Python puro) com:
  - configuração persistente (`config.json`);
  - cookies da sessão por download;
  - `--impersonate chrome`, 16 fragmentos paralelos, retentativas e fallback em cadeia;
  - miniaturas geradas por FFmpeg (com cache);
  - fila com limite de concorrência e detecção de instância duplicada.
- **Instaladores** para Windows (`.bat`), macOS e Linux (`.sh`) com cópia para pasta
  do sistema, inicialização automática e verificação de saúde.
- **Documentação**: `MANUAL.md`, `COMECE-AQUI.txt`, `PRIVACY.md`, `docs/STORE.md`.
- **Build automatizado** (`tools/build.py`, `tools/build-store-zip.py`) e
  release via GitHub Actions.

### Corrigido
- Streams deixavam de aparecer quando o service worker era suspenso → estado
  persistido em `chrome.storage.session`.
- `MutationObserver` varria o DOM em toda mutação (travava YouTube) → debounce.
- Rescan podia receber resposta de iframe de anúncio → prioriza o frame principal.
- Clicar no ícone baixava todos os `<video>` da página → `--playlist-items 1`.
- Instalador travava no download do yt-dlp antes de instalar o servidor →
  servidor sobe primeiro e downloads só acontecem se faltar.
- VBS quebrado no Windows (`set` dentro de bloco `if` + `CreateObject(...)`) →
  fluxo por labels, VBS validado com `cscript`.
- Seletor de pasta dependia do tkinter (ausente em alguns Python) → PowerShell nativo.
- Duas instâncias do servidor presas na mesma porta → detecção e saída limpa.

### Segurança
- Servidor escuta apenas `127.0.0.1`, exige `X-NoeVFX-Client` e origem
  `chrome-extension://`.
- Cookies usados em arquivo temporário e apagados ao final do job.

---

## [2.0.0] — anterior

- Detector via `webRequest`, botão fixo no YouTube, popup com tema claro/escuro,
  instalador Windows com `winget` e servidor `yt-dlp`.
