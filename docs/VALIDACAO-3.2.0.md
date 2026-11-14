# Validação local — 3.2.0

Data: 14/11/2026. Estado: pacotes locais prontos para teste do usuário; sem publicação desta rodada. A instalação real do usuário foi preservada.

| Verificação | Resultado |
|---|---|
| Python: regressão do servidor + coleções | 69 testes aprovados |
| Identidade dos produtos | Nomes conferidos nos ZIPs, instaladores, extensões, configurações, Sobre e menus; sem rótulos Basic/Comum na apresentação. |
| Separação de links e reconhecimento de playlists | 10 casos aprovados |
| Agrupamento de vídeos no popup | Aprovado; leitura do teste compatível com CRLF do Windows |
| Navegador com sites simulados | Rodada completa: 74/74; ver ressalva de inicialização abaixo |
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

## Ocorrência em investigação — TikTok

Em 14/11/2026, o usuário relatou falha real no TikTok: “Este endereço não é suportado direto”, mesmo com o vídeo em reprodução. A causa e a correção ainda não foram confirmadas. Os cenários simulados não cobrem integralmente esse caso real.
