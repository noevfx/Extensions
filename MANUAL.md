# Noe VFX Downloader 3.0.14 — Manual rápido

**Site:** https://noevfx.com · **Navegadores:** Chrome, Edge, Brave, Opera, Vivaldi · **Sistemas:** Windows, macOS, Linux

> 📖 O **manual completo, com todas as telas**, está no GitHub:
> https://github.com/noevfx/Extensions/blob/main/docs/MANUAL-DE-USO.md

## Instalar (3 passos)

1. **Extraia** o ZIP inteiro (a versão está no nome do arquivo e no `VERSION.txt`). A pasta extraída serve só para instalar.
2. Rode o instalador do seu sistema (ele faz tudo sozinho: Python, yt-dlp, FFmpeg e Deno; sem senha de administrador):

| Sistema | Pasta | Como |
|---|---|---|
| Windows | `windows\` | duplo clique em `INSTALAR_NOEVFX.bat` |
| macOS | `mac\` | botão direito em `INSTALAR-MAC.command` → **Abrir** (só na 1ª vez) |
| Linux | `linux/` | `bash instalar-noevfx.sh` |

3. No final abre um **guia** no navegador: ligue o **Modo do desenvolvedor** em `chrome://extensions` e
   **ARRASTE a pasta `extension`** (o Explorer/Finder já abre com ela selecionada) para a página de extensões.
   Ou use "Carregar sem pacote", cole o caminho (a pasta acima, já copiado), entre nela, clique 1x em `extension` e
   "Selecionar pasta". Sempre a pasta **instalada**, nunca a do ZIP.

Pasta instalada: Windows `%LOCALAPPDATA%\NoeVFXDownloader` · Mac/Linux `~/.local/share/NoeVFXDownloader`.

## Usar

- Passe o mouse sobre o vídeo → **ícone azul** → escolha a qualidade.
- Ou clique na extensão (popup): lista tudo que a página carrega; **Baixar** em cada vídeo ou **Baixar todos**.
- Ou botão direito → *Baixar vídeo na qualidade nativa*.
- No primeiro uso a extensão pergunta a **pasta** onde salvar (muda depois na engrenagem ⚙).

## Plataformas testadas

| Plataforma | O que funciona |
|---|---|
| **YouTube** | botão Baixar no player e item no popup, na melhor qualidade, com áudio |
| **Instagram** | posts e reels; **carrossel: baixa todos os vídeos** (fotos ignoradas); cada vídeo com a própria miniatura |
| **TikTok** | um item por vídeo, com miniatura e nome certos; a lista se atualiza ao rolar o feed |
| **Facebook** | vídeo público baixa pelo link do vídeo/Reel; **no feed ainda não está confirmado** (em ajuste) |
| **X (Twitter)** | um item por tweet com vídeo (testado no feed real); baixa **todos os vídeos do tweet** |
| **Pinterest** | um item por pin, com o nome do pin; **pin com vários vídeos baixa todos** |
| **Vimeo** | vídeos públicos e embutidos em outras páginas |
| **G1 / Globoplay** | o vídeo da matéria (sem confundir com os "veja também"); transmissão ao vivo grava a partir do HLS |
| **Sites comuns** | players com MP4, HLS (.m3u8) e DASH; players embutidos (iframe) de cursos |

**O que não baixa:** vídeo protegido por DRM (Netflix, Disney+ e vídeos Vimeo/Globo marcados como protegidos), conteúdo privado sem login e transmissão ao vivo cancelada no meio (perde o parcial). Para conteúdo que exige login, entre na sua conta no navegador e deixe os cookies ligados nas Configurações.

**Ainda em ajuste:** o feed do Facebook (o X já foi confirmado no uso real). Se algum item vier sem miniatura ou com o arquivo errado, mande o print e o link do post.

## Problemas

| Sintoma | Solução |
|---|---|
| "Servidor local offline" | rode o instalador de novo |
| Vídeo sem áudio | confira o selo **FFmpeg** nas configurações; rode o instalador |
| Extensão sumiu / cinza | você apagou a pasta de onde carregou: carregue a pasta **instalada** |
| Qualquer outra coisa | Configurações → **Copiar diagnóstico** e mande para quem te passou o app |

**Atualizar:** clique na **versão no rodapé do popup** (ou em *Verificar atualizações* nas Configurações); se houver versão nova, **Atualizar agora** baixa, confere o SHA-256 e troca tudo sozinho (a partir da 3.0.14). Pelo instalador também vale: rode o do ZIP novo e clique em **Recarregar** na extensão.
**Desinstalar:** `DESINSTALAR_NOEVFX.bat` / `bash desinstalar-noevfx.sh`; depois **Remover** a extensão.

Use apenas com conteúdo que você tem o direito de salvar. O app **não** contorna DRM, login, assinatura
nem bloqueio de região. Zero telemetria.
