# Publicar na loja (Edge Add-ons / Chrome Web Store)

A listagem é publicada **em inglês** (`en-US`), com **português** (`pt-BR`) como
idioma secundário. Suporte: **labs@noevfx.com**.

---

## 1. Arquivo que vai na loja

```bash
python tools/build-store-zip.py
```

Gera `store/upload/noevfx-extension-<versão>.zip` — **só a pasta `extension`**,
com `manifest.json` na raiz, `_locales/` (en, pt_BR) e o gerador de QR local.

> O `dist/noevfx-downloader.zip` (pacote com instaladores) **não** serve para a loja.

---

## 2. Edge Add-ons (grátis)

| Passo | Onde |
|---|---|
| 1. Entrar no programa | https://partner.microsoft.com/dashboard/microsoftedge/public/login |
| 2. Criar extensão | Partner Center → **Microsoft Edge** → *Create new extension* |
| 3. Pacote | `store/upload/noevfx-extension-X.Y.Z.zip` |
| 4. Listagem | `store/listing/en-US/` (padrão) + `pt-BR` como idioma extra |
| 5. Privacidade | `store/listing/en-US/permissions.md` |
| 6. Disponibilidade | **Public** ou **Hidden** (só quem tem o link) |
| 7. Certificação | até **7 dias úteis** |

Se a barra lateral não mostrar **Microsoft Edge**, a conta ainda não está inscrita:
**Programas** → card *Microsoft Edge* → *Get started*.

---

## 3. Chrome Web Store (US$ 5 uma vez)

| Passo | Onde |
|---|---|
| 1. Registrar | https://chrome.google.com/webstore/devconsole/ |
| 2. Novo item | *Add new item* → mesmo zip |
| 3. Store listing | `store/listing/en-US/` + screenshots 1280×800 |
| 4. Privacy practices | `store/listing/en-US/permissions.md` |
| 5. Distribution | público ou **unlisted** |
| 6. Revisão | ~3 dias |

---

## 4. Textos e imagens prontos

```
store/
├─ upload/noevfx-extension-3.0.0.zip   ← pacote
├─ listing/en-US/  name · short · long · permissions
├─ listing/pt-BR/  nome · curta · longa · permissoes
└─ screenshots/    01-popup · 03-video · 04-options · 05-about (en e pt)
```

---

## 5. Compatibilidade com as políticas

O texto foi escrito para não sugerir burla de proteções:

- fala em **salvar o que o usuário já assiste**, não "qualquer vídeo de qualquer site";
- deixa explícito que **não contorna DRM, paywall, login ou bloqueio regional**;
- declara **processamento local** (sem servidor externo, sem telemetria);
- inclui **uso responsável** e link para `TERMS.md`;
- as permissões são justificadas uma a uma (sem mencionar "anti-bot" ou "bypass").

---

## 6. Antes de enviar

- [ ] Versão incrementada em `extension/manifest.json`
- [ ] `python tools/build.py` e `python tools/build-store-zip.py` executados
- [ ] Descrições revisadas em `store/listing/`
- [ ] `PRIVACY.md` e `TERMS.md` publicados no repositório
- [ ] Screenshots em 1280×800
- [ ] Teste de instalação limpa

---

## 7. Depois de publicado

- Atualizações passam a ser automáticas.
- O instalador continua necessário para o **aplicativo local** (yt-dlp + ffmpeg):
  deixe isso claro na descrição da loja.
- Nova versão: suba o número no manifest, rode `python tools/release.py` e envie
  o novo zip no painel.
