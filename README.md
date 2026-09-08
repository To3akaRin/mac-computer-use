# mac-computer-use

让 Agent 操作 Mac 桌面应用：先观察，优先后台读写，需要时受控使用前台，并明确区分“已发送事件”和“已验证结果”。

独立运行的 Agent Skill，包含 Swift 原生命令行工具和 Node.js CDP 工具。适用于桌面应用自动化、窗口截图、中文输入和界面验收；普通网页优先使用浏览器工具。

## 快速开始

要求 macOS 14+、Swift 6 Command Line Tools；CDP 另需 Node.js 22.4+。当前发布的实际验证范围见 [验收报告](docs/acceptance.md)。

```bash
xcode-select --install
# 如果已经安装 Command Line Tools，无需重复安装。
git clone https://github.com/To3akaRin/mac-computer-use.git
cd mac-computer-use
bash scripts/build.sh
.build/release/mac-computer-use doctor
.build/release/mac-computer-use help
node scripts/cdp.mjs --help
```

在系统设置 → 隐私与安全中，为启动工具的宿主终端或 Agent 应用授予“辅助功能”和“屏幕与系统音频录制”（名称依系统版本不同）。权限由用户在系统界面授予；工具不修改权限数据库。授权后重新启动宿主，再运行 `doctor`。

## 安装为 Skill

仓库根目录就是技能目录。Codex 可直接克隆到个人技能目录；若已有同名目录，先检查，不覆盖。

```bash
mkdir -p "$HOME/.codex/skills"
git clone https://github.com/To3akaRin/mac-computer-use.git "$HOME/.codex/skills/mac-computer-use"
cd "$HOME/.codex/skills/mac-computer-use"
bash scripts/build.sh
```

在支持 Agent Skills 的工具中，将本目录放入该工具的技能发现路径。Codex 附带界面元数据；其他 Agent 使用 `SKILL.md` 和同一套可执行脚本。没有专属 MCP 依赖，也不会自动安装或更新自己。

## 使用示例

```bash
mkdir -p artifacts
.build/release/mac-computer-use probe --app com.apple.TextEdit
.build/release/mac-computer-use windows
# 将下面的 12345 换为 windows 实际返回的窗口 id。
.build/release/mac-computer-use ax --window 12345 --snapshot-out artifacts/window.json
.build/release/mac-computer-use shot --window 12345 --output artifacts/window.png --snapshot-out artifacts/window-image.json
```

截图、快照绑定实际窗口。写操作的参数与完整例子见 [命令接口](API.md)，先做 `--dry-run` 再执行。返回未知时重新观察，不重复发送。

对于已经开放本地 CDP 的桌面应用：

```bash
node scripts/cdp.mjs targets --endpoint http://127.0.0.1:9222
node scripts/cdp.mjs snapshot --endpoint http://127.0.0.1:9222 --target PAGE_ID
```

`PAGE_ID` 必须来自探测结果。端口也必须使用目标应用实际开放的端口；仅指定端口不会自动启动、重启或修改应用。

## 设计与目录

- `Sources/`：Swift 原生控制、可测试规则及专用测试窗口。
- `scripts/`：编译入口及零运行时 npm 依赖的 CDP 客户端。
- `tests/`：自动化测试与隔离测试页面。
- `references/`：Agent 按需阅读的控制流程、权限排障和验证说明。
- `docs/`：实施规格、验收记录；`agents/`：Codex 元数据。

Swift 调用 AppKit、辅助功能、CoreGraphics 和 ScreenCaptureKit；Node.js 使用原生 HTTP/WebSocket。控制宿主桌面不能部署在普通 Docker 容器中，本项目没有服务端或数据库。

## 开发与测试

```bash
bash scripts/build.sh
swift test
.build/release/NativeSelfTest
npm test
node --check scripts/cdp.mjs
node --check scripts/lib/cdp.mjs
bash -n scripts/build.sh
```

真实 GUI 测试需要登录中的 Mac 桌面和系统权限。无桌面 CI 只能验证构建、纯逻辑和协议模拟，不能证明真实 GUI 操作成功。具体命令与本机结果见验收报告。

遵循 [贡献指南](CONTRIBUTING.md)，修改行为时同步接口和参考文档。版本记录见 [CHANGELOG](CHANGELOG.md)。

## 配置与数据

不需要 `.env` 或 API Key；窗口、端口、超时和输出位置由命令参数明确传入。`artifacts/`、`evidence/`、`.env` 和构建缓存默认不进入 Git。真实截图、输入内容和日志不会自动上传，也不会自动写进技能文档。

## 常见问题

- **窗口或元素不可访问**：先检查 `doctor`，再重新列窗口和生成快照；不要复用已经移动或关闭窗口的引用。
- **写入返回未知**：表示工具无法确认后置结果，不等于未执行。通过新的 AX、页面状态或产物检查后再决定下一步。
- **无法操作其他桌面**：后台读取是否可用取决于应用；前台输入不自动跨桌面，需将目标放到当前桌面。
- **CDP 连接失败**：检查应用是否真正支持并启用了调试端口。不要因为它含有 Chromium 组件就假定调试可用。
- **测试框架不可用**：精简 Command Line Tools 可能缺少 XCTest；完整自动测试可在包含 XCTest 的 Xcode/macOS CI 环境运行，本机自检与实测范围单独记录。

## 许可证

MIT，Copyright (c) 2026 To3akaRin。项目不提供第三方应用的通用成功保证，兼容性以实际验收记录为准。

可选的真实 CDP 验收使用独立临时浏览器目录。`CHROME_BINARY` 仅用于指定测试浏览器，不影响用户当前 Chrome 配置：

```bash
CHROME_BINARY='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:cdp-live
```

本次新增环境变量只有上述可选测试配置，默认路径适用于标准 Chrome 安装；运行工具本身无需配置环境变量。

原生实机验收另需 Python 3（仅测试脚本使用），运行前请暂时停止键鼠操作：

```bash
python3 scripts/native-smoke.py
```

该脚本创建并清理专用测试应用，只操作合成测试内容。
