# Noe VFX Downloader v3.0 — Manual de Instalação e Uso

**Site:** https://noevfx.com
**Navegadores:** Chrome, Microsoft Edge, Brave, Opera, Vivaldi (qualquer Chromium)
**Sistemas:** Windows 10/11, macOS (Apple Silicon e Intel) e Linux

> **Importante:** a pasta que você extrai do ZIP serve **somente para instalar**.
> O instalador copia tudo para uma pasta do sistema e o programa roda de lá.
> Depois de instalar, **você pode apagar a pasta extraída**.

| Sistema | Pasta | Instalador |
|---|---|---|
| Windows | `windows\` | `INSTALAR_NOEVFX.bat` |
| macOS | `mac\` | `instalar-noevfx.sh` |
| Linux | `linux\` | `instalar-noevfx.sh` |

> ### O erro mais comum
> O navegador guarda **o caminho** da pasta da extensão. Se você carregar a extensão
> da pasta **extraída do ZIP** e depois apagar essa pasta, a extensão **quebra**
> (fica cinza ou some da barra).
>
> **Sempre carregue da pasta onde o programa foi instalado:**
>
> | Sistema | Pasta correta para carregar |
> |---|---|
> | Windows | `%LOCALAPPDATA%\NoeVFXDownloader\extension` |
> | macOS | `~/.local/share/NoeVFXDownloader/extension` |
> | Linux | `~/.local/share/NoeVFXDownloader/extension` |
>
> O instalador **copia esse caminho** para a área de transferência. Se você já
> tinha carregado a pasta extraída: `chrome://extensions` → **Remover** → carregar
> de novo pelo caminho acima. Só depois disso a pasta extraída pode ser apagada.

---

## 1. O que a extensão faz

- Detecta **qualquer vídeo** na página: HLS (`.m3u8`), DASH (`.mpd`), MP4, WebM, players embutidos, YouTube, Vimeo, Globo/G1.
- Mostra um **ícone azul da NOÉ VFX no canto do vídeo** quando você passa o mouse.
- Baixa na **qualidade nativa** (a melhor disponível) com `yt-dlp` + `ffmpeg`.
- Salva em **uma pasta que você escolhe** na primeira vez.
- O contador **vermelho com número branco** no ícone mostra quantos vídeos há na aba.

**Onde fica instalado:**

| Sistema | Pasta do programa | Inicia sozinho? |
|---|---|---|
| Windows | `%LOCALAPPDATA%\NoeVFXDownloader` | sim (VBS na pasta Inicializar) |
| macOS | `~/.local/share/NoeVFXDownloader` | sim (LaunchAgent) |
| Linux | `~/.local/share/NoeVFXDownloader` | sim (systemd --user ou autostart) |

---

## 2. Instalação no Windows

1. Clique com o botão direito no **ZIP** → **Extrair tudo…**
2. Abra a pasta **`windows`** e dê duplo clique em **`INSTALAR_NOEVFX.bat`**
3. Vá apertando **Enter**. O instalador faz 6 etapas:

```
[1/6] Python           instala se não existir
[2/6] Copia tudo       -> %LOCALAPPDATA%\NoeVFXDownloader
[3/6] yt-dlp           baixa o executável oficial
[4/6] FFmpeg           winget ou pacote portátil
[5/6] Deno             opcional (YouTube)
[6/6] Servidor oculto  inicia agora e junto com o Windows
```

4. No final, o instalador **abre a pasta `NoeVFXDownloader`** no Explorer e o navegador.
   Faça os **3 cliques** (pode arrastar a pasta `extension` que está aberta):

| Passo | Ação |
|---|---|
| 1 | Ligar **Modo de desenvolvedor** (canto superior direito) |
| 2 | Clicar em **Carregar sem pacote** (ou arrastar a pasta `extension` para a página) |
| 3 | **Ctrl+V** (o caminho já está copiado) → **Selecionar pasta** |

5. Abra o ícone azul da extensão: ela pergunta **em qual pasta salvar os vídeos**.

> Não precisa de senha de administrador. Pode apagar a pasta extraída depois.

---

## 3. Instalação no macOS / Linux

Abra o Terminal **dentro da pasta `mac`** (ou `linux`) e rode:

```bash
bash instalar-noevfx.sh
```

O script:

1. Confere o Python 3
2. Copia os arquivos para `~/.local/share/NoeVFXDownloader`
3. Instala o `yt-dlp` (pip ou binário oficial)
4. Instala o `ffmpeg` (Homebrew no Mac; apt/dnf/pacman/zypper no Linux)
5. Cria o serviço de segundo plano:
   - **macOS:** LaunchAgent `com.noevfx.downloader`
   - **Linux:** serviço `systemd --user` (ou autostart XDG)
6. Copia o caminho da extensão para a área de transferência

Depois, no navegador:

1. `chrome://extensions` (no Edge: `edge://extensions`)
2. **Modo do desenvolvedor**
3. **Carregar sem compactação**
4. Cole o caminho e selecione a pasta `…/.local/share/NoeVFXDownloader/extension`

> **macOS:** na primeira vez, o macOS pode pedir permissão de acesso a arquivos/pastas — aceite.
> Se o sistema bloquear o script (Gatekeeper), rode com `bash instalar-noevfx.sh` (não com duplo clique).

---

## 4. Primeiro uso — escolher a pasta

A tela de configuração abre sozinha:

1. **Servidor local** → deve mostrar `online`, `yt-dlp ✓`, `FFmpeg ✓`
2. **Pasta padrão** → **Escolher pasta…** (abre o seletor do sistema) ou digite o caminho
3. **Ícone sobre o vídeo** → *Perguntar antes de salvar* (menu) ou *Salvar direto*
4. **Qualidade padrão** → Nativa, 1080p, 720p ou Só áudio
5. **Avançado** → cookies do navegador (recomendado ligado), subpasta por site
6. **Concluir configuração**

Mudar depois: ícone da extensão → **⚙️**.

---

## 5. Como usar

**Ícone sobre o vídeo:** passe o mouse e clique no botão azul.
- Modo *perguntar*: abre o cartão com a pasta + nativa / 1080p / 720p / áudio + **baixar todos**
- Modo *salvar direto*: baixa na hora (`Alt`/`Shift` + clique abre o menu)

**Popup:** pasta atual, qualidade, lista de vídeos **com miniatura**, **⟳** (atualizar) e **Baixar todos**.
`Shift + clique` no ⟳ recarrega a página.

**Botão direito** em qualquer vídeo → *Baixar vídeo na Qualidade Nativa — NOÉ VFX*.

---

## 6. Conteúdo autenticado e compatibilidade

| Situação | Como a ferramenta trata |
|---|---|
| Vídeo aberto na página | encontra o stream que o player já carrega |
| Vídeo atrás do **seu próprio login** | usa a sessão que você já tem aberta (cookies do seu navegador) |
| Qualidade | a melhor que o player oferece, ou 1080p / 720p / somente áudio |
| HLS / DASH / MP4 / WebM | suportados |
| Conteúdo protegido por **DRM** | **não** é suportado — a ferramenta não contorna proteções |
| Assinatura de terceiros | **não** é contornada: o acesso é sempre o que você já possui |

O download é feito pelo `yt-dlp` no seu computador, com retentativas e
fragmentos paralelos para ser rápido e estável. A sessão usada é a sua: a
ferramenta não cria acesso, não quebra login e não ignora assinatura.

> Use apenas com conteúdo que você tem o direito de salvar. Veja `TERMS.md`.

---

## 7. Problemas e soluções

| Sintoma | Solução |
|---|---|
| Selo **Offline** no popup | Rode o instalador de novo, ou reinicie o computador |
| Nenhum vídeo detectado | Dê **play** no vídeo e clique em **⟳** |
| Erro de FFmpeg | Rode o instalador novamente (a união de vídeo+áudio depende dele) |
| Vídeo privado / login | Confira **Usar os cookies do navegador** ligado |
| Erro 403 / Forbidden | Atualize o yt-dlp (`yt-dlp -U`) ou rode o instalador |
| Extensão desapareceu | `chrome://extensions` → **Atualizar** no cartão |
| "Pasta em Uso" ao apagar a pasta extraída | Um programa está com ela aberta; feche a janela do servidor/terminal |

**Logs:**
- Windows: `%LOCALAPPDATA%\NoeVFXDownloader\server.log`
- macOS/Linux: `/tmp/noevfx-downloader.log`

---

## 8. Desinstalar

**Windows:** `windows\DESINSTALAR_NOEVFX.bat`
**macOS/Linux:** `bash desinstalar-noevfx.sh`

Depois, no navegador: `chrome://extensions` → **Remover** no cartão da extensão.
Os vídeos baixados **não** são apagados.

---

## 9. Estrutura do pacote

```
noevfx-downloader/
├─ COMECE-AQUI.txt        instruções rápidas
├─ MANUAL.md              este manual
├─ README.md              resumo técnico
├─ windows/
│  ├─ INSTALAR_NOEVFX.bat
│  ├─ DESINSTALAR_NOEVFX.bat
│  ├─ extension/          a extensão (é esta pasta que o navegador carrega)
│  └─ server/server.py    servidor local (Python puro)
├─ mac/
│  ├─ instalar-noevfx.sh
│  ├─ desinstalar-noevfx.sh
│  ├─ extension/
│  └─ server/server.py
└─ linux/
   ├─ instalar-noevfx.sh
   ├─ desinstalar-noevfx.sh
   ├─ extension/
   └─ server/server.py
```

Cada pasta de sistema é autocontida: dá para enviar só a do sistema da pessoa.

---

## 10. Situação dos testes (transparência)

| Item | Status |
|---|---|
| Instalação no Windows | ✅ executada e validada |
| Servidor local (Windows) | ✅ testado (`/health`, `/config`, `/download`, `/thumb`) |
| Extensão no Edge | ✅ badge vermelho, ícone no vídeo, popup, download salvando arquivo |
| Instalação no macOS | ⚠️ escrita seguindo o padrão, **não executada em um Mac real** |
| Instalação no Linux | ⚠️ escrita seguindo o padrão, **não executada em uma distro real** |

Se algo falhar no Mac/Linux, me envie a saída do terminal — o ajuste é rápido.
