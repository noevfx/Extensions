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
powershell -NoProfile -Command "try{Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*NoeVFXDownloader*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}catch{}" >nul 2>nul

echo  [2/4] Removendo inicializacao automatica...
del /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\NoeVFXDownloader.vbs" >nul 2>nul

echo  [3/4] Removendo arquivos...
rmdir /S /Q "%LOCALAPPDATA%\NoeVFXDownloader" >nul 2>nul

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
