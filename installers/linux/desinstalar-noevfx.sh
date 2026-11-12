#!/usr/bin/env bash
# =============================================================================
#  Noe VFX Downloader 3.0 — Desinstalador (macOS / Linux)
#  Uso: bash desinstalar-noevfx.sh
# =============================================================================
set -u
APP="NoeVFXDownloader"
DEST="$HOME/.local/share/$APP"
OS="$(uname -s)"

printf "\n==========================================================\n"
printf "   DESINSTALADOR — Noe VFX Downloader (noevfx.com)\n"
printf "==========================================================\n\n"
printf "Isto vai remover o serviço em segundo plano e os arquivos em:\n  %s\n\n" "$DEST"
printf "Os vídeos já baixados NÃO serão apagados.\n\n"

read -r -p "Continuar? (s/N): " CONF
case "$CONF" in
  s|S|y|Y) ;;
  *) printf "Cancelado.\n"; exit 0 ;;
esac

printf "\n[1/4] Parando o servidor...\n"
pkill -f "$DEST/server/server.py" 2>/dev/null || true

printf "[2/4] Removendo inicialização automática...\n"
if [ "$OS" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.noevfx.downloader.plist"
  launchctl unload "$PLIST" >/dev/null 2>&1 || true
  rm -f "$PLIST"
else
  systemctl --user disable --now noevfx-downloader.service >/dev/null 2>&1 || true
  rm -f "$HOME/.config/systemd/user/noevfx-downloader.service"
  systemctl --user daemon-reload >/dev/null 2>&1 || true
  rm -f "$HOME/.config/autostart/noevfx-downloader.desktop"
fi

printf "[3/4] Removendo arquivos...\n"
rm -rf "$DEST"

printf "[4/4] Pronto.\n\n"
printf "==========================================================\n"
printf "  DESINSTALADO COM SUCESSO\n\n"
printf "  Falta 1 passo manual no navegador:\n"
printf "    - Abra chrome://extensions\n"
printf "    - Clique em \"Remover\" no cartão do Noe VFX Downloader\n"
printf "==========================================================\n\n"
exit 0
