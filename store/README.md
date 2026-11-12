# Pasta de upload para a loja

A loja é publicada **em inglês** (`en-US`); o português (`pt-BR`) é o idioma
secundário. Contato de suporte: **labs@noevfx.com**.

```
store/
├─ upload/                  zip que vai para a loja
│  └─ noevfx-extension-3.0.0.zip
├─ listing/
│  ├─ en-US/                nome, descrição curta/longa, permissões
│  └─ pt-BR/                mesmo conteúdo em português
└─ screenshots/             1280×800 (en e pt)
```

## Gerar/atualizar o zip

```bash
python tools/build-store-zip.py
```

Sai em `store/upload/` **e** em `dist/`.

## Publicar — Edge Add-ons (grátis)

1. https://partner.microsoft.com/dashboard/microsoftedge/public/login
2. **Create new extension** → envie `store/upload/noevfx-extension-3.0.0.zip`
3. Store listing: use `listing/en-US/` (idioma padrão) e adicione `pt-BR` como idioma extra
4. Privacy: cole `listing/en-US/permissions.md`
5. Availability: **Public** ou **Hidden** (só quem tem o link)
6. Submit → certificação em até 7 dias úteis

## Publicar — Chrome Web Store (US$ 5 uma vez)

1. https://chrome.google.com/webstore/devconsole/
2. **Add new item** → mesmo zip
3. Store listing: `listing/en-US/` + screenshots
4. Privacy practices: `listing/en-US/permissions.md`
5. Distribution: público ou **unlisted**
6. Submit → revisão ~3 dias

## Screenshots prontos

| Arquivo | Conteúdo |
|---|---|
| `01-popup-en.png` / `01-popup-pt.png` | popup com vídeos detectados |
| `03-video-en.png` / `03-video-pt.png` | ícone e cartão sobre o player |
| `04-options-en.png` / `04-options-pt.png` | configurações |
| `05-about-en.png` / `05-about-pt.png` | sobre, PIX e contato |

## Antes de enviar

- [ ] Subiu a versão em `extension/manifest.json`
- [ ] Rodou `python tools/build.py` e `python tools/build-store-zip.py`
- [ ] Descrições revisadas (`listing/en-US`, `listing/pt-BR`)
- [ ] Política de privacidade publicada (`PRIVACY.md`)
- [ ] Termos de uso (`TERMS.md`) linkados na descrição

Guia completo: [`../docs/STORE.md`](../docs/STORE.md)
