# Justificativas de permissão

Copie e cole nos campos de privacidade da loja.

---

## Finalidade única (single purpose)

> Detectar vídeos na página que o usuário está visitando e baixá-los na melhor
> qualidade disponível, usando um servidor local instalado pelo próprio usuário.

---

## `<all_urls>` / acesso a sites

> Necessário para detectar players de vídeo em qualquer site que o usuário visite.
> A extensão lê apenas URLs de mídia (`.m3u8`, `.mpd`, `.mp4`, `.webm`), o título
> da aba e a miniatura do vídeo. Não lê o conteúdo das páginas, não acessa
> histórico e não monitora outras abas.

---

## `cookies`

> Usado para baixar vídeos que exigem autenticação (área de assinantes, cursos,
> conteúdo pago). Os cookies do site visitado são enviados **apenas** ao servidor
> local em `127.0.0.1:8765`, gravados em arquivo temporário e apagados ao final do
> download. Nenhum cookie é enviado para servidores externos nem armazenado de
> forma permanente. Pode ser desativado nas configurações.

---

## `webRequest`

> Necessário para observar requisições de mídia e identificar o stream usado pelo
> player da página (HLS/DASH/MP4). O filtro é restrito a extensões de mídia e ao
> tipo `media`.

---

## `storage`

> Guarda preferências locais: pasta de destino, tema claro/escuro, posição do
> ícone por site e lista de vídeos detectados na aba atual.

---

## `tabs` / `activeTab`

> Identificar a aba ativa para listar os vídeos detectados nela e recarregar a
> detecção quando o usuário pede.

---

## `contextMenus`

> Oferecer as ações de download no botão direito do mouse (baixar, baixar todos,
> ligar/desligar o ícone, abrir a pasta).

---

## Declaração de uso de dados (Chrome Web Store)

- [x] A extensão **não** coleta dados pessoais para venda
- [x] A extensão **não** usa dados para fins não relacionados à finalidade única
- [x] A extensão **não** usa dados para determinar credibilidade ou empréstimo
- [x] Os dados trafegam apenas para o servidor local do usuário (`127.0.0.1`)

URL da política de privacidade:
`https://github.com/noevfx/Extensions/blob/main/PRIVACY.md`
