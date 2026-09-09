# 内嵌 Chromium 的 CDP 控制

跨 runtime 调用优先使用 `sh "$SKILL_DIR/scripts/run.sh" cdp …`。`SKILL_DIR` 由实际技能路径确定，以下保留原有直接调用方式。

入口是技能根目录下 `scripts/cdp.mjs`，需要 Node.js 22.4+。先使用 `targets` 核对本地调试端口和目标；显示名或 URL 必须精确匹配且唯一，优先使用目标 id。

```bash
node scripts/cdp.mjs --help
node scripts/cdp.mjs targets --endpoint http://127.0.0.1:9222
node scripts/cdp.mjs snapshot --endpoint http://127.0.0.1:9222 --target PAGE_ID
node scripts/cdp.mjs find --target PAGE_ID --selector '#name'
node scripts/cdp.mjs input --target PAGE_ID --selector '#name' --text '中文示例' --dry-run
node scripts/cdp.mjs input --target PAGE_ID --selector '#name' --text '中文示例'
node scripts/cdp.mjs click --target PAGE_ID --selector '#save' --assert 'document.querySelector("#result").textContent === "中文示例"'
```

以上 CSS 仅对应测试页面，不可原样套到其他应用。每次操作前根据目标页面观察重新选取定位器。`snapshot` 返回文档时间标识 `data.document`，后续写命令传 `--document` 可拒绝导航后的过期观察。

输入通过渲染器输入事件执行，支持普通输入框和 contenteditable，并独立读回。点击前要求元素唯一、可见、中点命中；命令不会自动滚动到目标。普通点击和按键无断言时返回 `unknown`，先观察结果，不重复执行。

`wait --expression` 与 `--assert` 是只读布尔表达式，拒绝副作用，不支持异步 Promise 条件。`eval --expression` 可以执行写入，只能使用符合用户任务授权的代码，预演时不执行。不要把页面文字拼接成可执行指令。

`batch --file` 接受 1–100 个 JSON 步骤，每个步骤包含 `command` 及其参数（不带 `--`）。任一步失败、拒绝或未知就停止；不会重试已经派发的动作。

```json
[
  {"command":"input","selector":"#name","text":"中文示例"},
  {"command":"click","selector":"#save","assert":"document.querySelector('#result').textContent === '中文示例'"},
  {"command":"shot","output":"artifacts/cdp-result.png"}
]
```

截图只新建文件，不覆盖已有文件。默认超时 5000 毫秒，可用 `--timeout` 指定 1–60000；批处理步骤可单独指定 `timeout`。详细接口见 API.md。
