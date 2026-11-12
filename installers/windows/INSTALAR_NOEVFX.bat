@echo off
setlocal EnableExtensions EnableDelayedExpansion
title NOE VFX Downloader 3.0 - Instalador (noevfx.com)
color 0B
cls
echo.
echo  ============================================================
echo        NOE VFX DOWNLOADER  v3.0  -  AUTO-INSTALADOR
echo                    https://noevfx.com
echo  ============================================================
echo.
echo  IMPORTANTE: nao clique dentro desta janela enquanto instala
echo  (clicar seleciona texto e trava a instalacao).
echo.
echo  Esta pasta serve SOMENTE para instalar. O programa sera
echo  copiado para a pasta do usuario e rodara de la.
echo.
echo  O instalador vai:
echo    1. Verificar o Python
echo    2. Copiar a extensao e o servidor e JA LIGAR o servidor
echo    3. Verificar yt-dlp e FFmpeg (so baixa se faltar)
echo    4. Abrir a pasta do programa e o navegador (3 cliques)
echo.
echo  Nao pede senha de administrador.
echo.
pause

if not exist "%~dp0extension\manifest.json" (
    color 0C
    echo.
    echo  [ATENCAO] Voce abriu o instalador de dentro do arquivo ZIP!
    echo  Extraia o zip primeiro e abra windows\INSTALAR_NOEVFX.bat.
    echo.
    pause
    exit /b 1
)

set "TARGET=%LOCALAPPDATA%\NoeVFXDownloader"
set "BIN=%TARGET%\server\bin"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LAUNCHER=%TARGET%\Iniciar-Servidor.bat"
set "VBS=%STARTUP%\NoeVFXDownloader.vbs"
set "PATH=%PATH%;%LOCALAPPDATA%\Microsoft\WinGet\Links;%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%ProgramFiles%\Python312;%ProgramFiles%\Python312\Scripts"
where winget >nul 2>nul && set "HAS_WINGET=1"

rem ==========================================================================
rem  ETAPA 1 - PYTHON
rem ==========================================================================
echo.
echo  [1/4] Verificando o Python...
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY ( where python >nul 2>nul && set "PY=python" )
if defined PY goto :py_ok
echo        Python nao encontrado. Instalando automaticamente...
if not defined HAS_WINGET goto :py_manual
winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements
where py >nul 2>nul && set "PY=py -3"
if not defined PY ( where python >nul 2>nul && set "PY=python" )
if not defined PY goto :py_manual
:py_ok
echo        Python encontrado. OK
goto :copy

:py_manual
echo        Abrindo python.org. Marque "Add python.exe to PATH" e instale.
start "" "https://www.python.org/downloads/windows/"
pause
exit /b 1

rem ==========================================================================
rem  ETAPA 2 - COPIAR + CRIAR E LIGAR O SERVIDOR
rem ==========================================================================
:copy
echo.
if exist "%TARGET%\extension\manifest.json" echo  [2/4] ATUALIZANDO a instalacao existente em %TARGET%
if not exist "%TARGET%\extension\manifest.json" echo  [2/4] Copiando os arquivos para %TARGET%
if not exist "%TARGET%" mkdir "%TARGET%"
if not exist "%TARGET%\extension" mkdir "%TARGET%\extension"
if not exist "%TARGET%\server" mkdir "%TARGET%\server"
if not exist "%BIN%" mkdir "%BIN%"
xcopy /E /I /Y /Q "%~dp0extension\*" "%TARGET%\extension\" >nul
xcopy /E /I /Y /Q "%~dp0server\*" "%TARGET%\server\" >nul
if errorlevel 1 goto :copy_fail
echo        Copiado.

set "RUNCMD="
where pyw >nul 2>nul && set "RUNCMD=pyw -3"
if defined RUNCMD goto :have_python
where pythonw >nul 2>nul && set "RUNCMD=pythonw"
if defined RUNCMD goto :have_python
for /d %%D in ("%ProgramFiles%\Python*") do if not defined RUNCMD if exist "%%D\pythonw.exe" set "RUNCMD="%%D\pythonw.exe""
if defined RUNCMD goto :have_python
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python*") do if not defined RUNCMD if exist "%%D\pythonw.exe" set "RUNCMD="%%D\pythonw.exe""

:have_python
if not defined RUNCMD goto :no_python
if not exist "%STARTUP%" mkdir "%STARTUP%"
del /F /Q "%LAUNCHER%" >nul 2>nul
del /F /Q "%VBS%" >nul 2>nul

> "%LAUNCHER%" echo @echo off
>> "%LAUNCHER%" echo cd /d "%TARGET%\server"
>> "%LAUNCHER%" echo %RUNCMD% "%TARGET%\server\server.py" ^>^> "%TARGET%\server.log" 2^>^&1

> "%VBS%" echo Set sh = CreateObject("WScript.Shell")
>> "%VBS%" echo sh.Run Chr(34) ^& "%LAUNCHER%" ^& Chr(34), 0, False
>> "%VBS%" echo Set sh = Nothing

if not exist "%VBS%" goto :no_python
echo        Arquivos de inicializacao criados.

echo        Ligando o servidor (oculto)...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*NoeVFXDownloader*server.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul
timeout /t 1 /nobreak >nul
wscript.exe "%VBS%"
timeout /t 4 /nobreak >nul

set "OK_SERVER=0"
for /l %%i in (1,1,8) do (
    call :health
    if !errorlevel! equ 0 (
        set "OK_SERVER=1"
        goto :server_ok
    )
    timeout /t 2 /nobreak >nul
)
:server_ok
if "%OK_SERVER%"=="1" echo        Servidor ONLINE em http://127.0.0.1:8765
if not "%OK_SERVER%"=="1" echo        [AVISO] servidor ainda nao respondeu - veja %TARGET%\server.log
goto :tools

:no_python
color 0E
echo.
echo  [AVISO] Nao encontrei o Python para rodar em segundo plano.
echo  Instale o Python marcando "Add python.exe to PATH" e rode de novo.
echo.
pause
goto :tools

:copy_fail
color 0E
echo.
echo  [ERRO] Falha ao copiar os arquivos. Rode como o mesmo usuario
echo  que abriu o zip (nao como administrador).
echo.
pause
exit /b 1

rem ==========================================================================
rem  ETAPA 3 - yt-dlp e FFmpeg (so baixa se faltar)
rem ==========================================================================
:tools
echo.
echo  [3/4] Verificando o motor de download (yt-dlp) e o FFmpeg...

set "HAS_YTDLP=0"
if exist "%BIN%\yt-dlp.exe" set "HAS_YTDLP=1"
if "%HAS_YTDLP%"=="1" goto :yt_ok
where yt-dlp >nul 2>nul && set "HAS_YTDLP=1"
if "%HAS_YTDLP%"=="1" goto :yt_ok
echo        Baixando yt-dlp.exe (aprox. 18 MB)...
call :download "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" "%BIN%\yt-dlp.exe"
if exist "%BIN%\yt-dlp.exe" goto :yt_ok
if defined HAS_WINGET winget install --id yt-dlp.yt-dlp -e --accept-source-agreements --accept-package-agreements
:yt_ok
if exist "%BIN%\yt-dlp.exe" echo        yt-dlp OK.
if not exist "%BIN%\yt-dlp.exe" where yt-dlp >nul 2>nul && echo        yt-dlp OK.
if not exist "%BIN%\yt-dlp.exe" where yt-dlp >nul 2>nul || echo        [AVISO] yt-dlp nao instalado agora.

set "HAS_FF=0"
if exist "%BIN%\ffmpeg.exe" set "HAS_FF=1"
if "%HAS_FF%"=="1" goto :ff_ok
where ffmpeg >nul 2>nul && set "HAS_FF=1"
if "%HAS_FF%"=="1" goto :ff_ok
if defined HAS_WINGET (
    echo        Instalando FFmpeg pelo winget...
    winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
)
where ffmpeg >nul 2>nul && set "HAS_FF=1"
if "%HAS_FF%"=="1" goto :ff_ok
if exist "%BIN%\ffmpeg.exe" goto :ff_ok
echo        Baixando FFmpeg portatil (aprox. 90 MB)...
call :download "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" "%TEMP%\noevfx_ffmpeg.zip"
if exist "%TEMP%\noevfx_ffmpeg.zip" call :unzip_ffmpeg
:ff_ok
if exist "%BIN%\ffmpeg.exe" echo        FFmpeg OK.
if exist "%BIN%\ffmpeg.exe" goto :final
where ffmpeg >nul 2>nul && echo        FFmpeg OK.
where ffmpeg >nul 2>nul || echo        [AVISO] FFmpeg ausente: a uniao de video+audio pode falhar.

rem ==========================================================================
rem  PASSO FINAL
rem ==========================================================================
:final
echo.
echo  Copiando o caminho da extensao para a Area de Transferencia...
echo %TARGET%\extension| clip

echo  Abrindo a pasta do NOE VFX (arraste a pasta "extension"
echo  para a pagina de extensoes do navegador)...
start "" explorer.exe "%TARGET%"

set "BROWSER="
set "PF86=%ProgramFiles(x86)%"
if exist "%PF86%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%PF86%\Microsoft\Edge\Application\msedge.exe|edge://extensions/"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe|edge://extensions/"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe|chrome://extensions/"
if not defined BROWSER if exist "%PF86%\Google\Chrome\Application\chrome.exe" set "BROWSER=%PF86%\Google\Chrome\Application\chrome.exe|chrome://extensions/"
if not defined BROWSER if exist "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe" set "BROWSER=%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe|brave://extensions/"

cls
echo.
echo  ============================================================
echo           ULTIMO PASSO - SO 3 CLIQUES  (2 minutos)
echo  ============================================================
echo.
echo    PASSO 1 . Ligue "Modo de desenvolvedor"
echo    PASSO 2 . Clique em "Carregar sem pacote"
echo    PASSO 3 . Na janela que abrir, entre na pasta "extension"
echo              (ela esta aberta na sua tela) e clique em
echo              "Selecionar pasta"
echo.
echo  ATENCAO: use a pasta que acabou de abrir (a INSTALADA),
echo  NAO a pasta extraida do ZIP. O navegador guarda o caminho
echo  e a extensao quebra se voce apagar a pasta extraida.
echo.
echo  Caminho (ja copiado): %TARGET%\extension
echo.
echo  Pagina de extensoes:  edge://extensions   ou   chrome://extensions
echo.
echo  ============================================================
echo.
if defined BROWSER (
    for /f "tokens=1,2 delims=|" %%a in ("%BROWSER%") do start "" "%%a" "%%b"
) else (
    echo  Abra seu navegador Chromium em chrome://extensions
)
echo.
pause

echo.
echo  Testando o servidor...
call :health
if errorlevel 1 (
    color 0E
    echo  Servidor: OFFLINE - veja %TARGET%\server.log
) else (
    color 0A
    echo  Servidor: ONLINE - tudo pronto!
)
echo.
echo  ------------------------------------------------------------
echo  Esta pasta extraida pode ser APAGADA agora.
echo.
echo  JA TINHA O NOE VFX INSTALADO? Isto foi uma ATUALIZACAO.
echo  Falta 1 clique: abra edge://extensions (ou chrome://extensions)
echo  e clique em "Recarregar" no cartao do NOE VFX Downloader.
echo.
echo  Programa instalado em: %TARGET%
echo  Pasta padrao de downloads: %USERPROFILE%\Downloads\NoeVFX
echo  (voce troca na primeira vez que abrir a extensao)
echo.
echo  Desinstalar depois: windows\DESINSTALAR_NOEVFX.bat
echo  ------------------------------------------------------------
echo.
pause
exit /b 0

rem ==========================================================================
:download
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;Invoke-WebRequest -Uri '%~1' -OutFile '%~2' -UseBasicParsing -TimeoutSec 180;exit 0}catch{exit 1}" >nul 2>nul
exit /b 0

:unzip_ffmpeg
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{Expand-Archive -LiteralPath '%TEMP%\noevfx_ffmpeg.zip' -DestinationPath '%TEMP%\noevfx_ffmpeg' -Force; $b=Get-ChildItem -Path '%TEMP%\noevfx_ffmpeg' -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1; if($b){Copy-Item $b.FullName '%BIN%\ffmpeg.exe' -Force}; $p=Get-ChildItem -Path '%TEMP%\noevfx_ffmpeg' -Recurse -Filter 'ffprobe.exe' | Select-Object -First 1; if($p){Copy-Item $p.FullName '%BIN%\ffprobe.exe' -Force}; exit 0}catch{exit 1}" >nul
del /Q "%TEMP%\noevfx_ffmpeg.zip" >nul 2>nul
rmdir /S /Q "%TEMP%\noevfx_ffmpeg" >nul 2>nul
exit /b 0

:health
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/health' -Headers @{'X-NoeVFX-Client'='1'} -TimeoutSec 4;if($r.ok){exit 0}}catch{};exit 1" >nul 2>nul
exit /b %errorlevel%
