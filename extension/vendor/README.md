# vendor/qrcode.js

Gerador de QR Code em JavaScript puro, usado para desenhar o QR do PIX
**localmente** (nenhuma chave é enviada para servidores externos).

- Projeto: qrcode-generator
- Autor: Kazuhiko Arase
- Licença: MIT — http://www.opensource.org/licenses/mit-license.php
- Origem: https://github.com/kazuhikoarase/qrcode-generator

Uso neste projeto: `options.js` chama `qrcode(0, "M")`, adiciona o payload PIX e
desenha os módulos num `<canvas>`.
