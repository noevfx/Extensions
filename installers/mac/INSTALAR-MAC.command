#!/bin/bash
# Noe VFX Downloader - duplo clique no Mac (botao direito > Abrir, so na 1a vez)
cd "$(dirname "$0")" || exit 1
xattr -dr com.apple.quarantine . 2>/dev/null   # tira o bloqueio de "baixado da internet" desta pasta
bash ./instalar-noevfx.sh
echo
read -n 1 -s -r -p "Pressione qualquer tecla para fechar..."
echo
