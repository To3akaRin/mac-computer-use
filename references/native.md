# 原生控制

跨 runtime 调用优先使用 `sh "$SKILL_DIR/scripts/run.sh" native …`。`SKILL_DIR` 由实际技能路径确定，以下保留原有直接调用方式。

从技能根目录运行 `bash scripts/build.sh`，之后使用 `.build/release/mac-computer-use`。调用时使用解析后的技能绝对路径，避免依赖 Agent 当前目录。

```bash
.build/release/mac-computer-use doctor
.build/release/mac-computer-use probe --app com.apple.TextEdit
.build/release/mac-computer-use windows
```

`--app` 使用 bundle identifier，不根据用户给出的模糊显示名猜测应用。`--window` 使用真实窗口 id。选定后先建立观察快照：

```bash
mkdir -p artifacts
.build/release/mac-computer-use ax --window 12345 --snapshot-out artifacts/ax.json
.build/release/mac-computer-use shot --window 12345 --output artifacts/window.png --snapshot-out artifacts/image.json
```

AX 结果包含元素路径和属性。优先使用唯一 identifier，或使用来自该快照的元素路径；元素变化后重新观察。AX 写入验证范围仅为值读回。

```bash
.build/release/mac-computer-use ax-set --window 12345 --snapshot artifacts/ax.json --identifier fixture-input --text '中文示例' --dry-run
.build/release/mac-computer-use ax-set --window 12345 --snapshot artifacts/ax.json --identifier fixture-input --text '中文示例'
```

坐标以窗口左上角为原点，单位明确指定：`points` 为逻辑点，`normalized` 为 0 到小于 1，`pixels` 必须配套截图快照。多显示器的全局负坐标由工具换算，Agent 不自行乘除缩放。

```bash
.build/release/mac-computer-use click --window 12345 --snapshot artifacts/image.json --x 80 --y 120 --unit pixels --dry-run
```

窗口移动、大小变化或快照过期时停止。点击、键盘等事件派发通常返回未知；执行一次后通过新 AX、截图或产物验证。前台操作使用互斥锁、空闲检查和目标核验；不要删除锁文件绕过检查，不跨桌面自动激活。

启动调试模式或重启必须显式请求。更多命令与错误约定见 API.md。
