# Justificativas de permissão — Edge Add-ons / Chrome Web Store

Cole nos campos de privacidade/permissões.

---

## Finalidade única

> Detectar a mídia que a página visitada já carrega e salvá-la em uma pasta
> escolhida pelo usuário, usando um aplicativo que roda localmente no
> computador do próprio usuário.

---

## `<all_urls>` — acesso a sites

> Necessário para detectar players de vídeo em qualquer site que o usuário
> visite. A extensão lê apenas URLs de mídia (`.m3u8`, `.mpd`, `.mp4`, `.webm`),
> o título da aba e a miniatura do vídeo. Não lê o conteúdo das páginas, não
> acessa histórico e não monitora outras abas.

---

## `cookies`

> Usado para acessar o mesmo conteúdo que o usuário já está assistindo quando o
> vídeo exige o login dele. Os cookies do site visitado são enviados **somente**
> ao aplicativo local em `127.0.0.1:8765`, gravados em arquivo temporário e
> apagados ao final do download. Nenhum cookie vai para servidores externos nem
> fica armazenado. Pode ser desativado nas configurações.

---

## `webRequest`

> Necessário para observar requisições de mídia e identificar o stream usado pelo
> player (HLS/DASH/MP4). O filtro é restrito a extensões de mídia e ao tipo
> `media`.

---

## `storage`

> Guarda preferências locais: pasta de destino, tema, posição do ícone por site e
> a lista de vídeos encontrados na aba atual.

---

## `tabs` / `activeTab`

> Identificar a aba ativa para listar os vídeos encontrados nela e atualizar a
> detecção quando o usuário pedir.

---

## `contextMenus`

> Oferecer as ações no botão direito (salvar vídeo, salvar todos, ligar/desligar
> o ícone, abrir a pasta de downloads).

---

## Declaração de uso de dados

- [x] Não coleta dados pessoais para venda
- [x] Não usa dados para fins não relacionados à finalidade única
- [x] Não usa dados para determinar credibilidade ou empréstimo
- [x] Os dados vão apenas para o aplicativo local do usuário (`127.0.0.1`)

URL da política de privacidade:
`https://github.com/noevfx/Extensions/blob/main/PRIVACY.md`

Contato de suporte: **labs@noevfx.com**
