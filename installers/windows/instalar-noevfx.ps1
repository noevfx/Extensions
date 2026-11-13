# =============================================================================
#  Noe VFX Downloader 3.0.16 - Instalador (Windows)                 noevfx.com
#
#  Instala TUDO sozinho, sem administrador e sem pedir nada ao usuario:
#    - Python (usa o do sistema se for 3.9+; senao baixa um portatil)
#    - yt-dlp (com checagem SHA-256) e Deno (necessario para o YouTube)
#    - FFmpeg (usa o do sistema; senao baixa um portatil, com checagem SHA-256)
#    - servidor local em segundo plano (inicia junto com o Windows)
#
#  Pode rodar de novo quando quiser (atualiza). Chamado por INSTALAR_NOEVFX.bat.
#  Variaveis (teste): NOEVFX_TARGET, NOEVFX_PORT, NOEVFX_NO_STARTUP=1,
#                     NOEVFX_NO_BROWSER=1, NOEVFX_FORCE_PORTABLE_PYTHON=1
#  (arquivo so com caracteres ASCII, de proposito: o PowerShell 5.1 le acentos errado)
# =============================================================================
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13 } catch { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 }

$Base   = Split-Path -Parent $MyInvocation.MyCommand.Path
$Target = if ($env:NOEVFX_TARGET) { $env:NOEVFX_TARGET } else { Join-Path $env:LOCALAPPDATA 'NoeVFXDownloader' }
$Port   = if ($env:NOEVFX_PORT) { $env:NOEVFX_PORT } else { '8765' }
$Bin    = Join-Path $Target 'server\bin'
$Tools  = Join-Path $Target 'tools'
$Log    = Join-Path $Target 'install.log'
$Tmp    = Join-Path $env:TEMP ('noevfx_inst_' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$GH     = 'https://github.com'
$script:Warnings = 0

function Note($m) { try { Add-Content -LiteralPath $Log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m) } catch {} }
function Ok($m)   { Write-Host ('   OK  ' + $m) -ForegroundColor Green }
function Warn($m) { $script:Warnings++; Write-Host ('   !   ' + $m) -ForegroundColor Yellow; Note ('AVISO: ' + $m) }
function Err($m)  { $script:Warnings++; Write-Host ('   X   ' + $m) -ForegroundColor Red; Note ('ERRO: ' + $m) }
function Step($m) { Write-Host ''; Write-Host ('> ' + $m) -ForegroundColor Cyan }
function Say($m)  { Write-Host ('   ' + $m) }

Write-Host ''
Write-Host '============================================================'
Write-Host '        Noe VFX Downloader  v3.0.16  -  INSTALADOR'
Write-Host '                 https://noevfx.com'
Write-Host '============================================================'
Write-Host ''
Write-Host ('Instalando em:  ' + $Target)
Write-Host 'Nao precisa de administrador nem de nenhum programa instalado antes.'

if (-not (Test-Path (Join-Path $Base 'extension\manifest.json'))) {
    Err 'Voce abriu o instalador de dentro do arquivo ZIP. Extraia o ZIP primeiro e rode de novo.'
    exit 1
}
New-Item -ItemType Directory -Force -Path $Target, $Bin, $Tools, $Tmp | Out-Null
Note "=== instalacao iniciada (Windows, porta $Port)"

# ------------------------------------------------------------- utilitarios ---
function Fetch([string]$Url, [string]$Dest) {
    for ($i = 1; $i -le 3; $i++) {
        try {
            Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing -TimeoutSec 900
            if ((Test-Path $Dest) -and ((Get-Item $Dest).Length -gt 0)) { return $true }
        } catch { Note ("download falhou ($i/3): $Url : " + $_.Exception.Message); Start-Sleep -Seconds 2 }
    }
    return $false
}
function Sha256([string]$File) { return (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLower() }

# extrai so os arquivos que casam com o padrao (rapido: nao descompacta o zip inteiro)
function Extract-Matching([string]$Zip, [string]$Pattern, [string]$OutDir) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $z = [IO.Compression.ZipFile]::OpenRead($Zip)
    $n = 0
    try {
        foreach ($e in $z.Entries) {
            if ($e.Name -and ($e.FullName -match $Pattern)) {
                [IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $OutDir $e.Name), $true)
                $n++
            }
        }
    } finally { $z.Dispose() }
    return $n
}

function Runs([string]$Exe, [string[]]$ArgList) {
    if (-not $Exe -or -not (Test-Path $Exe)) { return $false }
    try { & $Exe @ArgList *> $null; return ($LASTEXITCODE -eq 0) } catch { return $false }
}

# ----------------------------------------------------------- 1. copiar ------
Step '[1/6] Copiando a extensao e o servidor'
try {
    New-Item -ItemType Directory -Force -Path (Join-Path $Target 'extension'), (Join-Path $Target 'server') | Out-Null
    Copy-Item -Path (Join-Path $Base 'extension\*') -Destination (Join-Path $Target 'extension') -Recurse -Force -ErrorAction Stop
    Copy-Item -Path (Join-Path $Base 'server\*') -Destination (Join-Path $Target 'server') -Recurse -Force -ErrorAction Stop
    Ok ('Copiado para ' + $Target)
} catch {
    Err ('Nao consegui copiar os arquivos: ' + $_.Exception.Message + ' (rode como o mesmo usuario que abriu o zip, sem administrador)')
    exit 1
}

# ----------------------------------------------------------- 2. Python ------
Step '[2/6] Python'
$Py = ''
$Mpy = ''
$Uv = ''

function Test-Py([string]$Exe) {
    if (-not $Exe -or -not (Test-Path $Exe)) { return $false }
    if ($Exe -like '*\WindowsApps\*') { return $false }          # "atalho" da Microsoft Store, nao e Python de verdade
    try {
        $r = & $Exe -c 'import sys,ssl;print(1 if sys.version_info>=(3,9) else 0)' 2>$null
        return ("$r".Trim() -eq '1')
    } catch { return $false }
}

function Ensure-Uv {
    if ($script:Uv -and (Test-Path $script:Uv)) { return $true }
    $cand = Join-Path $Tools 'uv.exe'
    if (Test-Path $cand) { $script:Uv = $cand; return $true }
    Say 'Baixando o gerenciador de Python (uv, ~15 MB)...'
    $zip = Join-Path $Tmp 'uv.zip'
    if (-not (Fetch "$GH/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip" $zip)) { return $false }
    if ((Extract-Matching $zip '(^|/)uv\.exe$' $Tools) -lt 1) { return $false }
    if (Test-Path $cand) { $script:Uv = $cand; return $true }
    return $false
}

function Ensure-ManagedPython {
    if ($script:Mpy) { return $true }
    $env:UV_PYTHON_INSTALL_DIR = Join-Path $Target 'python'
    $env:UV_NO_CONFIG = '1'
    if (-not (Ensure-Uv)) { return $false }
    $p = (& $script:Uv python find 3.12 --managed-python 2>$null)
    if (-not (Test-Py "$p".Trim())) {
        Say 'Baixando um Python portatil (3.12, ~30 MB)...'
        & $script:Uv python install 3.12 *>> $Log
        $p = (& $script:Uv python find 3.12 --managed-python 2>$null)
    }
    if (Test-Py "$p".Trim()) { $script:Mpy = "$p".Trim(); return $true }
    return $false
}

if ($env:NOEVFX_FORCE_PORTABLE_PYTHON -ne '1') {
    $cands = New-Object System.Collections.ArrayList
    foreach ($m in (Get-ChildItem -Path (Join-Path $Target 'python') -Filter python.exe -Recurse -ErrorAction SilentlyContinue)) { [void]$cands.Add($m.FullName) }
    try { $pp = (& py -3 -c 'import sys;print(sys.executable)' 2>$null); if ($pp) { [void]$cands.Add("$pp".Trim()) } } catch {}
    foreach ($c in (Get-Command python.exe -All -ErrorAction SilentlyContinue)) { [void]$cands.Add($c.Source) }
    foreach ($g in @("$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe", "$env:ProgramFiles\Python3*\python.exe")) {
        foreach ($f in (Get-ChildItem -Path $g -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)) { [void]$cands.Add($f.FullName) }
    }
    foreach ($c in $cands) { if (Test-Py $c) { $Py = $c; break } }
}
if ($Py) {
    Ok ('Python do sistema: ' + (& $Py --version 2>&1) + '  (' + $Py + ')')
} elseif (Ensure-ManagedPython) {
    $Py = $script:Mpy
    Ok ('Python portatil: ' + (& $Py --version 2>&1))
} else {
    Err ('Nao consegui obter o Python. Veja a internet e rode de novo (detalhes: ' + $Log + ')')
    exit 1
}
$Pyw = Join-Path (Split-Path $Py) 'pythonw.exe'
if (-not (Test-Path $Pyw)) { $Pyw = $Py }
Note "python: $Py (pythonw: $Pyw)"

# ----------------------------------------------------------- 3. yt-dlp ------
Step '[3/6] yt-dlp (motor de download)'
$YtExe = Join-Path $Bin 'yt-dlp.exe'
if ((Test-Path $YtExe) -and (Runs $YtExe @('--version'))) {
    try { & $YtExe -U *>> $Log } catch {}                       # ja instalado: so atualiza
    Ok ('yt-dlp ' + (& $YtExe --version 2>$null))
} else {
    $okYt = $false
    $sums = Join-Path $Tmp 'SHA2-256SUMS'
    $dl = Join-Path $Tmp 'yt-dlp.exe'
    if ((Fetch "$GH/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS" $sums) -and (Fetch "$GH/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" $dl)) {
        $line = (Get-Content $sums | Where-Object { $_ -match '\s\*?yt-dlp\.exe\s*$' } | Select-Object -First 1)
        $want = if ($line) { ($line -split '\s+')[0].ToLower() } else { '' }
        if ($want -and ($want -eq (Sha256 $dl))) {
            Copy-Item $dl $YtExe -Force
            if (Runs $YtExe @('--version')) { $okYt = $true; Ok ('yt-dlp ' + (& $YtExe --version 2>$null) + ' (SHA-256 conferido)') }
        } else { Err 'O arquivo do yt-dlp nao passou na checagem de seguranca (SHA-256). Nao foi instalado.' }
    }
    if (-not $okYt) {
        if (Get-Command yt-dlp -ErrorAction SilentlyContinue) { Ok ('yt-dlp do sistema: ' + (& yt-dlp --version 2>$null)) }
        else { Err 'Nao consegui baixar o yt-dlp (veja a internet e rode de novo).' }
    }
}

# ----------------------------------------------------------- 4. FFmpeg ------
Step '[4/6] FFmpeg (junta video e audio)'
$FfBin = Join-Path $Bin 'ffmpeg.exe'
$ffOk = $false
if (Runs $FfBin @('-version')) { $ffOk = $true }
if (-not $ffOk) {
    $sys = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
    if ($sys -and (Runs $sys.Source @('-version'))) { $ffOk = $true; $FfBin = $sys.Source }
}
if (-not $ffOk) {
    $wg = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages') -Filter ffmpeg.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($wg -and (Runs $wg.FullName @('-version'))) { $ffOk = $true; $FfBin = $wg.FullName }
}
if (-not $ffOk) {
    Say 'Baixando o FFmpeg portatil (~110 MB, pode levar alguns minutos)...'
    $zip = Join-Path $Tmp 'ffmpeg.zip'
    $shaf = Join-Path $Tmp 'ffmpeg.sha256'
    if ((Fetch 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' $zip)) {
        $verified = $true
        if (Fetch 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256' $shaf) {
            $want = ((Get-Content $shaf -Raw).Trim() -split '\s+')[0].ToLower()
            if ($want -ne (Sha256 $zip)) { $verified = $false; Err 'O FFmpeg baixado nao passou na checagem SHA-256. Descartado.' }
        } else { Warn 'Nao consegui conferir o SHA-256 do FFmpeg (arquivo de checagem indisponivel).' }
        if ($verified -and ((Extract-Matching $zip '(^|/)bin/(ffmpeg|ffprobe)\.exe$' $Bin) -ge 1)) {
            $FfBin = Join-Path $Bin 'ffmpeg.exe'
            if (Runs $FfBin @('-version')) { $ffOk = $true }
        }
    }
}
if (-not $ffOk) {
    # plano B: FFmpeg empacotado no PyPI (imageio-ffmpeg)
    if ((Ensure-ManagedPython) -and (Ensure-Uv)) {
        & $script:Uv pip install --python $script:Mpy --target (Join-Path $Target 'pylib') --quiet imageio-ffmpeg *>> $Log
        $src = Get-ChildItem -Path (Join-Path $Target 'pylib\imageio_ffmpeg\binaries') -Filter 'ffmpeg-*' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($src) { Copy-Item $src.FullName (Join-Path $Bin 'ffmpeg.exe') -Force; $FfBin = Join-Path $Bin 'ffmpeg.exe'; if (Runs $FfBin @('-version')) { $ffOk = $true } }
    }
}
if ($ffOk) { Ok ('FFmpeg: ' + ((& $FfBin -version 2>$null | Select-Object -First 1) -replace '^(.{0,40}).*$', '$1')) }
else { Warn 'FFmpeg nao instalado: os downloads funcionam em formato unico (qualidade um pouco menor). Rode o instalador de novo com internet.' }

# ----------------------------------------------------------- 5. Deno --------
Step '[5/6] Deno (necessario para o YouTube)'
$DenoExe = Join-Path $Bin 'deno.exe'
if ((Test-Path $DenoExe) -or (Get-Command deno.exe -ErrorAction SilentlyContinue) -or (Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages') -Filter deno.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    Ok 'Deno disponivel'
} else {
    $zip = Join-Path $Tmp 'deno.zip'
    if ((Fetch "$GH/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip" $zip) -and ((Extract-Matching $zip '(^|/)deno\.exe$' $Bin) -ge 1) -and (Runs $DenoExe @('--version'))) { Ok 'Deno instalado' }
    else { Warn 'Deno nao instalado: o YouTube pode vir com menos qualidades.' }
}

# ----------------------------------------------------------- 6. servico -----
Step '[6/6] Servidor em segundo plano'
$Launcher = Join-Path $Target 'Iniciar-Servidor.bat'
$ServerPy = Join-Path $Target 'server\server.py'
$Want = ''
try { $Want = (Select-String -LiteralPath $ServerPy -Pattern '^VERSION = "([^"]+)"' | Select-Object -First 1).Matches[0].Groups[1].Value } catch {}

function Get-Health {
    try { return (Invoke-RestMethod -Uri ('http://127.0.0.1:' + $Port + '/health') -Headers @{ 'X-NoeVFX-Client' = '1' } -TimeoutSec 4) } catch { return $null }
}

# Encerra servidores do NOE VFX que estejam rodando: (1) os desta instalacao e (2) QUALQUER um escutando na porta
# (ex.: uma versao antiga iniciada a mao, de outra pasta: ela segura a porta e o servidor novo nunca assume).
function Stop-OldServers {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -like '*server.py*' -and $_.CommandLine -like ('*' + $Target + '*') } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    $h = Get-Health
    if ($h -and ($h.brand -like '*VFX*noevfx.com*')) {
        foreach ($c in @(Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction SilentlyContinue)) {
            Say ('Encerrando o servidor anterior que usava a porta ' + $Port + ' (versao ' + $h.version + ', PID ' + $c.OwningProcess + ')...')
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    } elseif ($h) {
        Warn ('A porta ' + $Port + ' esta ocupada por outro programa. Feche-o e rode o instalador de novo.')
    }
    for ($i = 0; $i -lt 12; $i++) {
        if (-not (Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 500
    }
}

$lines = @('@echo off', ('cd /d "' + (Join-Path $Target 'server') + '"'))
if ($Port -ne '8765') { $lines += ('set NOEVFX_PORT=' + $Port) }
$lines += ('"' + $Pyw + '" "' + $ServerPy + '" >> "' + (Join-Path $Target 'server.log') + '" 2>&1')
Set-Content -LiteralPath $Launcher -Value $lines -Encoding ASCII

$Vbs = ''
if ($env:NOEVFX_NO_STARTUP -ne '1') {
    $Startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
    New-Item -ItemType Directory -Force -Path $Startup | Out-Null
    $Vbs = Join-Path $Startup 'NoeVFXDownloader.vbs'
    $vbsLines = @('Set sh = CreateObject("WScript.Shell")', ('sh.Run Chr(34) & "' + $Launcher + '" & Chr(34), 0, False'), 'Set sh = Nothing')
    Set-Content -LiteralPath $Vbs -Value $vbsLines -Encoding ASCII
}

function Start-Server {
    if ($env:NOEVFX_NO_STARTUP -eq '1') {
        $env:NOEVFX_PORT = $Port
        Start-Process -FilePath $Pyw -ArgumentList ('"' + $ServerPy + '"') -WindowStyle Hidden -WorkingDirectory (Join-Path $Target 'server')
    } else {
        Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + $Vbs + '"') -WindowStyle Hidden
    }
}

# espera responder JA na versao que acabou de ser instalada (se ainda responde a antiga, nao conta como pronto)
function Wait-Server([string]$WantVer, [int]$Tries) {
    for ($i = 0; $i -lt $Tries; $i++) {
        $h = Get-Health
        if ($h -and $h.ok -and ((-not $WantVer) -or ($h.version -eq $WantVer))) { return $h }
        Start-Sleep -Seconds 2
    }
    return $null
}

Stop-OldServers
Start-Server
if ($env:NOEVFX_NO_STARTUP -eq '1') { Ok 'Servidor iniciado (sem instalar a inicializacao automatica: teste)' }
else { Ok 'Inicializacao automatica criada (o servidor liga junto com o Windows)' }

Say 'Verificando o servidor...'
$h = Wait-Server $Want 8
if (-not $h) {
    $cur = Get-Health
    if ($cur -and $cur.ok -and $Want -and ($cur.version -ne $Want)) {
        Warn ('Ainda responde a versao ' + $cur.version + ' (esperado ' + $Want + '). Tentando de novo...')
        Stop-OldServers
        Start-Server
        $h = Wait-Server $Want 10
    } elseif (-not $cur) {
        Start-Sleep -Seconds 4
        $h = Wait-Server $Want 6
    }
}
if ($h) { Ok ('Servidor online (versao ' + $h.version + ') em http://127.0.0.1:' + $Port) }
else { Err ('O servidor novo nao respondeu. Veja o log: ' + (Join-Path $Target 'server.log') + ' (se uma versao antiga ficou rodando, reinicie o Windows e rode o instalador de novo)') }

# ------------------------------------------------- ultimo passo: extensao ----
$ExtPath = Join-Path $Target 'extension'
# copia a pasta ACIMA: no seletor o usuario entra nela, ve a pasta "extension" e a seleciona
# (colar o caminho da propria "extension" abre DENTRO dela, onde nao ha nada para selecionar)
try { Set-Clipboard -Value $Target } catch {}
$Guide = Join-Path $Target 'guia-extensao.html'
try {
    $tpl = Join-Path $Base 'guia-extensao.html'
    if (Test-Path $tpl) {
        $html = (Get-Content -LiteralPath $tpl -Raw -Encoding UTF8).Replace('__EXT_PATH__', [System.Net.WebUtility]::HtmlEncode($ExtPath)).Replace('__APP_PATH__', [System.Net.WebUtility]::HtmlEncode($Target))
        [IO.File]::WriteAllText($Guide, $html, (New-Object System.Text.UTF8Encoding($false)))
    }
} catch { Note ('guia: ' + $_.Exception.Message) }
$OpenTarget = if (Test-Path $Guide) { $Guide } else { '' }

if ($env:NOEVFX_NO_BROWSER -ne '1') {
    $pf86 = ${env:ProgramFiles(x86)}
    $browsers = @(
        @("$pf86\Microsoft\Edge\Application\msedge.exe", 'edge://extensions/'),
        @("$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe", 'edge://extensions/'),
        @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", 'chrome://extensions/'),
        @("$pf86\Google\Chrome\Application\chrome.exe", 'chrome://extensions/'),
        @("$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe", 'chrome://extensions/'),
        @("$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe", 'brave://extensions/')
    )
    if ($OpenTarget) {
        $opened = $false
        foreach ($b in $browsers) { if (Test-Path $b[0]) { Start-Process -FilePath $b[0] -ArgumentList ('"' + $OpenTarget + '"'); $opened = $true; break } }
        if (-not $opened) { try { Start-Process -FilePath $OpenTarget } catch {} }
    }
    # Explorer na pasta do programa, com "extension" JA SELECIONADA: e so arrastar para a pagina de extensoes
    Start-Process explorer.exe -ArgumentList ('/select,"' + $ExtPath + '"')
}

Write-Host ''
Write-Host '============================================================'
Write-Host '         ULTIMO PASSO - SO 3 CLIQUES  (2 minutos)'
Write-Host '============================================================'
Write-Host ''
Write-Host '  (um guia com estes passos abriu no seu navegador, e o Explorer abriu'
Write-Host '   na pasta do programa com a pasta "extension" selecionada)'
Write-Host ''
Write-Host '  1. No navegador abra  edge://extensions  ou  chrome://extensions'
Write-Host '  2. Ligue "Modo do desenvolvedor"'
Write-Host '  3. ARRASTE a pasta "extension" (do Explorer) para dentro dessa pagina.'
Write-Host '     Ou: "Carregar sem pacote", cole o caminho abaixo (ja copiado), entre nessa'
Write-Host '     pasta, clique UMA vez em "extension" e em "Selecionar pasta":'
Write-Host ''
Write-Host ('       ' + $Target)
Write-Host ''
Write-Host '  Use a pasta INSTALADA, nao a pasta extraida do ZIP.'
Write-Host '  Na primeira abertura a extensao pergunta onde salvar os videos.'
Write-Host ''
Write-Host '  ATUALIZANDO? Falta 1 clique: em edge://extensions (ou chrome://extensions)'
Write-Host '  clique em "Recarregar" no cartao do Noe VFX Downloader.'
Write-Host ''
Write-Host '  Desinstalar: DESINSTALAR_NOEVFX.bat'
Write-Host ('  Log da instalacao: ' + $Log)
Write-Host '============================================================'
if ($script:Warnings -gt 0) { Write-Host ('Atencao: ' + $script:Warnings + ' aviso(s) acima. O app funciona, mas leia-os.') -ForegroundColor Yellow }
try { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue } catch {}
exit 0
