# Pasta de upload para a loja

Tudo o que você precisa para publicar está aqui.

```
store/
├─ upload/                    ← o arquivo que vai para a loja
│  └─ noevfx-extension-3.0.0.zip   (gerado por tools/build-store-zip.py)
├─ listing/
│  ├─ descricao-curta.txt      (até 132 caracteres)
│  ├─ descricao-longa.txt
│  └─ permissoes.md            justificativas prontas para colar
└─ screenshots/                coloque aqui 1 a 5 imagens 1280×800
```

## Gerar/atualizar o zip

```bash
python tools/build-store-zip.py
```

Sai em `store/upload/` **e** em `dist/`.

## Publicar — Edge Add-ons (grátis)

1. https://partner.microsoft.com/dashboard/microsoftedge/public/login
2. **Criar nova extensão** → envie `store/upload/noevfx-extension-3.0.0.zip`
3. Listagem: copie os textos de `listing/`
4. Privacidade: link da política + cole as justificativas de `listing/permissoes.md`
5. Disponibilidade: **Público** ou **Oculto** (só quem tem o link)
6. Enviar → certificação em até 7 dias úteis

## Publicar — Chrome Web Store (US$ 5 uma vez)

1. https://chrome.google.com/webstore/devconsole/
2. **Add new item** → mesmo zip
3. Store listing: `listing/descricao-*.txt` + screenshots 1280×800
4. Privacy practices: `listing/permissoes.md`
5. Distribution: público ou **unlisted**
6. Enviar → revisão ~3 dias

## Antes de enviar

- [ ] Subiu a versão em `extension/manifest.json`
- [ ] Rodou `python tools/build.py` e `python tools/build-store-zip.py`
- [ ] Pelo menos 1 screenshot 1280×800 em `screenshots/`
- [ ] Política de privacidade publicada (use o `PRIVACY.md` do repositório)
- [ ] Descrições revisadas

Guia completo: [`../docs/STORE.md`](../docs/STORE.md)
