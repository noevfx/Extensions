#!/usr/bin/env bash
# =============================================================================
#  NOÉ VFX Downloader 3.0 — Instalador (macOS e Linux)
#  https://noevfx.com
#
#  Esta pasta serve SOMENTE para instalar. O programa é copiado para
#  ~/.local/share/NoeVFXDownloader e roda de lá (pode apagar esta pasta).
#
#  Uso:   bash instalar-noevfx.sh
# =============================================================================
set -u

APP="NoeVFXDownloader"
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/.local/share/$APP"
BIN="$DEST/server/bin"
PORT="${NOEVFX_PORT:-8765}"
OS="$(uname -s)"
ARCH="$(uname -m)"

C_OK="\033[1;32m"; C_WARN="\033[1;33m"; C_ERR="\033[1;31m"; C_INFO="\033[1;34m"; C_OFF="\033[0m"
ok()   { printf "${C_OK}   OK  %s${C_OFF}\n" "$*"; }
warn() { printf "${C_WARN}   !   %s${C_OFF}\n" "$*"; }
err()  { printf "${C_ERR}   X   %s${C_OFF}\n" "$*"; }
step() { printf "\n${C_INFO}> %s${C_OFF}\n" "$*"; }

printf "\n\033[1m============================================================\033[0m\n"
printf "        NOÉ VFX DOWNLOADER  v3.0  —  INSTALADOR\n"
printf "                 https://noevfx.com\n"
printf "\033[1m============================================================\033[0m\n\n"
printf "Sistema:        %s (%s)\n" "$OS" "$ARCH"
printf "Instalando em:  %s\n" "$DEST"
printf "Esta pasta é só para instalar — pode apagá-la depois.\n"

if [ ! -f "$BASE/extension/manifest.json" ]; then
  err "Você abriu o instalador de dentro do arquivo ZIP."
  printf "   Extraia o noevfx-downloader.zip primeiro e rode de novo.\n\n"
  exit 1
fi

# ---------------------------------------------------------------- 1. Python --
step "[1/6] Verificando o Python 3"
PY="$(command -v python3 || true)"
if [ -z "$PY" ]; then
  if [ "$OS" = "Darwin" ]; then
    warn "Python 3 não encontrado. Abrindo a página oficial..."
    open "https://www.python.org/downloads/macos/"
    printf "   Instale e rode este script de novo.\n\n"
  else
    warn "Python 3 não encontrado. Instale com:"
    printf "        sudo apt install python3        (Debian/Ubuntu)\n"
    printf "        sudo dnf install python3        (Fedora)\n"
    printf "        sudo pacman -S python           (Arch)\n\n"
  fi
  exit 1
fi
ok "Python: $("$PY" --version 2>&1)"

# -------------------------------------------------------------- 2. arquivos --
step "[2/6] Copiando a extensão e o servidor"
mkdir -p "$DEST" "$DEST/extension" "$DEST/server" "$BIN"
cp -R "$BASE/extension/." "$DEST/extension/" 2>/dev/null || true
cp -R "$BASE/server/." "$DEST/server/" 2>/dev/null || true
chmod -R u+rwX "$DEST" 2>/dev/null || true
ok "Copiado para $DEST (não roda da pasta extraída)"

# ----------------------------------------------------------------- 3. yt-dlp -
step "[3/6] Instalando o motor de download (yt-dlp)"
if [ -x "$BIN/yt-dlp" ]; then
  ok "yt-dlp já instalado ($("$BIN/yt-dlp" --version 2>/dev/null | head -n1))"
elif command -v yt-dlp >/dev/null 2>&1; then
  ok "yt-dlp já existe no sistema ($(yt-dlp --version 2>/dev/null | head -n1))"
else
  if "$PY" -m pip install --user -U yt-dlp >/dev/null 2>&1; then
    ok "yt-dlp instalado via pip"
  else
    case "$OS-$ARCH" in
      Darwin-*)                       ASSET="yt-dlp_macos" ;;
      Linux-x86_64|Linux-amd64)       ASSET="yt-dlp_linux" ;;
      Linux-aarch64|Linux-arm64)      ASSET="yt-dlp_linux_aarch64" ;;
      *)                              ASSET="yt-dlp" ;;
    esac
    printf "   Baixando binário do yt-dlp (%s)...\n" "$ASSET"
    if curl -fsSL --max-time 300 -o "$BIN/yt-dlp" \
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$ASSET"; then
      chmod +x "$BIN/yt-dlp"
      ok "yt-dlp instalado em $BIN/yt-dlp"
    else
      err "Falha ao instalar o yt-dlp. Tente: pip3 install -U yt-dlp"
    fi
  fi
fi

# ----------------------------------------------------------------- 4. ffmpeg -
step "[4/6] Verificando o FFmpeg (une vídeo + áudio)"
if [ -x "$BIN/ffmpeg" ]; then
  ok "FFmpeg já instalado na pasta do app"
elif command -v ffmpeg >/dev/null 2>&1; then
  ok "FFmpeg já existe no sistema"
else
  warn "FFmpeg não encontrado. Tentando instalar..."
  if [ "$OS" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      brew install ffmpeg && ok "FFmpeg instalado via Homebrew"
    else
      warn "Instale o Homebrew (https://brew.sh) e depois: brew install ffmpeg"
    fi
  else
    if command -v apt-get >/dev/null 2>&1; then
      sudo apt-get update -qq && sudo apt-get install -y ffmpeg && ok "FFmpeg instalado"
    elif command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y ffmpeg && ok "FFmpeg instalado"
    elif command -v pacman >/dev/null 2>&1; then
      sudo pacman -S --noconfirm ffmpeg && ok "FFmpeg instalado"
    elif command -v zypper >/dev/null 2>&1; then
      sudo zypper install -y ffmpeg && ok "FFmpeg instalado"
    else
      warn "Instale o FFmpeg pelo gerenciador da sua distro."
    fi
  fi
fi

# ------------------------------------------------------------------ 5. deno --
step "[5/6] Verificando o Deno (opcional, melhora o YouTube)"
if command -v deno >/dev/null 2>&1 || [ -x "$BIN/deno" ]; then
  ok "Deno disponível"
else
  if command -v unzip >/dev/null 2>&1; then
    case "$OS-$ARCH" in
      Darwin-arm64)                   DASSET="deno-aarch64-apple-darwin.zip" ;;
      Darwin-*)                       DASSET="deno-x86_64-apple-darwin.zip" ;;
      Linux-x86_64|Linux-amd64)       DASSET="deno-x86_64-unknown-linux-gnu.zip" ;;
      Linux-aarch64|Linux-arm64)      DASSET="deno-aarch64-unknown-linux-gnu.zip" ;;
      *)                              DASSET="" ;;
    esac
    TMPZ="$(mktemp -d)"
    if [ -n "$DASSET" ] && curl -fsSL --max-time 240 -o "$TMPZ/deno.zip" \
        "https://github.com/denoland/deno/releases/latest/download/$DASSET"; then
      if unzip -o -q "$TMPZ/deno.zip" -d "$TMPZ" 2>/dev/null && [ -f "$TMPZ/deno" ]; then
        cp "$TMPZ/deno" "$BIN/deno" && chmod +x "$BIN/deno" && ok "Deno instalado"
      else
        warn "Não consegui extrair o Deno (opcional)."
      fi
    else
      warn "Deno não instalado (opcional)."
    fi
    rm -rf "$TMPZ" 2>/dev/null || true
  else
    warn "Deno não instalado (opcional)."
  fi
fi

# -------------------------------------------------------------- 6. serviço --
step "[6/6] Configurando o servidor em segundo plano"
# encerra a instância antiga (atualização)
pkill -f "$DEST/server/server.py" 2>/dev/null || true
sleep 1

if [ "$OS" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.noevfx.downloader.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.noevfx.downloader</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PY</string>
    <string>$DEST/server/server.py</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/noevfx-downloader.log</string>
  <key>StandardErrorPath</key><string>/tmp/noevfx-downloader.err</string>
</dict>
</plist>
PLISTEOF
  launchctl unload "$PLIST" >/dev/null 2>&1 || true
  if launchctl load "$PLIST" >/dev/null 2>&1; then
    ok "Serviço criado (inicia junto com o Mac)"
  else
    warn "launchctl falhou. Iniciando manualmente agora."
    nohup "$PY" "$DEST/server/server.py" >/tmp/noevfx-downloader.log 2>&1 &
  fi
else
  SYSTEMD_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SYSTEMD_DIR"
  cat > "$SYSTEMD_DIR/noevfx-downloader.service" <<SYSEOF
[Unit]
Description=NOE VFX Downloader (noevfx.com)
After=network-online.target

[Service]
Type=simple
ExecStart=$PY $DEST/server/server.py
Restart=always
RestartSec=3
Environment=NOEVFX_PORT=$PORT

[Install]
WantedBy=default.target
SYSEOF
  if command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload >/dev/null 2>&1 || true
    if systemctl --user enable --now noevfx-downloader.service >/dev/null 2>&1; then
      ok "Serviço systemd ativado (inicia junto com o sistema)"
    else
      warn "systemd não aceitou o serviço. Usando autostart simples."
      AD="$HOME/.config/autostart"; mkdir -p "$AD"
      cat > "$AD/noevfx-downloader.desktop" <<DESKEOF
[Desktop Entry]
Type=Application
Name=NOÉ VFX Downloader
Exec=$PY $DEST/server/server.py
X-GNOME-Autostart-enabled=true
NoDisplay=true
DESKEOF
      nohup "$PY" "$DEST/server/server.py" >/tmp/noevfx-downloader.log 2>&1 &
    fi
  else
    AD="$HOME/.config/autostart"; mkdir -p "$AD"
    cat > "$AD/noevfx-downloader.desktop" <<DESKEOF
[Desktop Entry]
Type=Application
Name=NOÉ VFX Downloader
Exec=$PY $DEST/server/server.py
X-GNOME-Autostart-enabled=true
NoDisplay=true
DESKEOF
    nohup "$PY" "$DEST/server/server.py" >/tmp/noevfx-downloader.log 2>&1 &
    ok "Autostart configurado"
  fi
fi

sleep 2

printf "\n   Verificando o servidor..."
SRV_OK=0
for i in 1 2 3 4 5 6; do
  if curl -fs --max-time 4 -H "X-NoeVFX-Client: 1" "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    SRV_OK=1
    break
  fi
  sleep 2
done

if [ "$SRV_OK" = "1" ]; then
  ok "Servidor online em http://127.0.0.1:$PORT"
else
  warn "O servidor ainda não respondeu. Reinicie a sessão e abra a extensão."
fi

# ---------------------------------------------------- área de transferência
# ------------------------------------------------------------------
# ABRIR A PASTA (para arrastar a pasta extension para o navegador)
# ------------------------------------------------------------------
if [ "$OS" = "Darwin" ]; then
  open "$DEST" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$DEST" >/dev/null 2>&1 &
fi

if [ "$OS" = "Darwin" ] && command -v pbcopy >/dev/null 2>&1; then
  printf "%s" "$DEST/extension" | pbcopy
elif command -v wl-copy >/dev/null 2>&1; then
  printf "%s" "$DEST/extension" | wl-copy
elif command -v xclip >/dev/null 2>&1; then
  printf "%s" "$DEST/extension" | xclip -selection clipboard
elif command -v xsel >/dev/null 2>&1; then
  printf "%s" "$DEST/extension" | xsel --clipboard --input
fi

cat <<EOF

============================================================
        ÚLTIMO PASSO — SÓ 3 CLIQUES (2 minutos)
============================================================

1. Abra o navegador (Chrome, Edge, Brave, Opera ou Vivaldi)
2. Vá para:   chrome://extensions
3. Ligue a chave "Modo do desenvolvedor"
4. Arraste a pasta "extension" (a que abriu na tela) para a página
   OU clique em "Carregar sem compactação" e selecione a pasta:

   $DEST/extension

ATENÇÃO: carregue a pasta INSTALADA acima, não a pasta
extraída do ZIP — o navegador guarda o caminho e a extensão
quebra se você apagar a pasta extraída.

Na primeira abertura a extensão pergunta em qual pasta
salvar os vídeos.

------------------------------------------------------------
Você já pode APAGAR esta pasta extraída: o programa foi
instalado em $DEST e inicia sozinho com o sistema.
------------------------------------------------------------

JÁ TINHA O NOÉ VFX INSTALADO? Isto foi uma ATUALIZAÇÃO.
Falta 1 clique: abra chrome://extensions e clique em
"Recarregar" no cartão do NOÉ VFX Downloader.

Para desinstalar:  bash desinstalar-noevfx.sh
============================================================

EOF

if [ "$OS" = "Darwin" ]; then
  open -a "Google Chrome" "chrome://extensions" >/dev/null 2>&1 || \
  open -a "Microsoft Edge" "edge://extensions" >/dev/null 2>&1 || true
else
  for b in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge brave-browser vivaldi opera; do
    if command -v "$b" >/dev/null 2>&1; then
      "$b" "chrome://extensions" >/dev/null 2>&1 &
      break
    fi
  done
fi

exit 0
