# 命令接口

本项目没有 HTTP 服务。原生入口为 `.build/release/mac-computer-use`；CDP 入口为 `node scripts/cdp.mjs`。所有路径由调用方明确提供，下面的窗口 id、页面 id 与选择器都是示例。

## 通用输出

除帮助外，标准输出使用 JSON。`target` 标识应用、窗口或页面，`channel` 区分 `native` 与 `cdp`，`error` 表达错误，`evidence` 列出证据文件。不同命令在 `data` 中返回相应结果。

退出码：0 表示命令成功或已完成无写入预演；1 表示执行错误；2 表示拒绝或结果未知。`unknown` 不代表没有执行，不可自动重试。预演包含 dryRun 标记，不得将预演当成实际成功。

```json
{"status":"unknown","channel":"cdp","target":{"id":"PAGE_ID"},"error":null,"evidence":[],"data":{"dispatched":true}}
```

命令帮助是参数的运行时来源。前台状态、窗口几何和系统权限变化可能使刚成功的预演在执行时拒绝。

## 原生命令

| 命令 | 必需参数 | 用途 |
| --- | --- | --- |
| `help` | 无 | 显示命令 |
| `doctor` | 无 | 检查辅助功能、屏幕录制与系统信息 |
| `probe` | `--app BUNDLE_ID [--ports 9222,9333]` | 探测应用、脚本字典、URL scheme 与候选 CDP 端口 |
| `windows` | 无 | 返回窗口 id、pid、标题和几何 |
| `shot` | `--window ID --output PNG --snapshot-out JSON` | 截图并保存配套快照 |
| `ax` | `--window ID --snapshot-out JSON` | 读取 AX 元素并保存快照 |
| `ax-set` | `--window ID --snapshot JSON --identifier ID --text TEXT` | 按唯一 identifier 设值；可用 `--element PATH` 代替 identifier |
| `click`、`hover` | `--window ID --snapshot JSON --x N --y N --unit UNIT` | 按显式单位操作 |
| `scroll` | 同坐标命令，另加 `--delta N` | 像素滚动，绝对幅度上限 10000 |
| `type` | `--window ID --snapshot JSON --text TEXT` | 输入 UTF-16 文本，单次最多 1024 个 UTF-16 单元 |
| `key` | `--window ID --snapshot JSON --key KEY` | 派发按键，可加 `--modifiers command,shift` |
| `open` | `--app BUNDLE_ID [--cdp-port PORT] [--relaunch]` | 后台启动；调试启动或重启必须显式指定 |

`UNIT` 为 `points`、`normalized` 或 `pixels`，像素坐标需要截图快照。原生快照有效期为 300 秒，几何或目标变化会提前失效。`KEY` 支持 enter、tab、escape、backspace、space、方向键及 a/c/v/x/z；修饰键支持 command/shift/option/control。

所有修改应用状态的命令支持 `--dry-run`。AX 写入只声明元素值读回，其他输入事件需要调用者读回最终结果。权限缺失、目标不唯一、快照失效、用户活动或锁冲突时不会继续派发。

`probe` 默认检查 9222、9229、9333，端口结果标记 `ownership: unverified`，需要再用 CDP targets 核实页面归属。`open --cdp-port` 端口范围为 1024–65535；应用已运行时必须明确 `--relaunch`，仅正常请求退出，10 秒超时后停止，不强杀。启动成功不证明目标已支持 CDP，需要再探测。

原生命令总时限 30 秒，AX 消息时限 2 秒。前台命令附带 `focus` 结果，明确是否改变、恢复焦点或被用户中断。

完整示例见 [原生控制](references/native.md)。

## CDP 命令

公共参数：`--endpoint` 默认 `http://127.0.0.1:9222`；除 targets 外必须 `--target`，接受精确 id、title 或 URL，多匹配拒绝。`--timeout` 默认为 5000 毫秒，范围 1–60000。写操作可通过 `--document` 使用快照返回的文档标识，防止导航后的旧观察被复用。

| 命令 | 参数 | 验证范围 |
| --- | --- | --- |
| `targets` | 公共 endpoint | 列出可调试页面 |
| `snapshot` | 公共 target | 页面文字、HTML、标题与文档标识 |
| `find` | `--selector CSS` | 返回所有匹配元素，不隐式选择第一个 |
| `input` | `--selector CSS --text TEXT` | 输入框或富文本输入并读回 |
| `click` | `--selector CSS [--assert JS]` | 点击唯一可见且命中的元素；无断言返回未知 |
| `key` | `--selector CSS --key KEY [--assert JS]` | 按键；无断言返回未知 |
| `wait` | `--expression JS` | 只读条件成立或超时 |
| `shot` | `--output PNG` | 生成 PNG，不覆盖已有路径 |
| `eval` | `--expression JS` | 执行代码并返回结果，不证明业务完成 |
| `batch` | `--file JSON` | 顺序执行，非成功立即停止 |

CDP `KEY` 支持 Enter、Tab、Escape、Backspace、ArrowLeft、ArrowUp、ArrowRight、ArrowDown。断言及等待条件要求无副作用、同步求值；DOM 写入仅能通过明确的写命令或 eval。`--dry-run` 不修改页面或写截图。

批处理格式、运行例子见 [CDP 指南](references/cdp.md)。

## 配置和鉴权

本地工具不提供网络监听服务，无 API Key 或 Bearer Token。CDP 使用目标应用主动开放的本机调试端口；工具不通过网页登录凭据建立调试连接，不自动开放远程访问。

唯一可选环境变量 `CHROME_BINARY` 用于真实 CDP 测试，指定独立 Chromium 的可执行路径；模板见 `.env.example`。运行时不自动加载 `.env`。
