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
  launchctl bootout "gui/$(id -u)/com.noevfx.downloader" >/dev/null 2>&1 || true
  launchctl unload "$PLIST" >/dev/null 2>&1 || true
  rm -f "$PLIST" "$HOME/Library/Logs/NoeVFXDownloader.log"
else
  systemctl --user disable --now noevfx-downloader.service >/dev/null 2>&1 || true
  rm -f "$HOME/.config/systemd/user/noevfx-downloader.service"
  systemctl --user daemon-reload >/dev/null 2>&1 || true
  rm -f "$HOME/.config/autostart/noevfx-downloader.desktop"
fi

# qualquer servidor do Noe VFX ainda escutando na porta (ex.: versao antiga iniciada a mao) tambem sai
PORT="${NOEVFX_PORT:-8765}"
if curl -fs --max-time 3 -H "X-NoeVFX-Client: 1" "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q "noevfx.com"; then
  for p in $( (lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null || ss -ltnp "sport = :$PORT" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p') ); do
    kill "$p" 2>/dev/null || true
  done
  sleep 1
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
