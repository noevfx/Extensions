# Changelog

Todas as mudanças relevantes do Noe VFX Downloader.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) ·
versionamento [SemVer](https://semver.org/lang/pt-BR/).

---

## [3.0.16] — 2026-11-13

### Corrigido
- **Pinterest logado, ícone no vídeo do pin aberto:** o ícone mostrava "não achei o link deste pin" e não baixava (o botão do popup
  baixava normal). No Pinterest logado o vídeo do pin aberto não fica dentro do bloco `CloseupMainPin` (o bloco de "relacionados"
  envolve a página toda) e o pôster dele não traz o código do vídeo, então a extensão não achava nem o link nem o stream. Agora o
  **vídeo grande da página de um pin é o próprio pin** (o maior vídeo da tela, com 380 px ou mais de largura), em qualquer layout.
  Vídeos pequenos de cartões continuam usando o link do cartão ou o stream pelo código do pôster.

### Como foi testado
- Reproduzido no Edge do Eduardo (Pinterest logado): clicar em "Baixar na pasta padrão" no ícone mostrava o aviso.
- Teste novo no navegador de teste com esse layout (vídeo grande dentro de `relatedPins`, sem `CloseupMainPin`, pôster sem código,
  sem links): o ícone pede o pin da página. 54 checagens ao todo; 34 testes do servidor.

---

## [3.0.15] — 2026-11-13

### Corrigido
- **Pinterest, ícone no feed:** na 3.0.13/3.0.14 o ícone sobre um vídeo do feed mostrava "não achei o link deste pin" (o Pinterest não põe
  link nos cartões quando você não está logado) e não baixava nada. Agora o vídeo se reconhece pelo **hash do pôster** e a extensão
  usa o stream que o próprio player pediu (a playlist HLS principal): o ícone **baixa**, e o popup lista cada vídeo do feed com a
  **miniatura dele**. Quando o cartão tem link de pin, continua usando o pin. A busca do link também ficou mais flexível (sobe a partir
  do vídeo, sem pegar o link do cartão vizinho).
- O arquivo de um vídeo do feed sem link sai como `Vídeo do Pinterest [código].mp4` (antes: o código do arquivo).

### Mudou
- **Pasta padrão = `NoeVFX` dentro da pasta de Vídeos do usuário**, em qualquer sistema: Windows `Vídeos` (pelo próprio sistema, vale
  se foi movida ou está no OneDrive), macOS `Filmes`, Linux `Vídeos` (xdg). Antes o Windows usava `Downloads` e a tela dizia
  "Downloads/NoeVFX" mesmo no Mac/Linux, onde salvava em Filmes/Vídeos. Quem já escolheu uma pasta mantém a dela; o botão **Usar a pasta
  padrão do sistema** vai para a nova.

### Como foi testado
- Navegador de teste: 52 checagens (inclui cartão sem link no Pinterest: o ícone pede a playlist principal do vídeo); 34 testes do servidor.
- Pinterest real (sem login): o ícone sobre um vídeo do feed baixou o vídeo (h264 + aac, 720x1280) com o nome certo.

---

## [3.0.14] — 2026-11-13

### Novo
- **Botão "Verificar atualizações":** a extensão em modo desenvolvedor não se atualiza sozinha, então o servidor local faz o trabalho.
  Ao abrir o popup ele checa (em silêncio) a última release do GitHub; clicar na **versão no rodapé** ou em *Verificar atualizações*
  nas Configurações força a checagem. Havendo versão nova, **Atualizar agora** baixa o zip da release (só de
  `github.com/noevfx/Extensions`), **confere o SHA-256**, guarda cópia da versão atual em `_backups\v<versão>`, troca `extension\` e
  `server\server.py`, reinicia o servidor e recarrega a extensão. Não atualiza com download em andamento nem a pasta de
  desenvolvimento. Rotas novas: `GET /update/check`, `POST /update/apply`.
- Documentação: seção **Plataformas testadas** (README, manual rápido e completo; X confirmado no uso real, Facebook ainda em ajuste) e seção **Atualizar** reescrita.

### Como foi testado
- Navegador de teste: 50 checagens ao todo (inclui clicar na versão do popup e ver o resultado); 33 testes do servidor.
- Atualização de verdade testada: instalação falsa 3.0.11 → servidor real → release v3.0.12 do GitHub (SHA-256 conferido) → arquivos
  trocados, backup criado, servidor reiniciado na mesma porta já na 3.0.12.
- X confirmado pelo Eduardo no uso real. **Facebook ainda não** funcionou no feed dele: fica para a próxima revisão.
- **Atenção:** quem está numa versão anterior à 3.0.14 não tem o botão: a primeira atualização é pelo instalador do zip novo.

---

## [3.0.13] — 2026-11-13 (só local; entra na 3.0.14)

### Novo
- **Pinterest:** a página de um pin carrega dezenas de vídeos de pins relacionados, e a extensão listava todos como "Pin em ..."
  (sem miniatura e com o mesmo nome). Agora cada pin é **um item**, com o **link do pin**, a **miniatura certa** e o **nome do pin**
  (vindos da API pública do próprio Pinterest). HLS e MP4 soltos de `pinimg.com` não entram mais na lista.
- **Pin com vários vídeos (carrossel):** o yt-dlp falha nesse caso ("No video formats found"). O servidor agora pergunta à API do
  Pinterest, pega **todos os vídeos do pin** (MP4 de preferência; story pin usa o HLS) e salva cada um como
  `Nome do pin (1 de 2) [ID].mp4`. Antes o nome saía como `Pinterest video #ID` ou o código do arquivo.

### Como foi testado
- Navegador de teste com mouse de verdade (pin aberto com carrossel só de imagens no DOM, cartões relacionados com e sem link,
  HLS/MP4 de `pinimg.com` na rede): 48 checagens ao todo; 32 testes do servidor.
- Pinterest real: o pin com 2 vídeos baixou os 2 (h264, 720x960); o pin de vídeo único baixou com áudio; os dois aparecem
  como um item só, com a miniatura do próprio vídeo.
- **Limite:** no feed (sem pin aberto) o link do pin vem do cartão; sem estar logado o Pinterest não põe link nos cartões, então
  vídeo de feed sem link não vira item (abra o pin e baixe de lá; o ícone avisa).

---

## [3.0.12] — 2026-11-13

### Novo
- **X (Twitter):** o vídeo vem em pedaços de `video.twimg.com` (a lista mostrava 44 "(1) Página Inicial / X" sem miniatura, e o arquivo
  baixado era um pedaço de 1 KB). Agora cada vídeo é **um item**, com o **link do tweet** (`/usuario/status/ID`, pelo link da data),
  **miniatura própria** (um quadro do vídeo) e nome (usuário + texto). O download é pelo tweet: o yt-dlp junta vídeo e áudio e pega
  **todos os vídeos do tweet** (foto sem vídeo é ignorada). Mensagens claras: "esse tweet não tem vídeo" e "exige login".
- **Facebook:** idem. Cada vídeo da timeline/Watch/Reels vira um item com o link do **vídeo/reel** (`/pagina/videos/ID`, `/reel/ID`,
  `/watch/?v=ID`, `/share/v/…`, ou o post), miniatura própria e nome; pedaços de `fbcdn.net` não entram mais na lista.
- Pedaços de `twimg.com` e `fbcdn.net` nunca entram na lista nem servem de plano B.

### Como foi testado
- X e Facebook: teste no navegador com mouse de verdade que reproduz a estrutura (vídeo `blob:` fundo no `article`, link da data, vários
  links no cartão, pedaços no CDN): 40 checagens ao todo, 31 no servidor. No servidor real: vídeo público do Facebook baixado
  (h264 + aac) e tweet sem vídeo reconhecido.
- **Não** foi visto em timeline real de X/Facebook logado (precisa de login); se o link do vídeo não for achado, a extensão avisa
  em vez de baixar o pedaço errado.

---
## [3.0.11] — 2026-11-13

### Corrigido
- **Vimeo: 20 "streams" na lista para um único vídeo.** O Vimeo entrega o vídeo em **faixas de bytes** e a faixa vai codificada no próprio
  endereço (`/v2/range/prot/<faixa>/avf/arquivo.mp4`): um pedido por faixa. No vídeo real conferido eram 13 URLs `.mp4` para só 4
  arquivos, e cada uma aparecia como um item. Agora pedidos por faixa (`/range/prot/`, `bytestart`/`byteend`) **não entram na lista** e
  nunca servem de plano B. Sem eles, o vídeo aparece pela **página** (um item só) ou pelo HLS, quando existe.
- Teste novo no navegador (faixas de bytes não viram itens) e no servidor: 30 + 29 checagens.

---
## [3.0.10] — 2026-11-13

### Corrigido
- **G1: o mesmo vídeo aparecia 2 vezes** (uma pelo player, `/v/ID/`, e outra pelo stream HLS que o player puxa, `…/ID.m3u8`). Agora
  os dois viram **um item só** (o do player, que é o mais confiável), no popup e no número do ícone. Matéria com 2 vídeos = 2 itens.
- Vimeo com **DRM**: o manifesto criptografado não entra mais na lista nem serve de plano B (incluso nesta versão; o vídeo em si
  continua sem poder ser baixado).
- Teste novo `tests/popup_group.js` (o caso real do G1: 4 itens viram 2).

---
## [3.0.9] — 2026-11-13

### Corrigido
- **Vídeos com DRM no Vimeo (ex.: Vimeo Originals):** a lista mostrava o manifesto criptografado (`.../drm/cenc/playlist.mpd`) como se
  desse para baixar e o usava de plano B. Agora esses itens **não entram mais na lista** e nunca são plano B. O vídeo em si continua sem
  poder ser baixado (o Vimeo entrega só versões criptografadas, que nenhum programa baixa) e a mensagem diz isso.

---
## [3.0.8] — 2026-11-13

### Novo
- **Instagram: carrossel baixa TODOS os vídeos do post** (antes só o 1º). As **fotos do carrossel são ignoradas** (o yt-dlp pula os
  itens sem vídeo e segue para o próximo). Conferido no carrossel real de 14 itens: 1 vídeo salvo, 13 fotos ignoradas.
- **Vimeo:** `vimeo.com/ID` agora é baixado pelo **player** (`player.vimeo.com/video/ID`) com o Referer do site — o yt-dlp recusa a
  página sem login, mas aceita o player. Conferido no servidor com vídeo real (baixou sem login). Vídeos com **DRM** (criptografia
  do próprio Vimeo, como o 76979871) não têm como baixar: a mensagem agora diz isso.
- **Qualquer site com player `blob:`** (Vimeo e muitos outros) e sem URL de arquivo: o vídeo entra na lista pelo **endereço da
  página** (que o yt-dlp resolve) com o quadro do próprio vídeo de miniatura. Só quando não há um stream de rede válido.
- Player em **iframe**: o Referer do download passa a ser o da página que embute o player.

### Corrigido
- Pedaços de DASH/HLS (`segment.mp4`, `init.mp4`, `frag-1.m4s`…) não entram mais na lista e nunca servem de "plano B": no
  Vimeo isso gerava um arquivo-lixo de poucos segundos marcado como concluído.
- Download de post do Instagram com fotos no meio não faz mais uma 2ª tentativa à toa nem mostra erro antigo.
- Testes: 28 do servidor (regras de Vimeo, Instagram e extrator genérico) e 28 no navegador (`tests/e2e_sites.js`).

---
## [3.0.7] — 2026-11-13

Corrigido a partir de testes em **sites reais** (G1, TikTok, YouTube, Instagram e uma página HTML5 comum), não só em simulação.

### Corrigido
- **Instagram: não detectava e dava "endereço não suportado".** No Instagram real o `<video>` fica **20 a 30 níveis** dentro do
  `<article>` do post; a busca do link parava em 14. Agora procura no `<article>` inteiro, usa o link da **data** do post
  (`/p/CÓDIGO/`) e ignora links que não são o post (`/reels/audio/…`). Conferido no feed real: 4 de 4 vídeos com o link certo
  e a miniatura (um quadro do próprio vídeo); download de 2 posts reais pelo servidor, 1080p, com áudio quando o post tem.
  O vídeo entra na lista mesmo antes de a miniatura estar pronta (ela chega depois).
- **G1: o único download que funcionava era de um vídeo sem relação.** A extensão listava como "da página" qualquer bloco com
  `data-video-id`, inclusive cartões de "veja também". Agora só entram players que têm um `<video>` de verdade.
- **G1 ao vivo (id de 6 dígitos):** o yt-dlp não entende esse id nem a URL da matéria ("0 itens", terminava sem arquivo). Agora a
  extensão baixa pela **playlist HLS principal** que o player pediu, e o servidor força o **extrator genérico** em URLs que já são
  arquivo/playlist de mídia (`.m3u8`, `.mpd`, `.mp4`…): o extrator de matérias da Globo "sequestrava" qualquer `*.globo.com`
  (inclusive `video.globo.com`) e quebrava com `'NoneType' has no attribute 'strip'`, mesmo com o HLS respondendo 200.
- No popup, dentro de um grupo HLS vale a **playlist principal**, não a de uma qualidade só (`…-video=1320960.m3u8`).
- **TikTok:** itens de lixo da tela de login (`ttwstatic.com`, `playback1.mp4`) não entram mais na lista. Conferido ao vivo:
  vídeo listado com miniatura própria, download 1080x1920 de 70 s com áudio.
- Mensagem mais clara quando o yt-dlp não acha nada ("dê play no vídeo, espere carregar e baixe pelo ícone").
- Aviso próprio quando, no Instagram, não é possível achar o link do post (em vez de mandar a URL do feed).

### Novo
- `tests/real_site.js` (site real com extensão + servidor + yt-dlp + ffprobe) e `tests/dl_url.js` (baixa uma URL pelo servidor
  e confere o arquivo). `tests/e2e_sites.js` agora cobre também vídeo muito fundo no `<article>`, cartão "veja também" e G1 ao vivo (26 checagens).

### Limitações conhecidas
- Transmissão **ao vivo** grava até você cancelar; ao cancelar, o yt-dlp não guarda o trecho parcial.
- Carrossel do Instagram: baixa o **primeiro** vídeo do post.
- Instagram/TikTok pedem login para alguns conteúdos: entre na conta no navegador e deixe os cookies ligados.

---
## [3.0.6] — 2026-11-13

Comportamento **igual em todos os sites** (Instagram, TikTok, G1 e qualquer outro): ícone, lista, miniatura e download.

### Corrigido
- **O ícone não aparecia no Instagram, no G1 e em vários players.** Ele dependia de o mouse estar *exatamente sobre* o `<video>`,
  mas esses sites cobrem o vídeo com camadas (ou o vídeo é vertical e estreito dentro de uma moldura preta larga). Agora a
  extensão acha o vídeo pela **posição do ponteiro** (inclui a moldura do player e players dentro de *shadow DOM*).
- **Instagram: baixava arquivos sem extensão e que não abriam** (`AQMgw4PN-...`). Eram *pedaços* do CDN (vídeo e áudio
  separados, `bytestart/byteend`). Agora esses pedaços **não entram mais na lista** (Instagram, Facebook e TikTok) e cada
  vídeo é baixado pela **URL do post** (`/p/…`, `/reel/…`), pelo yt-dlp, com áudio e vídeo juntos.
- **Miniatura repetida em todos os itens.** A miniatura da *página* era copiada para todos os vídeos da lista. Agora cada vídeo
  tem a **sua** miniatura (um quadro do próprio vídeo); a da página só vale quando a aba tem um único vídeo, e um player que
  ainda não carregou fica sem imagem em vez de mostrar a de outro vídeo.
- **Lista e miniatura presas na primeira página (TikTok, Instagram, YouTube...).** Sites de página única trocam de vídeo sem
  recarregar a aba. A extensão agora percebe a troca de endereço, **zera a lista da aba** e lê o vídeo novo.
- **G1 (várias matérias/players na página): baixava um vídeo diferente do que você apontou.** Agora o ícone baixa o vídeo
  **do player apontado** (pelo `data-video-id`) e não o primeiro da página.
- Item que carregava **depois** da primeira varredura ficava sem miniatura para sempre; agora é atualizado.

### Novo
- O vídeo que está **tocando** (ou à vista) aparece **primeiro** na lista.
- O **popup se atualiza sozinho** enquanto está aberto (troca de vídeo, player que carrega depois, mudança de endereço).
- Teste novo `tests/e2e_sites.js` (navegador real, mouse de verdade): feed estilo Instagram, TikTok com troca de vídeo,
  matéria estilo G1 e player em shadow DOM (24 checagens).

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
