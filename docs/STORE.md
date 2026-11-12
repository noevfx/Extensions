# Publicar na loja (Edge Add-ons / Chrome Web Store)

Guia direto para publicar o Noe VFX Downloader.

---

## 1. Arquivo que vai na loja

```bash
python tools/build-store-zip.py
```

Gera `dist/noevfx-extension-<versão>.zip` — **só a pasta `extension`**, com
`manifest.json` na raiz. É esse arquivo que a loja aceita.

> O `dist/noevfx-downloader.zip` (pacote com instaladores) **não** serve para a loja.

---

## 2. Microsoft Edge Add-ons (grátis)

| Passo | Onde |
|---|---|
| 1. Entrar no programa | https://partner.microsoft.com/dashboard/microsoftedge/public/login |
| 2. Criar extensão | Partner Center → **Microsoft Edge** → *Create new extension* |
| 3. Subir o pacote | upload do `noevfx-extension-X.Y.Z.zip` |
| 4. Listagem | nome, descrição curta/longa, 1 screenshot 1280×800, categoria, idioma |
| 5. Privacidade | URL da política + declaração de uso de dados |
| 6. Disponibilidade | **Público** ou **Oculto** (só quem tem o link), países, grátis |
| 7. Certificação | até **7 dias úteis** |

Se a barra lateral não mostrar **Microsoft Edge**, a conta ainda não está inscrita
no programa: **Programas** → card *Microsoft Edge* → *Get started*.

---

## 3. Chrome Web Store (US$ 5 uma vez)

| Passo | Onde |
|---|---|
| 1. Registrar desenvolvedor | https://chrome.google.com/webstore/devconsole/ |
| 2. Novo item | *Add new item* → upload do zip |
| 3. Store listing | descrição, screenshots 1280×800, tile 440×280 |
| 4. Privacy practices | finalidade única + justificativa de cada permissão |
| 5. Distribution | público / **unlisted**, países |
| 6. Revisão | normalmente ~3 dias |

---

## 4. Justificativas de permissão (copiar e colar)

**Finalidade única (single purpose):**

> Detectar vídeos na página que o usuário está visitando e baixá-los na melhor
> qualidade disponível, usando um servidor local instalado pelo próprio usuário.

**`<all_urls>` / host permissions:**

> Necessário para detectar players de vídeo em qualquer site que o usuário visite.
> A extensão só lê URLs de mídia e o título da aba; não lê conteúdo de páginas
> nem histórico.

**`cookies`:**

> Usado para baixar vídeos que exigem autenticação (área de assinantes, cursos).
> Os cookies do site visitado são enviados **apenas** para o servidor local em
> `127.0.0.1:8765`, gravados em arquivo temporário e apagados ao fim do download.
> Nenhum cookie é enviado a servidores externos.

**`webRequest`:**

> Necessário para observar requisições de mídia (`.m3u8`, `.mpd`, `.mp4`, `.webm`)
> e identificar o stream do player.

**`storage`:**

> Guarda preferências locais (pasta de destino, tema, posição do ícone).

**`tabs` / `activeTab`:**

> Identificar a aba ativa para listar os vídeos detectados nela.

**`contextMenus`:**

> Oferecer as opções de download no botão direito.

---

## 5. Checklist antes de enviar

- [ ] Versão no `extension/manifest.json` foi incrementada
- [ ] `python tools/build.py` e `python tools/build-store-zip.py` rodaram
- [ ] Política de privacidade publicada (`PRIVACY.md` no repositório já serve de URL)
- [ ] Pelo menos 1 screenshot 1280×800
- [ ] Descrição curta (até 132 caracteres) e longa
- [ ] Categoria: *Ferramentas* / *Produtividade*
- [ ] Testou a instalação limpa (sem pasta anterior)

---

## 6. Depois de publicado

- Atualizações passam a ser automáticas para todos os usuários.
- Para publicar uma nova versão: suba a versão no manifest, gere os zips,
  `python tools/release.py` e faça upload do novo pacote no painel.
- O instalador continua necessário para o **servidor local** (yt-dlp + ffmpeg):
  deixe isso claro na descrição da loja.

---

## 7. Texto sugerido para a listagem

**Nome:** Noe VFX Downloader

**Descrição curta:**
> Baixe vídeos na qualidade máxima do player, com pasta e qualidade à sua escolha.

**Descrição longa:**

> Detecta automaticamente os vídeos da página (HLS, DASH, MP4, WebM, players
> embutidos) e baixa na melhor qualidade disponível.
>
> • Ícone no canto do vídeo — clique para baixar, arraste para mover
> • Escolha a pasta e a qualidade padrão no primeiro uso
> • Miniaturas de preview e lista de vídeos detectados
> • Baixar um ou todos, com fila de downloads
> • Funciona com sites que exigem login (usa os cookies da sua sessão)
>
> Requer o aplicativo NOÉ VFX instalado no computador (Windows, macOS ou Linux):
> https://github.com/noevfx/Extensions
