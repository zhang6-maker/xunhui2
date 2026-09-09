@echo off
chcp 65001 >nul
echo ========================================
echo   语音助手快速启动脚本
echo ========================================
echo.

echo [1/3] 检查依赖...
if not exist "node_modules\" (
    echo 未检测到依赖，正在安装...
    call npm install
    if errorlevel 1 (
        echo ❌ 依赖安装失败！
        pause
        exit /b 1
    )
) else (
    echo ✅ 依赖已安装
)

echo.
echo [2/3] 检查Vosk模型...
if not exist "model\" (
    echo ⚠️  未检测到Vosk模型！
    echo.
    echo 请按以下步骤操作：
    echo 1. 访问 https://alphacephei.com/vosk/models
    echo 2. 下载中文模型（推荐 vosk-model-small-cn-0.22）
    echo 3. 解压到当前目录的 model 文件夹中
    echo.
    set /p continue="模型已准备好？(Y/N): "
    if /i not "%continue%"=="Y" (
        echo 已取消启动
        pause
        exit /b 0
    )
) else (
    echo ✅ Vosk模型已就绪
)

echo.
echo [3/3] 启动应用...
echo.
echo ========================================
echo   应用启动中...
echo   WebSocket服务器: ws://localhost:8080
echo ========================================
echo.

call npm start

pause
