# README 演示素材

三段动画均为本次制作，没有使用第三方项目的品牌、演示图片或视频。

## 3D 展区案例

`assets/showcase-3d.gif` 是用户提供的中央展区模型在现有浏览器查看器中的实际旋转录制。通过画布拖动改变视角，截取模型区域，去掉浏览器工具栏与本地地址，再编码为循环 GIF。

实际模型统计：3,388 三角面、117 网格、123 节点、5 种材质、222,904 字节。尺寸来源于照片估算。案例来源为用户提供的建模成果；本次制作负责核实模型、恢复查看器、旋转录制和编排首页。

GIF 不包含原始 GLB、Blender 源文件、参考照片或本地文件路径。模型源文件未随技能仓库分发。静态封面为 `assets/showcase-3d-poster.jpg`。

## 原生演示

`assets/native-demo.gif` 使用本项目原生工具对独立测试应用执行观察、无副作用预演、AX 中文输入、真实鼠标点击、键盘输入和结果读回。每个窗口画面由 ScreenCaptureKit 实际截取；宣传版式只添加外围说明，不修改截图中的应用结果。

复现需 macOS 桌面、系统权限与已编译工具，操作键鼠会触发守卫停止：

```bash
bash scripts/build.sh
python3 scripts/media-native.py
node scripts/media-native-stage.mjs
```

原始帧及调用日志存放 `artifacts/media-native/`，宣传排版帧存放 `artifacts/media-native-stage/`。静态封面为 `assets/native-demo-poster.png`。

## CDP 演示

`assets/cdp-demo.gif` 是原创合成页面，由 `scripts/lib/cdp.mjs` 实际执行 `Input.insertText`、点击及只读结果断言。页面状态由实际操作改变，最后截图显示已核对的结果。

```bash
node scripts/media-cdp.mjs
```

使用独立临时 Chrome profile，不复用用户浏览器内容；结束后清理浏览器。原始帧和动作记录保留在 `artifacts/media-cdp/`。静态封面为 `assets/cdp-demo-poster.png`。

## 编码和展示

编码工具仅为维护者生成 README 素材所需，不是技能运行依赖。需要 uv，通过 PyPI 的 `imageio-ffmpeg` 包提供 FFmpeg：

```bash
uv run --no-project --with imageio-ffmpeg python scripts/media-encode.py
```

原生演示为 60 帧 / 5 fps，CDP 演示为 35 帧 / 5 fps，3D 旋转为 59 帧 / 8 fps。暂停和过渡经过编排，不用于声称执行性能。模型原始帧由现有浏览器查看器录制，未包含在仓库中；有该案例原始帧时编码脚本会额外生成模型 GIF。

`CHROME_BINARY` 可选环境变量沿用 `.env.example`，用于指定演示浏览器。所有动画提供静态封面和文字说明，避免必须观看动画才能理解功能。原始录制文件保留在 Git 忽略目录，只发布检查过的 GIF 与静态封面。
