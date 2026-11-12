<p align="center">
  <img src="extension/icons/logo.svg" width="96" alt="NOÉ VFX">
</p>

<h1 align="center">NOÉ VFX Downloader</h1>

<p align="center">
  Detector universal de vídeos para navegadores Chromium — baixa na <b>qualidade nativa</b> do player.<br>
  <sub>NOÉ VFX · <a href="https://noevfx.com">noevfx.com</a></sub>
</p>

<p align="center">
  <img alt="versão" src="https://img.shields.io/badge/vers%C3%A3o-3.0.0-0066FF">
  <img alt="plataformas" src="https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-171a24">
  <img alt="navegadores" src="https://img.shields.io/badge/Chrome%20%C2%B7%20Edge%20%C2%B7%20Brave%20%C2%B7%20Opera%20%C2%B7%20Vivaldi-171a24">
</p>

---

## Baixar

**Pacote completo (extensão + servidor + instaladores):**
[`noevfx-downloader.zip` (v3.0.0)](https://github.com/noevfx/Extensions/releases/download/v3.0.0/noevfx-downloader.zip)

<sub>Também disponível em [`dist/noevfx-downloader.zip`](dist/noevfx-downloader.zip) e na página de [releases](https://github.com/noevfx/Extensions/releases).</sub>

O zip vem com três pastas autocontidas — use só a do seu sistema:

| Sistema | Pasta | Instalador |
|---|---|---|
| Windows 10/11 | `windows/` | `INSTALAR_NOEVFX.bat` |
| macOS (Intel e Apple Silicon) | `mac/` | `instalar-noevfx.sh` |
| Linux | `linux/` | `instalar-noevfx.sh` |

> A pasta extraída serve **somente para instalar**. O programa é copiado para uma pasta do sistema e roda de lá — depois você pode apagar o que extraiu.

---

## O que ele faz

- **Detecta qualquer vídeo** na página: HLS (`.m3u8`), DASH (`.mpd`), MP4, WebM, players embutidos, YouTube, Vimeo, Globo/G1.
- **Ícone flutuante no vídeo**: aparece ao passar o mouse, some após 2 s parado, é **arrastável** dentro do player e pode ser ligado/desligado.
- **Miniatura de preview** de cada vídeo detectado.
- **Badge vermelho com número branco** no ícone da extensão = vídeos encontrados na aba.
- **Baixar um ou todos**, com fila de 3 downloads simultâneos.
- **Pasta padrão escolhida por você**, perguntada no primeiro uso.
- **Leitura instantânea** de streams (rede + DOM + cache de performance).
- Funciona com **login/cookies**, sites com proteção anti-bot e players que escondem o `.m3u8`.

---

## Como funciona

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  Extensão (Chromium)         │  HTTP  │  Servidor local (Python)     │
│  · sniffer webRequest        │ ─────► │  127.0.0.1:8765              │
│  · ícone no vídeo            │        │  · yt-dlp  · ffmpeg          │
│  · popup, configurações      │ ◄───── │  · fila de downloads         │
└──────────────────────────────┘        └──────────────────────────────┘
                                                  │
                                                  ▼
                                        pasta escolhida por você
```

- O servidor escuta **apenas `127.0.0.1`**, exige o cabeçalho `X-NoeVFX-Client` e aceita `Origin` somente de extensões (`chrome-extension://`).
- Nada é enviado para fora da sua máquina: a extensão manda a URL e os cookies **da sua sessão** para o servidor local, que baixa o vídeo com `yt-dlp`.

---

## Instalação

### Windows

1. Baixe e **extraia** o zip
2. Abra `windows\INSTALAR_NOEVFX.bat`
   - verifica o Python
   - copia tudo para `%LOCALAPPDATA%\NoeVFXDownloader`
   - instala/atualiza `yt-dlp` e `FFmpeg` (só se faltar)
   - cria o servidor oculto que inicia com o Windows
   - abre a pasta instalada e o navegador
3. No navegador: **Modo de desenvolvedor** → **Carregar sem pacote** → selecione a pasta `extension` que abriu

### macOS / Linux

```bash
cd mac        # ou: cd linux
bash instalar-noevfx.sh
```

O script copia para `~/.local/share/NoeVFXDownloader`, instala `yt-dlp`/`ffmpeg` e cria o serviço de inicialização (LaunchAgent no macOS, `systemd --user` no Linux). No fim ele mostra o caminho da pasta `extension` para carregar no navegador.

> **O erro mais comum:** carregar a extensão da pasta **extraída do zip**. O navegador guarda o caminho e a extensão quebra quando você apaga a pasta. Carregue sempre da pasta **instalada**.

---

## Primeiro uso

A tela de configuração abre sozinha:

1. **Servidor local** → deve mostrar `online`, `yt-dlp ✓`, `FFmpeg ✓`
2. **Pasta padrão** → **Escolher pasta…** (abre o seletor do sistema)
3. **Ícone no vídeo** → *perguntar antes de salvar* ou *salvar direto*
4. **Qualidade padrão** → Nativa, 1080p, 720p ou só áudio
5. **Concluir**

---

## Usando no dia a dia

| Ação | Como |
|---|---|
| Baixar um vídeo | Passe o mouse no vídeo → clique no ícone azul |
| Ligar/desligar o ícone | Popup (botão de energia), botão direito, ou rodapé do cartão do vídeo |
| Mover o ícone | Arraste — a posição fica salva por site |
| Baixar todos | Botão no popup ou no cartão do vídeo |
| Atualizar a detecção | Botão **⟳** no popup (`Shift`+clique recarrega a página) |
| Abrir a pasta | Popup → **abrir** |

---

## Atualizar

Extensões carregadas fora da loja **não têm auto-update**. Para atualizar:

1. Rode o instalador do zip novo — ele detecta a instalação existente, substitui os arquivos e reinicia o servidor
2. Em `chrome://extensions` (ou `edge://extensions`), clique em **Recarregar** no cartão do NOÉ VFX

Configurações, pasta escolhida e posições salvas são preservadas.

> Publicação nas lojas (Edge Add-ons / Chrome Web Store) está prevista — quando acontecer, as atualizações passam a ser automáticas.

---

## Problemas comuns

| Sintoma | Solução |
|---|---|
| Selo **Offline** | Rode o instalador novamente; o servidor sobe com o sistema |
| Nenhum vídeo detectado | Dê **play** e clique em **⟳** |
| Erro de FFmpeg | Rode o instalador (a união vídeo+áudio depende dele) |
| Vídeo privado / login | Ative **Usar os cookies do navegador** nas configurações |
| Erro 403 | Atualize o yt-dlp: `yt-dlp -U` (ou rode o instalador) |
| "Pasta em Uso" ao apagar a pasta extraída | O servidor ainda está rodando de dentro dela — feche e mova |

**Logs:** Windows `%LOCALAPPDATA%\NoeVFXDownloader\server.log` · macOS/Linux `/tmp/noevfx-downloader.log`

---

## Estrutura do repositório

```
extension/                 extensão MV3 (fonte)
  manifest.json
  background.js            sniffer, badge, fila, configuração
  content.js               ícone no vídeo, miniaturas, leitura instantânea
  popup.html / popup.js    janela da extensão
  options.html / options.js configurações e primeiro uso
  styles.css
  icons/

server/server.py           servidor local (Python puro, sem dependências)

installers/
  windows/                 INSTALAR_NOEVFX.bat · DESINSTALAR_NOEVFX.bat
  mac/                     instalar-noevfx.sh · desinstalar-noevfx.sh
  linux/                   instalar-noevfx.sh · desinstalar-noevfx.sh

tools/build.py             gera dist/noevfx-downloader.zip
dist/                      pacote pronto para distribuir
MANUAL.md                  manual completo
COMECE-AQUI.txt            instruções rápidas dentro do zip
```

---

## Build

```bash
python tools/build.py
```

Gera `dist/noevfx-downloader.zip` com `windows/`, `mac/` e `linux/`, cada pasta autocontida (extensão + servidor + instalador).

**Desenvolvimento da extensão:** carregue a pasta `extension/` como extensão descompactada.
**Desenvolvimento do servidor:** `python server/server.py` (porta 8765, ou `NOEVFX_PORT`).

---

## API local

| Método | Rota | Função |
|---|---|---|
| `GET` | `/health` | estado (versão, yt-dlp, ffmpeg, pastas) |
| `GET` | `/config` | configuração atual |
| `POST` | `/config` | salva configuração |
| `POST` | `/pick-folder` | seletor de pasta nativo |
| `POST` | `/open-folder` | abre a pasta no gerenciador |
| `GET` | `/thumb?url=` | miniatura via FFmpeg (com cache) |
| `POST` | `/download` | enfileira download |
| `GET` | `/status?id=` | progresso do job |
| `GET` | `/jobs` | últimos downloads |

---

## Aviso

Ferramenta para uso pessoal. Baixe apenas conteúdo que você tem direito de baixar (material próprio, domínio público, ou com autorização). A responsabilidade pelo uso é de quem baixa.

---

<p align="center">
  <sub>© NOÉ VFX — <a href="https://noevfx.com">noevfx.com</a></sub>
</p>

---

<sub>Este repositório reúne as extensões e add-ons da **NOÉ VFX**. No momento ele contém o **Downloader**; novos utilitários entram na mesma estrutura (`extension/` + `server/` + `installers/`).</sub>
