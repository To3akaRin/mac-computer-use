<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/mac-computer-use-logo-dark.svg">
  <img src="assets/mac-computer-use-logo-light.svg" alt="mac-computer-use" width="720">
</picture>

### 让 Agent 在你的 Mac 上真正动手。

看清窗口，执行操作，核对结果。

[English](README.md) · **简体中文**

![mac-computer-use 观察、操作与验证流程的展示插画](assets/readme-hero.gif)

<sub>Illustrative workflow · 流程展示插画。<a href="assets/readme-hero-poster.png">查看静态图</a></sub>

[快速上手](#快速上手) · [核心能力](#核心能力) · [工作流程](#观察--操作--验证) · [兼容范围](#一份技能多种-agent) · [下载](https://github.com/To3akaRin/mac-computer-use/releases/latest)

[![CI](https://github.com/To3akaRin/mac-computer-use/actions/workflows/ci.yml/badge.svg)](https://github.com/To3akaRin/mac-computer-use/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/To3akaRin/mac-computer-use)](https://github.com/To3akaRin/mac-computer-use/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![macOS](https://img.shields.io/badge/macOS-14%2B-black?logo=apple)](#环境要求)

</div>

把桌面任务交给 Agent。**mac-computer-use** 将 Mac 原生窗口、辅助功能控件和内嵌 Chromium 页面接入同一套工作流程：看清目标，执行操作，再核对实际结果。基于开放的 [Agent Skills 协议](https://agentskills.io/)，能读取完整技能包并在 Mac 本机执行命令的 runtime 即可接入。

## 从参考照片，走到能旋转的 3D 展区，全程没有人碰鼠标，12 分钟。

![用户提供的中央展区 3D 建模案例，浏览器中实际旋转录制](assets/showcase-3d.gif)

**实战案例：中央展区 3D 建模。** 中央柱体、顶部圆环、弧形柜体、门架、终端和收银台，组成一个可以在浏览器中转动、检查的三维空间。

**3,388 个三角面 · 117 个网格 · 单文件 GLB 约 218 KiB。** 上图直接录自模型查看器，多角度展示实际几何。模型带有可编辑 Blender 源文件；尺寸依据参考照片估算。

[查看静态大图](assets/showcase-3d-poster.jpg) · [素材来源与录制说明](docs/media.md)

## 快速上手

用 [Skills CLI](https://github.com/vercel-labs/skills) 安装完整技能，再选择要使用的 Agent：

```bash
npx skills add To3akaRin/mac-computer-use
```

Agent 需要在安装了 **macOS 14+ 和 Swift 6 Command Line Tools 的 Mac** 上执行本机命令；CDP 另需 **Node.js 22.4+**。权限与依赖设置见[环境要求](#环境要求)。

也可以从 [Releases](https://github.com/To3akaRin/mac-computer-use/releases/latest) 下载技能 ZIP 和 SHA-256，或克隆仓库后安装到已确认的技能目录：

```bash
sh scripts/install.sh --skills-dir "/目标技能父目录" --dry-run
sh scripts/install.sh --skills-dir "/目标技能父目录"
```

安装器复制完整的 `mac-computer-use/` 目录，目标已存在时拒绝覆盖。请保留配套源码和脚本，不要只复制 `SKILL.md`。详见[跨 runtime 安装指南](references/runtimes.md)。

### 直接这样交代 Agent

```text
“把这张参考图做成一个可以查看的 3D 模型。”

“帮我用这个应用连接服务器完成部署，每一步都检查结果。”

“找到目标窗口，把这段中文填进指定输入框，再读回来核对。”

“点击这个按钮，检查应用状态是否真的改变，截一张结果图。”
```

这些是交给 Agent 编排的任务示例。实际完成范围取决于目标应用暴露的控件、接口、权限以及 Agent 可用的其他工具。技能提供桌面执行工具，Agent 负责推理与任务编排。

## 核心能力

| 能力 | 具体能做什么 |
| --- | --- |
| **看清目标** | 列出窗口、进程、标题和几何信息；读取辅助功能（AX）控件；观察 CDP 页面结构。 |
| **找到入口** | 探测应用 bundle、脚本字典、URL scheme 和候选调试端口，帮助 Agent 选择控制通道。 |
| **输入到位** | AX 精确设值和读回；原生 Unicode 输入；CDP 通过 `Input.insertText` 写入输入框与富文本区域。 |
| **真正交互** | 原生点击、悬停、滚动、快捷键；CDP 渲染器鼠标和键盘事件。 |
| **受控接管** | 后台通道优先；需要前台时检查用户空闲、目标与互斥锁，在可以安全恢复时归还原焦点。 |
| **准确定位** | 明确区分逻辑点、归一化坐标和截图像素；快照绑定窗口，过期或几何变化时拒绝执行。 |
| **拿出证据** | ScreenCaptureKit 窗口截图、AX 值读回、CDP 只读断言与结构化 JSON 结果。 |
| **连续执行** | CDP JSON 批处理；任何一步失败、拒绝或结果未知，立即停止后续步骤。 |

**本机运行，原生内核使用系统框架，CDP 客户端零运行时 npm 依赖。** 控制工具不需要自建服务端、数据库或独立 API Key；Agent runtime 与模型的要求由各自提供方决定。

### 原生 Mac：观察、输入、点击、读回

![项目原生工具驱动测试应用：预演、中文输入、点击与结果读回](assets/native-demo-en.gif)

窗口画面来自本项目原生工具驱动专用测试应用时的实际截图。英文阶段说明与播放节奏为展示排版，不作为耗时基准；应用画面中的原始文字保持不变。[静态封面](assets/native-demo-en-poster.png) · [录制说明](docs/media.md)

## 观察 → 操作 → 验证

桌面自动化最难的部分，是确保动作落在正确目标上，**并成功判断它究竟有没有生效**。

| 观察 | 操作 | 验证 |
| --- | --- | --- |
| 识别应用与窗口，读取控件或页面结构，获取绑定目标的新快照。 | 优先使用应用已有接口，其次 AX，最后输入事件；写入前用 `--dry-run` 预演。 | 读回元素值或检查只读断言，截取证据；结果未知时停止。 |

这套工具把执行边界放进了实现：

- **执行前预演。** 写命令支持 `--dry-run`，检查参数和可用的前置条件，不实际输入、点击或重启。
- **定位有依据。** 元素必须明确，坐标单位必须明确；旧窗口引用和不唯一的目标会被拒绝。
- **使用前台有秩序。** 用户空闲至少 2 秒，最多等待 15 秒；前台操作使用会话锁，用户恢复输入时停止。
- **结果未知就停。** 写入后无法确认结果时返回 `unknown`，不切换通道盲目重放。
- **验证本身保持只读。** CDP 等待条件和断言拒绝副作用，避免“为了检查成功，又执行了一遍”。

Agent 得到的是可处理的 JSON：目标是谁、走了哪个通道、状态如何、证据在哪。对点击和按键，事件派发与业务完成明确区分；输入框文字正确，也不会被当成已经保存或发送。

既有验收记录覆盖专用原生测试应用、隔离浏览器，以及无构建缓存的干净目录编译。记录中的实机环境为 **macOS 15.7.7 / Apple Silicon / Swift 6.1.2**，Node.js 为 **22.23.1 与 24.18.0**。这些结果不代表所有第三方应用都已验收；Intel 与 macOS 14 实机矩阵待补充。[验收记录](docs/acceptance.md) · [通用技能验证](docs/universal-v0.2.md) · [CI](https://github.com/To3akaRin/mac-computer-use/actions/workflows/ci.yml)

## 一份技能，多种 Agent

**Claude Code · Codex · Kimi Code · Cursor · OpenClaw · WorkBuddy · 千问办公 · ZCode**

同一份技能包遵循开放的 [Agent Skills 规范](https://agentskills.io/specification)。`agents/openai.yaml` 是可选的 Codex 元数据，核心工具不依赖某个 runtime 的专属插件；其他 runtime 可以通过加载完整技能目录并执行本机命令接入。

跨 runtime 兼容指的是 **在 macOS 上** 安装和调用同一份技能。远程 Linux 沙箱不能仅靠读取 `SKILL.md` 操控你的 Mac。各客户端的安装入口和执行限制见[兼容指南](references/runtimes.md)。**豆包工作是待验证接入目标，完整技能包的导入方式尚未核实。**

### 环境要求

| 依赖 | 用途 |
| --- | --- |
| macOS 14+ | 在目标 Mac 上执行原生桌面控制。 |
| Swift 6 Command Line Tools | 编译原生工具；技能的构建目录需要可写。 |
| Node.js 22.4+ | 仅 CDP 工具需要；Skills CLI 的安装依赖由其项目说明。 |
| 辅助功能和屏幕录制权限 | 授予启动原生工具的终端或 Agent 应用。 |
| Python 3 | 可选的指定目录安装器和打包脚本需要。 |

尚未安装 Command Line Tools 时执行：

```bash
xcode-select --install
```

在**系统设置 → 隐私与安全**中，为启动工具的终端或 Agent 应用授予**辅助功能**和**屏幕与系统音频录制**权限，名称依 macOS 版本不同。授权后重启宿主，再运行 `native doctor` 复查。工具不修改系统权限数据库。[权限排障](references/permissions.md)

### 所有 runtime 共用的启动方式

将 `SKILL_DIR` 设置为实际安装后的技能目录。以下以 Codex 目录举例；这是显式设置的局部 shell 变量，不是 runtime 内置配置：

```bash
SKILL_DIR="$HOME/.codex/skills/mac-computer-use"
sh "$SKILL_DIR/scripts/run.sh" native doctor
sh "$SKILL_DIR/scripts/run.sh" native windows
sh "$SKILL_DIR/scripts/run.sh" cdp --help
```

原生模式检查 macOS 和 Swift 并增量构建，CDP 模式检查 Node.js。入口保留调用者工作目录、参数和退出码，支持空格、中文与符号链接路径；相对截图路径仍指向你正在工作的项目。

### 从源码启动

```bash
git clone https://github.com/To3akaRin/mac-computer-use.git
cd mac-computer-use
bash scripts/build.sh
.build/release/mac-computer-use doctor
.build/release/mac-computer-use help
node scripts/cdp.mjs --help
```

先跑通原生观察流程：

```bash
mkdir -p artifacts
.build/release/mac-computer-use probe --app com.apple.TextEdit
.build/release/mac-computer-use windows

# 将 12345 换成 windows 实际返回的目标窗口 id。
.build/release/mac-computer-use ax --window 12345 --snapshot-out artifacts/window.json
.build/release/mac-computer-use shot --window 12345 --output artifacts/window.png --snapshot-out artifacts/window-image.json
```

连接内嵌 Chromium 页面时，目标应用需要实际支持并已开放本机调试端口：

```bash
node scripts/cdp.mjs targets --endpoint http://127.0.0.1:9222
node scripts/cdp.mjs snapshot --endpoint http://127.0.0.1:9222 --target PAGE_ID
```

`PAGE_ID` 来自探测结果，端口使用目标应用的实际端口；指定端口不会自动重启应用。已有原生可执行文件和 CDP 直接调用方式继续有效。

## 文档与开发

本项目是本机命令行技能，不提供 HTTP 服务，也不需要服务端部署。运行时无必配环境变量；`.env.example` 记录真实 CDP 测试可用的可选 `CHROME_BINARY`。工具不会自动加载 `.env`。

| 入口 | 内容 |
| --- | --- |
| [技能正文](SKILL.md) | Agent 工作流程与执行规则。 |
| [命令接口](API.md) | 命令、参数、JSON 返回与退出码。 |
| [原生控制](references/native.md) · [CDP 指南](references/cdp.md) | 观察、输入、坐标、断言与批处理。 |
| [跨 runtime 使用](references/runtimes.md) | 安装方式和各客户端执行约束。 |
| [贡献指南](CONTRIBUTING.md) · [更新记录](CHANGELOG.md) | 开发、验证与版本历史。 |

`Sources/` 存放 Swift 原生工具；`scripts/` 存放启动、安装、打包与 CDP 工具；`tests/` 提供测试样例与检查；`references/` 和 `docs/` 保存使用指南与规格文档。

欢迎带着具体应用、明确场景和可复现证据参与：补充兼容性测试、改进元素定位、完善输入路径，让更多桌面工作进入 Agent 的执行范围。

**把目标交给 Agent，把执行落到桌面。**

[MIT 许可证](LICENSE) · Copyright (c) 2026 To3akaRin
