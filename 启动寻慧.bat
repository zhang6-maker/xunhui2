@echo off
title 寻慧桌面小精灵 - 便携版
cd /d "%~dp0"

rem ===== 定位自身所在目录（U 盘盘符怎么变都不受影响）=====
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

rem ===== 关键：清掉会让 Electron 退化成纯 Node 的环境变量 =====
set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_NO_ATTACH_CONSOLE="

rem ===== 把个人数据整体重定向到 U 盘，主机不留痕 =====
set "DATA_ROOT=%ROOT%\UserData"
set "USERPROFILE=%DATA_ROOT%\Home"
set "HOME=%DATA_ROOT%\Home"
set "APPDATA=%DATA_ROOT%\Roaming"
set "LOCALAPPDATA=%DATA_ROOT%\Local"

if not exist "%USERPROFILE%\Desktop" mkdir "%USERPROFILE%\Desktop" >nul 2>&1
if not exist "%APPDATA%" mkdir "%APPDATA%" >nul 2>&1
if not exist "%LOCALAPPDATA%" mkdir "%LOCALAPPDATA%" >nul 2>&1

echo ============================================================
echo   寻慧桌面小精灵 - 便携版
echo   数据目录: %DATA_ROOT%
echo ============================================================

rem ===== 运行环境自检 =====
if not exist "%ROOT%\node_modules\electron\dist\electron.exe" (
    echo [错误] 找不到 Electron，便携包不完整。
    pause
    exit /b 1
)
echo [OK] Electron 就绪
if not exist "%ROOT%\python_portable\python.exe" (
    echo [警告] 找不到便携 Python，语音识别与朗读功能不可用。
) else (
    echo [OK] 便携 Python 就绪
)
if not exist "%ROOT%\bin\vosk-model-cn-0.22" (
    echo [警告] 找不到中文语音模型，语音识别功能不可用。
) else (
    echo [OK] 中文语音模型就绪
)

rem ===== 内置 Ollama：自动拉起本地推理，让 AI 对话离线可用 =====
set "OLLAMA_HOME=%ROOT%\OllamaHome"
set "OLLAMA_MODELS=%ROOT%\OllamaHome\models"
set "OLLAMA_HOST=127.0.0.1:11435"
if not exist "%ROOT%\Ollama\ollama.exe" goto NO_OLLAMA
echo [OK] 内置 Ollama 就绪，正在启动本地推理服务...
netstat -ano | findstr ":11435" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto OLLAMA_UP
start "" /min "%ROOT%\Ollama\ollama.exe" serve
echo        等待 Ollama 就绪（最多 30 秒）...
for /L %%i in (1,1,30) do (
    netstat -ano | findstr ":11435" | findstr "LISTENING" >nul 2>&1
    if not errorlevel 1 goto OLLAMA_UP
    timeout /t 1 >nul
)
echo [警告] Ollama 启动超时，AI 对话可能不可用。
goto OLLAMA_DONE
:OLLAMA_UP
echo [OK] Ollama 本地服务已启动。
goto OLLAMA_DONE
:OLLAMA_REUSE
echo [OK] 端口 11434 已被占用（可能是你自己的 Ollama），直接复用。
goto OLLAMA_DONE
:NO_OLLAMA
echo [提示] 未找到内置 Ollama，可在设置里把地址改指向局域网/云端。
:OLLAMA_DONE

echo.
echo 正在启动寻慧，请稍候...
start "" "%ROOT%\node_modules\electron\dist\electron.exe" "%ROOT%" --user-data-dir="%DATA_ROOT%\ElectronProfile"

timeout /t 3 >nul
exit /b 0
