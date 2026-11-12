#!/usr/bin/env bash
# =============================================================================
#  Noe VFX Downloader 3.0.1 - Instalador (macOS e Linux)          noevfx.com
#
#  Instala TUDO sozinho, sem sudo e sem pedir nada ao usuario:
#    - Python (usa o do sistema se for 3.9+; senao baixa um portatil)
#    - yt-dlp (binario oficial, com checagem SHA-256) e Deno (para o YouTube)
#    - FFmpeg (usa o do sistema; senao baixa um portatil)
#    - servidor local em segundo plano (inicia junto com o sistema)
#
#  Pode rodar de novo quando quiser (atualiza). Uso:  bash instalar-noevfx.sh
#  Variaveis (teste): NOEVFX_PORT, NOEVFX_TARGET, NOEVFX_NO_SERVICE=1,
#                     NOEVFX_NO_BROWSER=1, NOEVFX_DRYRUN=1 (so mostra o que baixaria)
# =============================================================================
set -u

APP="NoeVFXDownloader"
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${NOEVFX_TARGET:-$HOME/.local/share/$APP}"
BIN="$DEST/server/bin"
TOOLS="$DEST/tools"
PORT="${NOEVFX_PORT:-8765}"
OS="${NOEVFX_FAKE_OS:-$(uname -s)}"
ARCH="${NOEVFX_FAKE_ARCH:-$(uname -m)}"
DRY="${NOEVFX_DRYRUN:-0}"
LOG="$DEST/install.log"
GH="https://github.com"
TMPD="$(mktemp -d 2>/dev/null || echo "/tmp/noevfx_inst_$$")"; mkdir -p "$TMPD"
trap 'rm -rf "$TMPD"' EXIT

C_OK="\033[1;32m"; C_WARN="\033[1;33m"; C_ERR="\033[1;31m"; C_INFO="\033[1;34m"; C_OFF="\033[0m"
WARNINGS=0
ok()   { printf "${C_OK}   OK  %s${C_OFF}\n" "$*"; }
warn() { WARNINGS=$((WARNINGS+1)); printf "${C_WARN}   !   %s${C_OFF}\n" "$*"; }
err()  { WARNINGS=$((WARNINGS+1)); printf "${C_ERR}   X   %s${C_OFF}\n" "$*"; }
step() { printf "\n${C_INFO}> %s${C_OFF}\n" "$*"; }
say()  { printf "   %s\n" "$*"; }
note() { mkdir -p "$DEST" 2>/dev/null; printf "%s %s\n" "$(date '+%F %T')" "$*" >> "$LOG" 2>/dev/null; }

# ------------------------------------------------------------- utilitarios ---
sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else echo ""; fi
}

# baixa com 3 tentativas; so conta se o arquivo veio inteiro
fetch() { # url destino
  local i
  for i in 1 2 3; do
    if curl -fL --retry 2 --connect-timeout 20 --max-time 900 -sS -o "$2" "$1" 2>>"$LOG"; then
      [ -s "$2" ] && return 0
    fi
    sleep 2
  done
  note "falha ao baixar $1"
  return 1
}

unzip_to() { # zip destino  (usa o proprio Python: nao depende do comando unzip)
  "$PY" -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$1" "$2"
}

py_ok() { # candidato: precisa executar de verdade e ser 3.9+
  [ -n "$1" ] && [ -x "$1" ] || return 1
  "$1" -c 'import sys,ssl; sys.exit(0 if sys.version_info >= (3,9) else 1)' >/dev/null 2>&1
}

case "$OS-$ARCH" in
  Darwin-arm64)               UVA="aarch64-apple-darwin";        YTA="yt-dlp_macos";         DENOA="aarch64-apple-darwin" ;;
  Darwin-x86_64)              UVA="x86_64-apple-darwin";         YTA="yt-dlp_macos";         DENOA="x86_64-apple-darwin" ;;
  Linux-x86_64|Linux-amd64)   UVA="x86_64-unknown-linux-gnu";    YTA="yt-dlp_linux";         DENOA="x86_64-unknown-linux-gnu" ;;
  Linux-aarch64|Linux-arm64)  UVA="aarch64-unknown-linux-gnu";   YTA="yt-dlp_linux_aarch64"; DENOA="aarch64-unknown-linux-gnu" ;;
  *) printf "Sistema nao suportado: %s %s\n" "$OS" "$ARCH"; exit 1 ;;
esac

printf "\n\033[1m============================================================\033[0m\n"
printf "        Noe VFX Downloader  v3.0.1  -  INSTALADOR\n"
printf "                 https://noevfx.com\n"
printf "\033[1m============================================================\033[0m\n\n"
printf "Sistema:        %s (%s)\n" "$OS" "$ARCH"
printf "Instalando em:  %s\n" "$DEST"
printf "Nao precisa de senha nem de nenhum programa instalado antes.\n"

if [ "$DRY" = "1" ]; then
  printf "\n[DRYRUN] downloads previstos para %s-%s:\n" "$OS" "$ARCH"
  printf "  %s\n" "$GH/astral-sh/uv/releases/latest/download/uv-$UVA.tar.gz" \
    "$GH/yt-dlp/yt-dlp/releases/latest/download/$YTA" \
    "$GH/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS" \
    "$GH/denoland/deno/releases/latest/download/deno-$DENOA.zip"
  exit 0
fi

if [ ! -f "$BASE/extension/manifest.json" ]; then
  err "Voce abriu o instalador de dentro do arquivo ZIP."
  printf "   Extraia o noevfx-downloader.zip primeiro e rode de novo.\n\n"
  exit 1
fi
command -v curl >/dev/null 2>&1 || { err "O comando 'curl' nao foi encontrado (instale com o gerenciador do sistema)."; exit 1; }

mkdir -p "$DEST" "$BIN" "$TOOLS" 2>/dev/null
note "=== instalacao iniciada ($OS $ARCH)"

# ----------------------------------------------------------- 1. copiar ------
step "[1/6] Copiando a extensao e o servidor"
mkdir -p "$DEST/extension" "$DEST/server"
if cp -R "$BASE/extension/." "$DEST/extension/" && cp -R "$BASE/server/." "$DEST/server/"; then
  chmod -R u+rwX "$DEST" 2>/dev/null
  ok "Copiado para $DEST"
else
  err "Nao consegui copiar os arquivos para $DEST"; exit 1
fi

# ----------------------------------------------------------- 2. Python ------
step "[2/6] Python"
PY=""
MPY=""     # Python portatil (so existe se foi preciso baixar)
UV=""
ensure_uv() {
  if [ -n "$UV" ] && [ -x "$UV" ]; then return 0; fi
  if [ -x "$TOOLS/uv" ]; then UV="$TOOLS/uv"; return 0; fi
  say "Baixando o gerenciador de Python (uv, ~15 MB)..."
  fetch "$GH/astral-sh/uv/releases/latest/download/uv-$UVA.tar.gz" "$TMPD/uv.tgz" || return 1
  mkdir -p "$TMPD/uvx" && tar -xzf "$TMPD/uv.tgz" -C "$TMPD/uvx" 2>>"$LOG" || return 1
  local f; f="$(find "$TMPD/uvx" -name uv -type f 2>/dev/null | head -n1)"
  [ -n "$f" ] || return 1
  cp "$f" "$TOOLS/uv" && chmod +x "$TOOLS/uv" && UV="$TOOLS/uv"
}
managed_python() {   # preenche MPY com um Python 3.12 portatil (baixa se preciso)
  [ -n "$MPY" ] && return 0
  export UV_PYTHON_INSTALL_DIR="$DEST/python" UV_NO_CONFIG=1
  ensure_uv || return 1
  local p
  p="$("$UV" python find 3.12 --managed-python 2>/dev/null)"
  if ! py_ok "$p"; then
    say "Baixando um Python portatil (3.12, ~30 MB)..."
    "$UV" python install 3.12 >>"$LOG" 2>&1 || return 1
    p="$("$UV" python find 3.12 --managed-python 2>/dev/null)"
  fi
  py_ok "$p" || return 1
  MPY="$p"
}

# candidatos do sistema. No macOS o /usr/bin/python3 e um "atalho" que abre o instalador das
# Ferramentas de Desenvolvedor (varios GB): so e usado se elas ja estiverem instaladas.
if [ "${NOEVFX_FORCE_PORTABLE_PYTHON:-0}" != "1" ]; then     # (=1 so nos testes: simula maquina sem Python)
  for c in "$DEST/python/"*/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 \
           "$(command -v python3.13 2>/dev/null)" "$(command -v python3.12 2>/dev/null)" \
           "$(command -v python3.11 2>/dev/null)" "$(command -v python3.10 2>/dev/null)" \
           "$(command -v python3.9 2>/dev/null)" "$(command -v python3 2>/dev/null)"; do
    if [ "$c" = "/usr/bin/python3" ] && [ "$OS" = "Darwin" ] && ! xcode-select -p >/dev/null 2>&1; then continue; fi
    if py_ok "$c"; then PY="$c"; break; fi
  done
fi
if [ -n "$PY" ]; then
  ok "Python do sistema: $("$PY" --version 2>&1)  ($PY)"
elif managed_python; then
  PY="$MPY"; ok "Python portatil: $("$PY" --version 2>&1)"
else
  err "Nao consegui obter o Python. Veja a internet e rode de novo (detalhes: $LOG)"; exit 1
fi
note "python: $PY"

# ----------------------------------------------------------- 3. yt-dlp ------
step "[3/6] yt-dlp (motor de download)"
install_ytdlp() {
  fetch "$GH/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS" "$TMPD/SUMS" || return 1
  fetch "$GH/yt-dlp/yt-dlp/releases/latest/download/$YTA" "$TMPD/$YTA" || return 1
  local want got
  want="$(grep " $YTA\$" "$TMPD/SUMS" | awk '{print $1}')"
  got="$(sha256 "$TMPD/$YTA")"
  if [ -z "$want" ] || [ "$want" != "$got" ]; then note "sha256 do yt-dlp NAO confere ($want x $got)"; return 2; fi
  cp "$TMPD/$YTA" "$BIN/yt-dlp" && chmod +x "$BIN/yt-dlp"
}
if [ -x "$BIN/yt-dlp" ] && "$BIN/yt-dlp" --version >/dev/null 2>&1; then
  "$BIN/yt-dlp" -U >>"$LOG" 2>&1   # ja instalado: so atualiza
  ok "yt-dlp $("$BIN/yt-dlp" --version 2>/dev/null)"
else
  install_ytdlp; rc=$?
  if [ $rc -eq 0 ] && "$BIN/yt-dlp" --version >/dev/null 2>&1; then ok "yt-dlp $("$BIN/yt-dlp" --version 2>/dev/null) (SHA-256 conferido)"
  elif [ $rc -eq 2 ]; then err "O arquivo do yt-dlp nao passou na checagem de seguranca (SHA-256). Nao foi instalado."
  elif command -v yt-dlp >/dev/null 2>&1; then ok "yt-dlp do sistema: $(yt-dlp --version 2>/dev/null)"
  else err "Nao consegui baixar o yt-dlp (veja a internet e rode de novo)."; fi
fi

# ----------------------------------------------------------- 4. FFmpeg ------
step "[4/6] FFmpeg (junta video e audio)"
ff_ok() { [ -n "$1" ] && [ -x "$1" ] && "$1" -version >/dev/null 2>&1; }
FF=""
for c in "$BIN/ffmpeg" "$(command -v ffmpeg 2>/dev/null)" /opt/homebrew/bin/ffmpeg /usr/local/bin/ffmpeg; do
  if ff_ok "$c"; then FF="$c"; break; fi
done
if [ -z "$FF" ]; then
  say "Baixando um FFmpeg portatil..."
  if managed_python && ensure_uv; then
    UV_NO_CONFIG=1 "$UV" pip install --python "$MPY" --target "$DEST/pylib" --quiet imageio-ffmpeg >>"$LOG" 2>&1
    src="$(ls "$DEST"/pylib/imageio_ffmpeg/binaries/ffmpeg-* 2>/dev/null | head -n1)"
    if [ -n "$src" ]; then cp "$src" "$BIN/ffmpeg" && chmod +x "$BIN/ffmpeg"; fi
  fi
  ff_ok "$BIN/ffmpeg" && FF="$BIN/ffmpeg"
fi
if [ -n "$FF" ]; then
  ok "FFmpeg: $("$FF" -version 2>/dev/null | head -n1 | cut -c1-40)"
  if [ ! -x "$(dirname "$FF")/ffprobe" ] && ! command -v ffprobe >/dev/null 2>&1; then
    say "(sem ffprobe: tudo funciona; o 'so audio' sai no formato m4a original)"
  fi
else
  warn "FFmpeg nao instalado: os downloads funcionam em formato unico (qualidade um pouco menor)."
  [ "$OS" = "Darwin" ] && say "Para qualidade maxima:  brew install ffmpeg   (https://brew.sh)"
fi

# ----------------------------------------------------------- 5. Deno --------
step "[5/6] Deno (necessario para o YouTube)"
if [ -x "$BIN/deno" ] || command -v deno >/dev/null 2>&1; then
  ok "Deno disponivel"
else
  if fetch "$GH/denoland/deno/releases/latest/download/deno-$DENOA.zip" "$TMPD/deno.zip" \
     && unzip_to "$TMPD/deno.zip" "$TMPD/denox" && [ -f "$TMPD/denox/deno" ]; then
    cp "$TMPD/denox/deno" "$BIN/deno" && chmod +x "$BIN/deno" && ok "Deno instalado"
  else
    warn "Deno nao instalado: o YouTube pode vir com menos qualidades."
  fi
fi

# ----------------------------------------------------------- 6. servico -----
step "[6/6] Servidor em segundo plano"
SRV_PATH="$BIN:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
# encerra a instancia antiga (atualizacao)
pkill -f "$DEST/server/server.py" 2>/dev/null; sleep 1

start_now() {
  NOEVFX_PORT="$PORT" PATH="$SRV_PATH:$PATH" nohup "$PY" "$DEST/server/server.py" >>"$DEST/server.log" 2>&1 &
}

if [ "${NOEVFX_NO_SERVICE:-0}" = "1" ]; then
  start_now; ok "Servidor iniciado (sem instalar o servico: teste)"
elif [ "$OS" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.noevfx.downloader.plist"
  mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
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
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$SRV_PATH</string>
    <key>NOEVFX_PORT</key><string>$PORT</string>
  </dict>
  <key>WorkingDirectory</key><string>$DEST/server</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/NoeVFXDownloader.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/NoeVFXDownloader.log</string>
</dict>
</plist>
PLISTEOF
  launchctl bootout "gui/$(id -u)/com.noevfx.downloader" >/dev/null 2>&1
  launchctl unload "$PLIST" >/dev/null 2>&1
  if launchctl bootstrap "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || launchctl load -w "$PLIST" >/dev/null 2>&1; then
    ok "Servico criado (inicia junto com o Mac)"
  else
    warn "O launchctl recusou o servico. Iniciando manualmente agora (nao volta apos reiniciar)."
    start_now
  fi
else
  SYSTEMD_DIR="$HOME/.config/systemd/user"; mkdir -p "$SYSTEMD_DIR"
  cat > "$SYSTEMD_DIR/noevfx-downloader.service" <<SYSEOF
[Unit]
Description=Noe VFX Downloader (noevfx.com)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$DEST/server
ExecStart=$PY $DEST/server/server.py
Restart=on-failure
RestartSec=5
Environment=NOEVFX_PORT=$PORT
Environment=PATH=$SRV_PATH

[Install]
WantedBy=default.target
SYSEOF
  USED=0
  if command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload >/dev/null 2>&1
    if systemctl --user enable --now noevfx-downloader.service >/dev/null 2>&1; then USED=1; ok "Servico systemd ativado (inicia junto com o sistema)"; fi
  fi
  if [ "$USED" = "0" ]; then
    AD="$HOME/.config/autostart"; mkdir -p "$AD"
    cat > "$AD/noevfx-downloader.desktop" <<DESKEOF
[Desktop Entry]
Type=Application
Name=Noe VFX Downloader
Exec=env NOEVFX_PORT=$PORT PATH=$SRV_PATH $PY $DEST/server/server.py
X-GNOME-Autostart-enabled=true
NoDisplay=true
DESKEOF
    start_now; ok "Autostart configurado (inicia ao entrar na sessao)"
  fi
fi

printf "\n   Verificando o servidor..."
SRV_OK=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fs --max-time 4 -H "X-NoeVFX-Client: 1" "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then SRV_OK=1; break; fi
  sleep 2
done
printf "\n"
if [ "$SRV_OK" = "1" ]; then ok "Servidor online em http://127.0.0.1:$PORT"
else err "O servidor nao respondeu. Veja o log: $DEST/server.log (ou ~/Library/Logs/NoeVFXDownloader.log)"; fi

# ------------------------------------------------- ultimo passo: extensao ----
if [ "$OS" = "Darwin" ] && command -v pbcopy >/dev/null 2>&1; then printf "%s" "$DEST/extension" | pbcopy
elif command -v wl-copy >/dev/null 2>&1; then printf "%s" "$DEST/extension" | wl-copy
elif command -v xclip >/dev/null 2>&1; then printf "%s" "$DEST/extension" | xclip -selection clipboard
elif command -v xsel >/dev/null 2>&1; then printf "%s" "$DEST/extension" | xsel --clipboard --input; fi

# guia visual com o caminho ja preenchido (abre no proprio navegador)
GUIDE="$DEST/guia-extensao.html"
if [ -f "$BASE/guia-extensao.html" ]; then
  EXTP="$DEST/extension"
  "$PY" -c "import sys,html; t=open(sys.argv[1],encoding='utf-8').read().replace('__EXT_PATH__', html.escape(sys.argv[2])); open(sys.argv[3],'w',encoding='utf-8').write(t)" \
    "$BASE/guia-extensao.html" "$EXTP" "$GUIDE" 2>>"$LOG" || GUIDE=""
else GUIDE=""; fi
# se existir store-url.txt (extensao publicada na loja), abre a pagina da loja: so clicar em "Adicionar"
OPEN_URL=""
if [ -f "$BASE/store-url.txt" ] && grep -q '^https://' "$BASE/store-url.txt" 2>/dev/null; then OPEN_URL="$(head -n1 "$BASE/store-url.txt" | tr -d '\r\n')"
elif [ -n "$GUIDE" ]; then OPEN_URL="file://$GUIDE"; fi

if [ "${NOEVFX_NO_BROWSER:-0}" != "1" ] && [ -n "$OPEN_URL" ]; then
  if [ "$OS" = "Darwin" ]; then
    open -a "Google Chrome" "$OPEN_URL" >/dev/null 2>&1 || open -a "Microsoft Edge" "$OPEN_URL" >/dev/null 2>&1 \
      || open -a "Brave Browser" "$OPEN_URL" >/dev/null 2>&1 || open "$OPEN_URL" >/dev/null 2>&1
  else
    OPENED=0
    for b in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge brave-browser vivaldi opera; do
      if command -v "$b" >/dev/null 2>&1; then "$b" "$OPEN_URL" >/dev/null 2>&1 & OPENED=1; break; fi
    done
    [ "$OPENED" = "0" ] && command -v xdg-open >/dev/null 2>&1 && xdg-open "$OPEN_URL" >/dev/null 2>&1 &
  fi
fi

cat <<EOF

============================================================
        ULTIMO PASSO - SO 3 CLIQUES (2 minutos)
============================================================

 (um guia com estes passos abriu no seu navegador)

 1. No navegador (Chrome, Edge, Brave...) abra  chrome://extensions
 2. Ligue "Modo do desenvolvedor"  (canto da pagina)
 3. Clique em "Carregar sem compactacao" e escolha a pasta:

      $DEST/extension

    (o caminho ja esta copiado: no Mac use Cmd+Shift+G e cole)

 Use a pasta INSTALADA acima, nao a pasta extraida do ZIP.
 Na primeira abertura a extensao pergunta onde salvar os videos.

 ATUALIZANDO? Falta 1 clique: em chrome://extensions, "Recarregar"
 no cartao do Noe VFX Downloader.

 Desinstalar:  bash desinstalar-noevfx.sh
 Log da instalacao: $LOG
============================================================

EOF
if [ "$WARNINGS" -gt 0 ]; then printf "${C_WARN}Atencao: %s aviso(s) acima. O app funciona, mas leia-os.${C_OFF}\n\n" "$WARNINGS"; fi
exit 0
