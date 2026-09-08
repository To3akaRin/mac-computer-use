# v0.1.0 验收记录

日期：2026-09-08。此记录描述实际测试证据，不将构建成功等同于桌面业务验收。

## 环境

- macOS 15.7.7，Apple Silicon arm64。
- Swift 6.1.2，Command Line Tools。
- Node.js 22.23.1 与 24.18.0；Python 3.9.6 用于原生测试脚本。
- 本机辅助功能与屏幕录制权限已具备。

## 自动化与实测

| 检查 | 结果 |
| --- | --- |
| Swift release 构建 | 通过；额外从无构建缓存的干净目录重新构建、自检及帮助调用成功 |
| NativeSelfTest | 15 项通过：显式单位、负坐标、Retina 换算、越界、NaN、窗口和进程替换、快照往返、重复参数、预演解析、未知参数拒绝、互斥锁冲突与释放 |
| CDP 协议测试 | 20 项通过；覆盖目标歧义、端点限制、超时、预演、独立读回和未知结果停止 |
| CDP 真实 Chrome 验收 | 通过；独立临时浏览器目录，验证中文与 contenteditable 输入、实际点击、ArrowLeft 光标变化、截图、快照、预演不写入、只读条件拒绝副作用、批量停止 |
| 原生专用窗口验收 | 通过；预演值不变、AX 中文读回、点击计数、Cmd+A 与中文键盘输入、窗口截图；第二测试应用验证受控激活和原前台 PID 恢复 |
| Agent Skill 结构校验 | 通过 |
| JavaScript 与 Shell 语法检查 | 通过 |

## 可复现命令

```bash
bash scripts/build.sh
.build/release/NativeSelfTest
npm test
npm run test:cdp-live
python3 scripts/native-smoke.py
swift test
```

真实 GUI 验收需要有人登录桌面且暂时不操作键鼠。测试脚本创建合成测试应用或临时 Chrome profile，结束后清理；原始截图不公开发布。

## 限制

本机精简 Command Line Tools 缺少 XCTest 模块，`swift test` 无法在本机完成；已执行原生独立自检，并保留标准 XCTest 供完整 Xcode/CI 运行。macOS 14、Intel、锁屏、其他桌面、真实业务应用的复杂控件和所有第三方 CDP 客户端未完成实机矩阵，不作兼容性保证。

应用启动只证明进程启动，不证明应用支持 CDP；探测端口的进程归属须再核对。事件命令返回 unknown 是保守的结果语义，真实验收使用后续状态读回证明效果，不通过重复派发掩盖未知。
