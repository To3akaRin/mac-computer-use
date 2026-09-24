# README 演示素材

本文记录 README 展示素材的来源与生成方式。素材为本项目原创展示场景或已有实际录制，没有使用参考项目的品牌、演示图片或视频。

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


## 2026-09-24 双语 README 视觉升级

### 流程主视觉

`assets/readme-hero.gif` 为原创 SVG/HTML 场景的浏览器渲染，960×540、80 帧、10 fps，循环 8 秒。Observe、Act、Verify 三个阶段展示窗口观察、操作及读回关系。画面明确标注 `Illustrative workflow`，用于说明技能工作流程，不是正在运行的产品控制台或实机性能证明。静态封面为 `assets/readme-hero-poster.png`。

重新生成主视觉（先取得本机 FFmpeg 路径，也可以传入自行安装的 FFmpeg）：

```bash
MEDIA_FFMPEG="$(uv run --no-project --with imageio-ffmpeg python -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')"
node scripts/media-readme-hero.mjs --ffmpeg "$MEDIA_FFMPEG"
```

浏览器路径可通过 `--chrome` 指定。生成脚本使用独立临时浏览器目录，原始帧保存在 Git 忽略的 `artifacts/media-readme-hero/`。`assets/demo/readme-hero.html?play=1` 可在浏览器预览，减少动态效果偏好下使用静态状态。

原创窗口光标字标提供 `assets/mac-computer-use-logo-light.svg` 和 `assets/mac-computer-use-logo-dark.svg` 两个版本，README 根据阅读主题选取。

### 英文原生演示

`assets/native-demo-en.gif` 使用原有六张实际原生窗口截图，重新排版英文状态说明与深蓝青色展示背景。截图中的中文输入与确认次数保持原样。静态封面为 `assets/native-demo-en-poster.png`。

```bash
# 需要已有六张本机录制帧；如果缺失，可先运行 media-native.py 在测试应用中重录。
node scripts/media-native-stage.mjs --language en
uv run --no-project --with imageio-ffmpeg python scripts/media-encode.py --native-en
```

`--native-en` 只编码英文原生演示，不触碰原有 3D GIF。`media-native-stage.mjs` 不传参数或传 `--language zh` 时保留原来的中文生成方式。

### 保留原始 3D 案例

本次只翻译标题、说明、数据和链接文案，原始 GIF 与静态图均未改变。SHA-256：

```text
d2260f1066bf709e7e834ece9bc8dbfa5f9e9f55cee5a6dc85447fe56ef0fb1a  assets/showcase-3d.gif
c07e48f4490609597c9835f60c4339d95060b0ba0a33cb7d80a075e88a5688b0  assets/showcase-3d-poster.jpg
```

新增英文和中文 README 共用展示素材，英文页面中的原生应用截图保留实际中文界面。完整编译、技能工具接口和软件版本不因本次文档更新而变化。
