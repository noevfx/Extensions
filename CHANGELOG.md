# Changelog

Todas as mudanças relevantes do Noe VFX Downloader.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) ·
versionamento [SemVer](https://semver.org/lang/pt-BR/).

---

## [3.0.5] — 2026-11-13

### Alterado
- **O zip agora leva a versão no nome**: `noevfx-downloader-3.0.5.zip` (antes era sempre `noevfx-downloader.zip` e não dava
  para saber qual versão era). O pacote também traz um `VERSION.txt`, e o build deixa na `dist\` só o zip da versão atual.
- **Guia do navegador redesenhado**: passos numerados, ilustração de "arrastar a pasta `extension` do Explorer/Finder para a
  página de extensões" e a alternativa do botão "Carregar sem pacote" explicada (com o aviso de não colar o caminho da própria
  `extension`).
- **Documentação atualizada** para o fluxo novo (manual com telas, README, COMECE-AQUI e MANUAL.md); seção de instalação
  do manual reescrita (atualizar por cima, último passo da extensão).

---
## [3.0.4] — 2026-11-13

### Corrigido
- **Desinstalar + instalar não trocava a versão:** um servidor antigo iniciado à mão continuava rodando e
  **segurava a porta 8765**; o instalador novo dizia "servidor online" porque quem respondia era o antigo. Agora:
  - o **instalador** encerra qualquer servidor do Noe VFX que esteja escutando na porta (confere pelo `/health`
    que é nosso) e **só diz "online" quando o servidor responde já na versão recém-instalada** (senão tenta de
    novo e avisa); vale para Windows, Mac e Linux;
  - os **desinstaladores** também encerram esse servidor e avisam se algo ficou rodando ou em uso.
- **Passo da extensão:** colar o caminho da pasta `extension` no seletor abria *dentro* dela, onde não há nada para
  selecionar. Agora o instalador copia o caminho da **pasta acima**, abre o **Explorer/Finder com `extension` já
  selecionada** (é só arrastar para a página de extensões) e o guia explica as duas formas.

---
## [3.0.3] — 2026-11-12

### Corrigido
- **YouTube: a lista de vídeos do popup ficava vazia ("0 vídeos detectados") e sem miniatura** quando o
  endereço era o puro `watch?v=...` (o vídeo só entrava na lista se a URL tivesse algo a mais). Agora o
  vídeo do YouTube **sempre** aparece, com miniatura, e a lista **troca junto** quando você muda de vídeo
  dentro do YouTube (antes ficava o vídeo anterior). Shorts, lives e embeds também são reconhecidos.

---
## [3.0.2] — 2026-11-12

### Corrigido
- **As consultas de leitura da extensão eram recusadas (403) pelo servidor novo.** O Chrome só envia o
  cabeçalho `Origin` nos POST; um GET feito pela extensão (configuração, andamento do download,
  miniaturas) chegava sem ele. Efeitos: o popup mostrava "Defina a pasta" mesmo configurado, o andamento
  do download não aparecia (avisava "servidor offline" com o download funcionando) e não havia miniaturas
  geradas pelo servidor. Os downloads em si (POST) funcionavam. Agora a **leitura** aceita o cabeçalho
  `X-NoeVFX-Client` (com `Host` local); **escrever e executar** continua exigindo o ID da extensão.
- Teste ponta a ponta agora confere a configuração e o andamento do download pela extensão.

### Adicionado
- **Manual de uso com telas** em `docs/MANUAL-DE-USO.md` e gerador das telas (`tools/capturar-telas.js`).

---
## [3.0.1] — 2026-11-12

Revisão completa de segurança, confiabilidade e instalação.

### Corrigido (era o que acontecia com os amigos)
- **Vídeo "sem áudio" e m4a com erro:** o servidor achava o FFmpeg procurando em várias pastas, mas
  nunca dizia ao yt-dlp onde ele estava. Sem enxergar o FFmpeg, o yt-dlp deixava vídeo e áudio em
  arquivos separados e o "só áudio" falhava (`ffprobe and ffmpeg not found`). Agora o servidor
  **testa se o FFmpeg executa**, passa `--ffmpeg-location` e o PATH certo ao yt-dlp e, se algo ainda
  falhar, **refaz sozinho em formato único** (com áudio), limpando os pedaços soltos.
- **Segundo download na mesma página não fazia nada** e o botão de download do YouTube nunca
  funcionava (uma variável escondia a função de tradução).
- O download só vira "concluído" se o arquivo realmente existir; erros comuns aparecem em português.
- Player embutido em iframe (Hotmart e similares): o yt-dlp usa o **Referer do iframe** que pediu o stream.
- Lives gravadas: unir vídeo+áudio de horas não é mais interrompido por "sem resposta".

### Segurança
- O servidor só aceita a **extensão com ID fixo** (chave no `manifest.json`) e `Host` local
  (bloqueia DNS rebinding, outras extensões, sites e processos que fingem ser a extensão).
- `extra_args` não vem mais do pedido de download e só aceita **opções seguras do yt-dlp**
  (nada de `--exec`, `-o`, `--config`...); o yt-dlp roda com `--ignore-config`.
- Corrigida injeção de comando no seletor de pasta (aspas tipográficas no caminho) e o
  `open-folder` só abre pastas, nunca arquivos.
- Painel da extensão em Shadow DOM **fechado**; cliques fabricados pela página não baixam nada.
- Limites: corpo (2 MB), fila (60), memória de jobs, cache de miniaturas, miniatura só por http(s)
  e sem `file:`; cookies sanitizados e apagados também após queda.
- Mensagens de configuração/pasta só são aceitas das páginas da própria extensão.
- Permissões `tabs` e `activeTab` removidas (a permissão de host já cobre).

### Adicionado
- **Instaladores automáticos** (Windows em PowerShell; Mac/Linux em bash): instalam Python (portátil se
  faltar), yt-dlp com SHA-256, FFmpeg, Deno (YouTube) e o serviço, sem administrador/sudo; log em
  `install.log`; podem rodar de novo para atualizar. Mac: `INSTALAR-MAC.command` (duplo clique).
- **yt-dlp se atualiza sozinho** (1x/dia, só o instalado por nós).
- Detecção também pelo **Content-Type** (vídeo/áudio sem extensão na URL), mais extensões (mkv, flv)
  e mais players embutidos reconhecidos.
- **Cancelar download** e barra de progresso no popup; downloads repetidos são deduplicados.
- Aviso de versão: a extensão avisa se o app local está desatualizado ou recusou a extensão.
- Testes: `tests/test_server.py` (stdlib) e `tests/e2e.js` (Edge/Chrome via CDP, com mouse real).

### Removido
- Todo o material de **loja** (Edge Add-ons / Chrome Web Store): pasta `store/`, `docs/STORE.md`, o zip
  da loja e o script `build-store-zip.py`. O projeto é de **uso próprio e de amigos**, distribuído só
  pelo `noevfx-downloader.zip` e pelos instaladores.

### Visual e instalação
- Popup mais equilibrado: botão principal + 3 opções iguais (1080p / 720p / só áudio), fonte única em
  todos os botões, ícone de play nas miniaturas, barra de progresso e botão Cancelar.
- Configurações: botão **Copiar diagnóstico** (relatório curto para colar na conversa quando algo falha).
- O instalador abre um **guia visual** no navegador (caminho já preenchido, botão Copiar, detecta
  Chrome/Edge/Brave e Mac). Se existir `store-url.txt` ao lado do instalador, abre a página da loja.
- **CI** (`.github/workflows/test.yml`): roda o instalador de verdade em Windows, macOS (Apple e Intel) e
  Linux (x64 e ARM), com Python do sistema e portátil, e confere um download real com vídeo + áudio.
- Corrigido: "só áudio" falhava em vídeos que já vêm com áudio e vídeo juntos (maioria dos HLS/MP4).

### Desempenho
- `/health` não bloqueia mais (o `yt-dlp --help` era ~1,25 s); popup carrega em paralelo;
  miniaturas em paralelo (3) e com cache de falhas; badge só repinta a aba alterada;
  miniatura enviada uma vez por aba.

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
