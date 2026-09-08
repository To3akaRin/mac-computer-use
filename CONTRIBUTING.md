# 贡献指南

## 开始开发

阅读 README、API.md、docs/specification.md 和 CHANGELOG.md。使用 macOS 14+、Swift 6 和 Node.js 22.4+。

```bash
git clone https://github.com/To3akaRin/mac-computer-use.git
cd mac-computer-use
git switch -c codex/describe-change
bash scripts/build.sh
npm test
swift test
```

## 开发流程

先说明目标、边界和验收标准；涉及行为取舍时更新规格。为真实风险先写失败测试，再以小步实现修复。Swift 控制逻辑与系统调用保持可测试边界；CDP 的超时、目标选择和未知结果不得以 UI 截图变化替代验证。

注释及普通文档使用中文，命令、API 符号保持原样。新增命令或改变参数同步 API.md、对应 references 和 CHANGELOG。同版本内后续修订追加到原版本章节。

## 提交与 Pull Request

```bash
git status --short
git diff --check
git diff
# 只添加本次明确修改的文件；不要使用 git add .。
git add path/to/changed-file
git diff --cached
git commit -m "fix: describe the observable behavior"
```

采用 `feat:`、`fix:`、`docs:`、`test:`、`chore:` 前缀。提交前核对仓库、分支、Author/Committer 与暂存范围。PR 说明具体触发条件、结果改变、测试证据及尚未验证的环境。

## 验证要求

```bash
swift test
npm test
node --check scripts/cdp.mjs
node --check scripts/lib/cdp.mjs
bash -n scripts/build.sh
git diff --check
```

GUI 实测仅使用专用测试窗口与页面，不在真实业务窗口试发消息或写入。不要提交私人截图、凭据、个人绝对路径、构建产物或其他项目文件。新增测试必须验证行为，不能只匹配实现文案。
