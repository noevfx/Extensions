@echo off
setlocal EnableExtensions
title Desinstalador - Noe VFX Downloader
color 0E
cls
echo.
echo  ==========================================================
echo     DESINSTALADOR  -  Noe VFX Downloader  (noevfx.com)
echo  ==========================================================
echo.
echo  Isto vai remover:
echo    - a inicializacao automatica do servidor
echo    - os arquivos instalados em %%LOCALAPPDATA%%\NoeVFXDownloader
echo.
echo  Os VIDEOS ja baixados NAO serao apagados.
echo.
set /p CONF=" Continuar? (S/N): "
if /i not "%CONF%"=="S" (
    echo Cancelado.
    pause
    exit /b 0
)

echo.
echo  [1/4] Parando o servidor...
rem Encerra (1) o que roda da pasta instalada e (2) QUALQUER servidor do Noe VFX escutando na porta 8765,
rem mesmo um iniciado a mao de outra pasta (esse segurava a porta e impedia a versao nova de assumir).
powershell -NoProfile -Command "try{Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*NoeVFXDownloader*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}catch{}; try{$h=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/health' -Headers @{'X-NoeVFX-Client'='1'} -TimeoutSec 3; if($h.brand -like '*VFX*noevfx.com*'){ Get-NetTCPConnection -LocalPort 8765 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }}catch{}" >nul 2>nul
timeout /t 2 /nobreak >nul

echo  [2/4] Removendo inicializacao automatica...
del /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\NoeVFXDownloader.vbs" >nul 2>nul

echo  [3/4] Removendo arquivos...
rmdir /S /Q "%LOCALAPPDATA%\NoeVFXDownloader" >nul 2>nul
if exist "%LOCALAPPDATA%\NoeVFXDownloader" (
    echo  [AVISO] Nao consegui apagar tudo: algum arquivo esta em uso.
    echo          Reinicie o Windows e rode este desinstalador de novo.
)
set "NVF_PORT_BUSY="
powershell -NoProfile -Command "try{Invoke-RestMethod -Uri 'http://127.0.0.1:8765/health' -Headers @{'X-NoeVFX-Client'='1'} -TimeoutSec 3 | Out-Null; exit 0}catch{exit 1}" >nul 2>nul && set "NVF_PORT_BUSY=1"
if defined NVF_PORT_BUSY (
    echo  [AVISO] Ainda ha um servidor respondendo na porta 8765. Reinicie o Windows para encerra-lo.
)

echo  [4/4] Pronto.
echo.
color 0A
echo  ==========================================================
echo   DESINSTALADO COM SUCESSO
echo.
echo   Falta 1 passo manual no navegador:
echo     - Abra edge://extensions  ou  chrome://extensions
echo     - Clique em "Remover" no cartao do Noe VFX Downloader
echo  ==========================================================
echo.
pause
