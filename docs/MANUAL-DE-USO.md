# Do vídeo ao seu projeto

**Manual 3.2.0** · [Versão ilustrada e interativa](https://noevfx.github.io/noevfx-downloader/) · [Downloads](https://github.com/noevfx/noevfx-downloader/releases)

Encontre referências no navegador e envie ao Premiere ou After Effects. Recebeu links do cliente? Cole no painel e continue editando. Uma playlist de músicas também pode virar uma seleção de áudios.

> As telas usam as interfaces do produto com dados demonstrativos. Consulte Releases para saber qual versão está publicada; código e manual novos não são, por si só, uma atualização disponível.

## 1. Instale e conecte

1. Baixe a edição desejada e extraia o ZIP inteiro.
2. Windows: abra `windows/INSTALAR_NOEVFX.bat`. macOS: `mac/INSTALAR-MAC.command`. Linux: `bash instalar-noevfx.sh` na pasta linux.
3. Siga o guia do instalador para carregar a pasta **extension instalada** no navegador.
4. Abra o popup e confira **Online**. Defina a pasta dos downloads comuns.
5. Em **for Editors**, feche e abra Premiere/After Effects e salve seu projeto numa pasta do trabalho.

A extensão é para **Chromium**: Chrome, Edge, Brave, Opera, Vivaldi e compatíveis. Os exemplos usam o Edge; Firefox e Safari não usam este pacote. O Noe VFX Downloader salva na pasta. For Editors também envia e importa no Adobe, em versões compatíveis com CEP, no Windows/macOS.

[Instalação com telas e etapas Adobe →](https://noevfx.github.io/noevfx-downloader/instalar.html)

## 2. Vi uma referência no navegador

![Player web com botão, dropdown de qualidade e destinos Adobe](https://raw.githubusercontent.com/noevfx/noevfx-downloader/main/docs/img/video-envio-3.2.0.png)

1. Passe o mouse sobre o vídeo e abra o **botão azul** do Downloader. Ele pertence à extensão, não ao site.
2. Escolha **Nativa**, **1080p** ou **720p** no dropdown.
3. Para sua pasta, use **Baixar na pasta padrão**. Para o projeto, escolha **Premiere** ou **After Effects**.
4. Acompanhe o progresso. O app prepara a compatibilidade quando necessário e o componente Adobe importa no projeto aberto.

O envio Adobe usa a qualidade escolhida nesse menu. O projeto precisa estar salvo e o componente instalado/ativo. Você pode arrastar o ícone para outra posição no player.

**No feed do TikTok:** deixe o vídeo desejado tocar e use o botão azul sobre ele. Não precisa abrir nem copiar um link individual: a extensão identifica o vídeo no próprio player.

[Experimente o menu sobre o vídeo →](https://noevfx.github.io/noevfx-downloader/navegador.html#player)

## 3. Prefiro o popup da extensão

![Popup atual com qualidade, áudio, playlist e destinos Adobe](https://raw.githubusercontent.com/noevfx/noevfx-downloader/main/docs/img/popup-editors-3.2.0.png)

Abra o ícone na barra do navegador. Use o endereço atual ou cole outro. O dropdown define a qualidade do download rápido e do envio ao Adobe.

- **Baixar o vídeo atual:** baixa só esse vídeo.
- **Só áudio · escolher formato…:** abre a seleção com esse vídeo para escolher MP3 ou outro formato.
- **Links e playlists…:** abre uma aba independente para montar uma seleção.
- **Escolher vídeos:** abre os vídeos detectados nessa página para você marcar.
- **Ver playlist deste vídeo…:** aparece em contextos reconhecidos, como vídeos do YouTube com uma playlist.

A engrenagem abre as configurações. Atualizar procura novamente os vídeos. Se nada aparecer, dê play por alguns segundos. Em feeds, prefira o botão sobre o vídeo desejado para apontar o post certo.

## 4. Links do documento ou do cliente

Cole uma lista com um endereço por linha **ou vá colando um link após o outro**. Cada colagem reconhecida vira um item separado; não precisa apertar Enter entre colagens. Links idênticos já adicionados são ignorados.

Se você digitou em vez de colar, use **Adicionar links** ou Enter. Os endereços precisam começar com `http://` ou `https://`. Confira o contador e os itens identificados. O × remove uma origem antes do download; as caixas marcam quais itens baixar.

![Seleção de links com tipo de mídia e destino](https://raw.githubusercontent.com/noevfx/noevfx-downloader/main/docs/img/varios-links-3.2.0.png)

## 5. Playlist inteira ou só alguns itens

1. Em **Links e playlists…**, cole o endereço da playlist na plataforma. No painel Adobe, use o mesmo campo de links.
2. Espere os títulos. **Ler a lista não inicia downloads.**
3. Escolha **Vídeo** e a qualidade, ou **Só áudio** e o formato.
4. Use **Selecionar todos**, **Limpar seleção** ou as caixas individuais.
5. Escolha o destino e confira o botão: por exemplo, **Baixar 3 áudios em MP3**.
6. Confirme para enviar a seleção ao app local.

![Playlist com formato MP3 e itens selecionáveis](https://raw.githubusercontent.com/noevfx/noevfx-downloader/main/docs/img/playlist-audio-3.2.0.png)

**Vídeo + playlist:** um link de vídeo do YouTube com `list=` começa como vídeo individual. Use **Ver playlist** se quiser abrir o conjunto. Uma playlist de vídeos também é diferente dos manifestos `.m3u8`/`.mpd` usados internamente por um player.

A leitura mostra até 500 itens e avisa quando há mais. A seleção aceita até 500 itens; divida listas maiores. Privados/removidos ficam desativados quando a plataforma informa a situação. Alguns erros de acesso só aparecem durante o download. Nem toda plataforma expõe suas playlists.

Playlists que exigem login dependem do acesso permitido e da sessão do navegador. O painel Adobe não lê os cookies do navegador; tente pelo navegador conectado se necessário. O app não contorna DRM ou restrições de acesso.

[Passo a passo interativo de playlists →](https://noevfx.github.io/noevfx-downloader/navegador.html#playlists)

## 6. Dentro do Premiere ou After Effects

**Cabe no seu espaço de trabalho.** O painel abre no **modo compacto**: cole os links, escolha vídeo/áudio e confirme. **Conferir seleção** expande os itens; ao ler uma playlist, a lista abre automaticamente. O botão de baixar continua perto dos controles, sem exigir rolar até o fim da lista.

Use **Modo completo** para ver todos os detalhes. **Modo compacto** recolhe de novo. A troca preserva os links, os itens marcados, a qualidade e o formato; sua preferência fica salva em cada programa.

![Painel Adobe no modo compacto](https://raw.githubusercontent.com/noevfx/noevfx-downloader/main/docs/img/painel-adobe-compacto-3.2.0.png)

![Painel Adobe atual com seleção e importação](https://raw.githubusercontent.com/noevfx/noevfx-downloader/main/docs/img/painel-adobe-3.2.0.png)

1. Abra **Janela → Extensões → Noe VFX Downloader for Editors**; o caminho pode variar conforme a versão do editor.
2. Confira o projeto reconhecido no topo e cole os links ou a playlist.
3. Marque os itens e escolha vídeo ou áudio.
4. Confira o resumo e clique em **Baixar e importar…**.
5. Acompanhe cada item até a mensagem de importação.

No painel, o destino é o projeto do próprio programa. Os arquivos ficam na pasta `_Noe VFX Downloader` do trabalho e são organizados no projeto. O app fixa o projeto de destino ao enviar a lista; mudar de projeto durante a fila não redireciona os próximos arquivos.

Download e importação são etapas distintas. Se o arquivo baixou mas não entrou no projeto, confira o aviso e a pasta do trabalho. Mantenha o projeto de destino aberto e o componente Adobe ativo para importar.

[Os dois caminhos ilustrados, com Premiere e After Effects →](https://noevfx.github.io/noevfx-downloader/manual.html)

## 7. Qualidade de vídeo e formatos de áudio

| Opção | O que você recebe |
|---|---|
| Nativa | Melhor resolução disponível entre os formatos acessíveis. |
| 1080p / 720p | Limite de resolução; não amplia um original menor. |
| MP3 | Escolha prática e amplamente compatível. Pasta ou Adobe. |
| M4A | Áudio AAC em arquivo compacto. Pasta ou Adobe. |
| WAV | Áudio sem compressão, maior. Pasta ou Adobe. |
| FLAC / Opus | Para salvar em pasta pelo navegador; não são oferecidos nos destinos Adobe. |

WAV/FLAC não recuperam qualidade perdida na plataforma. FFmpeg e ffprobe são necessários para entregar o formato escolhido. Se faltarem, o app avisa em vez de entregar outro formato silenciosamente.

**MP4 é um recipiente, não um codec.** No fluxo Adobe, o app prefere H.264 na resolução escolhida quando a plataforma oferece esse formato. Se já estiver compatível, preserva o vídeo. Se só o áudio precisar de AAC, converte só o áudio. AV1/VP9 podem exigir conversão de vídeo depois do download.

Quando converter, o progresso informa a CPU/GPU usada. No Windows, a seleção identifica o dispositivo indicado para alto desempenho; a comparação pode preferir a CPU. O resultado fica na sessão, sem separar resoluções. Se a GPU falhar, tenta pelo processador. Isso não garante a melhor velocidade em todo vídeo e hardware.

[Qualidade, áudio e GPU em detalhes →](https://noevfx.github.io/noevfx-downloader/formatos.html)

## 8. Fila, cancelamento e atualização

Após confirmar, você pode fechar a aba: **a fila continua no app local**. Reabra Links e playlists para ver a última lista enviada nesse perfil. No Adobe, reabra o painel no mesmo programa para acompanhar a última lista dele.

**Cancelar lista** cancela os itens ativos e os que ainda esperam. Arquivos já concluídos ficam no disco. O app precisa continuar rodando: reiniciar o serviço ou desligar o computador interrompe a fila, sem restauração automática.

Para migrar para o novo padrão da 3.2.0:

1. Baixe `NoeVFX-Downloader-3.2.0.zip` ou `NoeVFX-Downloader-for-Editors-3.2.0.zip`.
2. Extraia o ZIP e rode o instalador **por cima**, inclusive se você usa 3.1.0 ou 3.1.1. **Não precisa desinstalar.** Sua configuração e os vídeos baixados são preservados.
3. Recarregue a extensão da pasta instalada, reinicie os editores e dê F5 nas páginas abertas. Não use a cópia da extensão extraída do ZIP.

Os atualizadores antigos não reconhecem os nomes novos. Essa migração pelo instalador é necessária uma vez; a partir da 3.2.0, o botão Atualizar agora reconhece o novo padrão para as próximas releases. Uma release precisa estar publicada com um pacote e hash válidos para aparecer no botão.

Para remover: feche os editores, rode o desinstalador e confira os avisos. Ele tenta remover o app e o painel Adobe do usuário atual. Remova o cadastro da extensão em cada navegador/perfil manualmente. Vídeos baixados são preservados; a configuração do app é removida.

[Atualizar ou desinstalar →](https://noevfx.github.io/noevfx-downloader/atualizar.html) · [Resolver problemas →](https://noevfx.github.io/noevfx-downloader/ajuda.html) · [Contato](mailto:labs@noevfx.com)
