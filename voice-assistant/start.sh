#!/bin/bash

echo "========================================"
echo "  语音助手快速启动脚本"
echo "========================================"
echo ""

echo "[1/3] 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "未检测到依赖，正在安装..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败！"
        exit 1
    fi
else
    echo "✅ 依赖已安装"
fi

echo ""
echo "[2/3] 检查Vosk模型..."
if [ ! -d "model" ]; then
    echo "⚠️  未检测到Vosk模型！"
    echo ""
    echo "请按以下步骤操作："
    echo "1. 访问 https://alphacephei.com/vosk/models"
    echo "2. 下载中文模型（推荐 vosk-model-small-cn-0.22）"
    echo "3. 解压到当前目录的 model 文件夹中"
    echo ""
    read -p "模型已准备好？(Y/N): " continue
    if [ "$continue" != "Y" ] && [ "$continue" != "y" ]; then
        echo "已取消启动"
        exit 0
    fi
else
    echo "✅ Vosk模型已就绪"
fi

echo ""
echo "[3/3] 启动应用..."
echo ""
echo "========================================"
echo "  应用启动中..."
echo "  WebSocket服务器: ws://localhost:8080"
echo "========================================"
echo ""

npm start
