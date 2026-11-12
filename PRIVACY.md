# Política de Privacidade — Noe VFX Downloader

**Última atualização:** 12 de novembro de 2026
**Responsável:** NOÉ VFX — https://noevfx.com

---

## Resumo

O Noe VFX Downloader **não coleta, não transmite e não vende dados pessoais**.
Tudo funciona na sua máquina: a extensão conversa apenas com um servidor local
(`127.0.0.1`) instalado por você.

---

## 1. Quais dados a extensão acessa

Para conseguir detectar e baixar vídeos, a extensão precisa acessar:

| Dado | Por quê | Para onde vai |
|---|---|---|
| **URL da aba ativa** | identificar a página e o player | enviada apenas ao servidor local (`127.0.0.1:8765`) |
| **Título da página** | nomear o arquivo baixado | idem |
| **Cookies do site visitado** | baixar conteúdo que exige login (ex.: assinatura, área de membros) | idem, gravados em arquivo temporário e apagados ao fim do download |
| **URLs de mídia** (`.m3u8`, `.mpd`, `.mp4`, `.webm`) | detectar os streams da página | idem |
| **User-Agent e Referer** | sites que bloqueiam download exigem esses cabeçalhos | idem |
| **Miniaturas/pôster do vídeo** | mostrar o preview na lista | ficam só na memória do navegador |

**Não são acessados:** histórico de navegação, senhas, dados de formulários,
conteúdo de e-mails, abas em segundo plano, localização.

---

## 2. Para onde vão os dados

- **Servidor local**: `http://127.0.0.1:8765` — roda no seu próprio computador.
  Ele só aceita pedidos vindos da extensão (ID fixo) e com endereço local.
- **Detecção de vídeos**: a extensão observa os pedidos de mídia de **todas as abas** (para achar
  os streams) e lê o título, o endereço e a miniatura da página. Isso fica só no navegador e no
  servidor local. A miniatura (og:image/pôster) é carregada do próprio site do vídeo.
- **Instalação e atualização**: o instalador e o servidor baixam o yt-dlp, o FFmpeg, o Deno e o
  Python do GitHub/gyan.dev/PyPI (com checagem de integridade). O yt-dlp consulta o GitHub
  1x por dia para se atualizar.
- **Ferramentas de download**: o servidor local chama o `yt-dlp` e o `ffmpeg`
  instalados na sua máquina para baixar o vídeo diretamente do site de origem.
- **Nenhum servidor da NOÉ VFX** é contatado durante o uso. Não há analytics,
  telemetria, rastreamento, conta ou login.

---

## 3. O que fica salvo no computador

| Onde | O quê |
|---|---|
| `%LOCALAPPDATA%\NoeVFXDownloader\server\config.json` (Windows) ou `~/.local/share/NoeVFXDownloader/...` | pasta padrão de downloads, qualidade, preferências |
| `chrome.storage.local` | tema, posição do ícone por site, última configuração conhecida |
| `chrome.storage.session` | lista de streams detectados na aba (apagada ao fechar a aba) |
| Pasta escolhida por você | os vídeos baixados |

Nada disso sai do computador. Para apagar, remova a pasta do programa
(`DESINSTALAR_NOEVFX.bat` / `desinstalar-noevfx.sh`) — os vídeos baixados não são tocados.

---

## 4. Cookies

Os cookies são lidos **apenas dos sites que você está visitando no momento** e
enviados **somente** ao servidor local, para que o download funcione em conteúdo
autenticado. Eles são gravados em um arquivo temporário, usado pelo `yt-dlp`
durante o download e **apagado logo em seguida**. Nenhum cookie é armazenado
permanentemente nem enviado para a internet pela extensão.

Se preferir, desligue em **Configurações → Usar os cookies do navegador**.

---

## 5. Compartilhamento com terceiros

Não há compartilhamento. O download em si é feito pelo `yt-dlp`, que acessa
diretamente o site de onde o vídeo vem — do mesmo jeito que o seu navegador faria.

---

## 6. Crianças

A ferramenta não é direcionada a menores de 13 anos e não coleta dados de
nenhum usuário.

---

## 7. Alterações nesta política

Mudanças relevantes serão publicadas neste arquivo, no repositório
https://github.com/noevfx/Extensions, com a data de atualização.

---

## 8. Contato

Dúvidas sobre privacidade: **https://noevfx.com** ou abra uma issue em
https://github.com/noevfx/Extensions/issues
