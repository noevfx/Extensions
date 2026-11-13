@echo off
setlocal EnableExtensions
title Noe VFX Downloader 3.0.16 - Instalador (noevfx.com)
color 0B
cls
echo.
echo  ============================================================
echo        Noe VFX Downloader  v3.0.16  -  AUTO-INSTALADOR
echo                    https://noevfx.com
echo  ============================================================
echo.
echo  Instala sozinho o Python, o yt-dlp, o FFmpeg e o Deno
echo  (so baixa o que faltar) e liga o servidor. Nao pede senha
echo  de administrador. Leva de 1 a 5 minutos.
echo.
echo  IMPORTANTE: nao clique dentro desta janela enquanto instala
echo  (clicar seleciona texto e trava a instalacao).
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
if not exist "%~dp0instalar-noevfx.ps1" (
    color 0C
    echo.
    echo  [ATENCAO] Falta o arquivo instalar-noevfx.ps1 ao lado deste instalador.
    echo  Extraia o zip inteiro e tente de novo.
    echo.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-noevfx.ps1"
echo.
pause
exit /b 0
