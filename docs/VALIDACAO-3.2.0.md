# Validação local — 3.2.0

Data: 14/11/2026. Estado: entrega aprovada pelo usuário para publicação da release 3.2.0. Os arquivos locais da extensão e do painel foram atualizados com cópias de segurança; configurações, projetos e downloads foram preservados.

| Verificação | Resultado |
|---|---|
| Python: regressão do servidor + coleções | 69 testes aprovados |
| Identidade dos produtos | Nomes conferidos nos ZIPs, instaladores, extensões, configurações, Sobre e menus; sem rótulos Basic/Comum na apresentação. |
| Separação de links e reconhecimento de playlists | 10 casos aprovados |
| Agrupamento de vídeos no popup | Aprovado; leitura do teste compatível com CRLF do Windows |
| Navegador com sites simulados | Rodada final completa: 83/83, incluindo feed TikTok e modos Adobe; teste focado do painel 6/6; ver ressalva de inicialização abaixo |
| Download real de áudio via app | MP3/mp3, M4A/aac, WAV/pcm_s16le, FLAC/flac e Opus/opus conferidos com ffprobe |
| Playlist pública real | Metadados lidos, títulos/URLs válidos e aviso de limite conferido; não baixou a playlist inteira |
| UI compartilhada | Colagens sucessivas sem Enter, limpar/marcar, estado parcial de selecionar todos, formato, quantidade e destinos conferidos |
| Adobe no seletor | MP3/M4A/WAV; FLAC/Opus apenas para pasta; WAV reconhecido na fila de importação |
| Noe VFX Downloader | Não mostra destinos Adobe; mantém pasta padrão/outra pasta e formatos de áudio |
| Migração para os nomes novos | Atualizadores 3.1.0/3.1.1 não reconhecem os nomes novos; instalador necessário uma vez. Estrutura e preservação de configuração ensaiadas em pastas isoladas. |
| Documentação | 146 referências locais verificadas; guia desktop e estreito sem transbordamento horizontal; troca Premiere/After Effects conferida |

## Limites da validação

- O teste headless de sites apresenta uma intermitência conhecida no aquecimento do primeiro cenário Instagram: algumas inicializações não registram as mensagens do content script. Houve rodadas completas 74/74 e rodadas que pararam nesse aquecimento. Não equivale a validação física de todos os sites ou contas logadas.
- As demonstrações e capturas usam o HTML/CSS do produto com dados de exemplo; não são importações físicas no Premiere ou After Effects. A rodada validou a fila e os formatos encaminhados ao componente, mas a importação nos programas reais ainda precisa ser conferida.
- macOS/Linux e combinações de hardware não foram testados fisicamente nesta rodada. A seleção e a conversão CPU/GPU anterior foram preservadas; não foi feito novo benchmark de desempenho.
- A fila continua sem a janela, mas depende do processo local em execução e não é restaurada após reiniciar o serviço/PC.
- A decisão posterior de adotar nomes definitivos substitui a conclusão inicial sobre atualização direta: os clientes anteriores à 3.2.0 precisam migrar pelo instalador, uma vez. O novo atualizador é testado com os nomes dos dois produtos e com os respectivos hashes. Os ensaios não alteram a instalação real do usuário.

## Para testar esta entrega

Extraia o ZIP 3.2.0 da edição desejada e rode o instalador por cima. Não precisa desinstalar. Recarregue a extensão instalada e reinicie os programas Adobe. Dê F5 nas páginas com vídeos. Os dados de configuração são preservados pelo instalador/atualizador.

Relatos de falha devem incluir a mensagem mostrada, a versão de app/extensão e o caminho do fluxo utilizado; não publique cookies, tokens ou links privados de clientes.

## Correção do feed do TikTok

Em 14/11/2026, o usuário relatou “Este endereço não é suportado direto” no feed. O job real recebeu apenas `https://www.tiktok.com/`. A inspeção do TikTok real confirmou vídeo em blob, URL genérica e ID no contêiner `xgwrapper`. A extensão agora usa o ID desse player, sem buscar links de cartões vizinhos, e mantém o link direto da mídia como alternativa quando o próprio vídeo o fornece.

Download real pelo servidor, em pasta temporária isolada: vídeo identificado no player do Explorar, 1920×1080, 461,9 segundos, 74.136.715 bytes, vídeo HEVC e áudio MP3 conferidos com ffprobe. Esse ensaio validou o download para pasta, sem conversão H.264 ou importação Adobe. O arquivo de teste foi removido pelo encerramento do ensaio. Não equivale a validar todos os vídeos, contas ou regiões do TikTok.
