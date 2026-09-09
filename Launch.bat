@echo off
title XunHui Desktop Pet - Portable
cd /d "%~dp0"

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_NO_ATTACH_CONSOLE="

set "DATA_ROOT=%ROOT%\UserData"
set "USERPROFILE=%DATA_ROOT%\Home"
set "HOME=%DATA_ROOT%\Home"
set "APPDATA=%DATA_ROOT%\Roaming"
set "LOCALAPPDATA=%DATA_ROOT%\Local"

if not exist "%USERPROFILE%\Desktop" mkdir "%USERPROFILE%\Desktop" >nul 2>&1
if not exist "%APPDATA%" mkdir "%APPDATA%" >nul 2>&1
if not exist "%LOCALAPPDATA%" mkdir "%LOCALAPPDATA%" >nul 2>&1

echo ============================================================
echo   XunHui Desktop Pet - Portable Edition
echo   Data folder: %DATA_ROOT%
echo ============================================================

if not exist "%ROOT%\node_modules\electron\dist\electron.exe" (
    echo [ERROR] Electron not found. Portable package is incomplete.
    pause
    exit /b 1
)
echo [OK] Electron ready

if exist "%ROOT%\python_portable\python.exe" (
    echo [OK] Portable Python ready
) else (
    echo [WARN] Portable Python missing - voice features disabled
)

if exist "%ROOT%\bin\vosk-model-cn-0.22" (
    echo [OK] Chinese speech model ready
) else (
    echo [WARN] Speech model missing - voice input disabled
)

rem ===== Bundled Ollama: auto-start local inference so AI chat works offline =====
set "OLLAMA_HOME=%ROOT%\OllamaHome"
set "OLLAMA_MODELS=%ROOT%\OllamaHome\models"
set "OLLAMA_HOST=127.0.0.1:11435"
if not exist "%ROOT%\Ollama\ollama.exe" goto NO_OLLAMA
echo [OK] Bundled Ollama found, starting local server...
netstat -ano | findstr ":11435" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto OLLAMA_UP
start "" /min "%ROOT%\Ollama\ollama.exe" serve
echo        waiting for Ollama to be ready (up to 30s)...
for /L %%i in (1,1,30) do (
    netstat -ano | findstr ":11435" | findstr "LISTENING" >nul 2>&1
    if not errorlevel 1 goto OLLAMA_UP
    timeout /t 1 >nul
)
echo [WARN] Ollama did not start in time; AI chat may be unavailable.
goto OLLAMA_DONE
:OLLAMA_UP
echo [OK] Ollama local server started.
goto OLLAMA_DONE
:OLLAMA_REUSE
echo [OK] Port 11434 already in use (your own Ollama?) - reuse it.
goto OLLAMA_DONE
:NO_OLLAMA
echo [NOTE] No bundled Ollama; set Ollama URL to LAN/cloud in settings.
:OLLAMA_DONE

echo.
echo Starting XunHui, please wait...
start "" "%ROOT%\node_modules\electron\dist\electron.exe" "%ROOT%" --user-data-dir="%DATA_ROOT%\ElectronProfile"

timeout /t 6 >nul
exit /b 0
