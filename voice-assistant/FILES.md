# 项目文件清单

## 📁 完整文件列表

```
voice-assistant/
├── package.json              # 项目配置文件，定义依赖和脚本
├── main.js                   # Electron主进程，WebSocket服务器
├── index.html                # 主界面HTML文件
├── renderer.js               # 渲染进程逻辑，Vosk + TTS
├── client.js                 # WebSocket客户端类
├── example-client.js         # 客户端使用示例
├── start.bat                 # Windows快速启动脚本
├── start.sh                  # Mac/Linux快速启动脚本
├── .gitignore                # Git忽略文件配置
├── README.md                 # 完整项目文档
├── QUICKSTART.md             # 快速入门指南
└── FILES.md                  # 本文件，项目文件清单
```

## 📄 文件说明

### 核心文件

| 文件 | 说明 | 必需 |
|------|------|------|
| `package.json` | 项目配置，定义依赖和启动脚本 | ✅ |
| `main.js` | Electron主进程，WebSocket服务器 | ✅ |
| `index.html` | 主界面HTML | ✅ |
| `renderer.js` | 渲染进程，语音识别和合成 | ✅ |

### 客户端文件

| 文件 | 说明 | 必需 |
|------|------|------|
| `client.js` | WebSocket客户端类 | ❌ |
| `example-client.js` | 客户端使用示例 | ❌ |

### 启动脚本

| 文件 | 说明 | 必需 |
|------|------|------|
| `start.bat` | Windows快速启动脚本 | ❌ |
| `start.sh` | Mac/Linux快速启动脚本 | ❌ |

### 文档文件

| 文件 | 说明 | 必需 |
|------|------|------|
| `README.md` | 完整项目文档 | ❌ |
| `QUICKSTART.md` | 快速入门指南 | ❌ |
| `FILES.md` | 项目文件清单 | ❌ |

### 配置文件

| 文件 | 说明 | 必需 |
|------|------|------|
| `.gitignore` | Git忽略文件配置 | ❌ |

## 📦 需要下载的文件

### Vosk模型（必需）

需要手动下载并放置到 `model/` 目录：

**推荐模型：**
- `vosk-model-small-cn-0.22` (约40MB)
  - 下载地址：https://alphacephei.com/vosk/models
  - 适合快速测试
  - 识别率：中等

- `vosk-model-cn-0.22` (约1.2GB)
  - 下载地址：https://alphacephei.com/vosk/models
  - 适合生产环境
  - 识别率：高

**目录结构：**
```
voice-assistant/
└── model/
    ├── am/
    ├── graph/
    ├── README
    └── ...
```

## 🔧 文件依赖关系

```
package.json
    ├── main.js
    │   └── index.html
    │       └── renderer.js
    │           ├── vosk (依赖)
    │           └── ws (依赖)
    │
    └── client.js
        └── example-client.js
            └── ws (依赖)
```

## 📝 最小运行需求

要运行此项目，至少需要以下文件：

1. `package.json`
2. `main.js`
3. `index.html`
4. `renderer.js`
5. `model/` (Vosk模型目录)

## 🚀 快速开始

1. 复制所有文件到新目录
2. 运行 `npm install` 安装依赖
3. 下载Vosk模型到 `model/` 目录
4. 运行 `npm start` 启动应用

## 📚 扩展文件

你可以添加以下文件来扩展功能：

- `config.json` - 自定义配置文件
- `custom-commands.js` - 自定义命令处理
- `ai-integration.js` - AI服务集成
- `database.js` - 数据库操作
- `utils.js` - 工具函数

## 🔍 文件大小参考

| 文件 | 大小 |
|------|------|
| `package.json` | ~1KB |
| `main.js` | ~5KB |
| `index.html` | ~4KB |
| `renderer.js` | ~8KB |
| `client.js` | ~2KB |
| `example-client.js` | ~1KB |
| `README.md` | ~10KB |
| `QUICKSTART.md` | ~3KB |
| `FILES.md` | ~2KB |
| `model/` (small) | ~40MB |
| `model/` (large) | ~1.2GB |

## ⚠️ 注意事项

1. **Vosk模型必需**：没有模型无法运行语音识别
2. **依赖安装**：必须先运行 `npm install`
3. **端口占用**：确保8080端口未被占用
4. **麦克风权限**：需要授予麦克风权限
5. **Node.js版本**：建议使用Node.js 14或更高版本

## 📞 获取帮助

如有问题，请查看：
- [README.md](README.md) - 完整文档
- [QUICKSTART.md](QUICKSTART.md) - 快速入门
- 提交Issue到项目仓库
