# 跨 runtime 使用

本技能遵循 [Agent Skills 规范](https://agentskills.io/specification)：根目录 `SKILL.md` 包含标准元数据和通用指令，配套源码与参考文件按需读取。`agents/openai.yaml` 是可选 Codex 元数据，不是其他 runtime 的依赖。

## 先区分两种能力

- **安装和发现**：runtime 能加载完整的技能目录或技能包。
- **实际运行**：runtime 能在目标 Mac 本机执行命令、读取输出文件和查看截图；同时需要 macOS 14+、Swift 6+、可写构建目录及系统权限。CDP 另需 Node.js 22.4+。

云端 Linux 沙箱中的技能不能仅凭读取说明就操控用户 Mac。执行位置、工具权限和模型权限仍由各 runtime 管理。

## 安装矩阵

资料核查日期：2026-09-09。目录均为技能的父目录，安装后追加 `mac-computer-use/`。全平台可用。

| Runtime | 安装入口 | 协议适配状态 | 来源 |
| --- | --- | --- | --- |
| Claude Code | 用户目录 `~/.claude/skills/`；Skills CLI `-a claude-code` | 标准技能目录 | [官方文档](https://code.claude.com/docs/en/skills) |
| Codex | 用户目录 `~/.codex/skills/`；Skills CLI `-a codex` | 标准目录＋可选界面元数据 | [安装工具文档](https://github.com/vercel-labs/skills#supported-agents) |
| Kimi Code CLI | 官方用户目录 `~/.kimi/skills/`；也可由 Skills CLI `-a kimi-code-cli` 安装到其通用目录 | 支持品牌目录及通用目录，注意重复技能优先级 | [官方文档](https://github.com/MoonshotAI/kimi-cli/blob/main/docs/en/customization/skills.md) |
| Cursor | 用户目录 `~/.cursor/skills/`；Skills CLI `-a cursor` | 标准技能目录 | [官方文档](https://cursor.com/docs/skills) |
| OpenClaw | 用户目录 `~/.openclaw/skills/`；Skills CLI `-a openclaw` | 标准技能目录；执行宿主须能访问 Mac | [官方文档](https://docs.openclaw.ai/tools/skills) |
| WorkBuddy | 添加技能 → 上传本地技能包 | 官方支持 `SKILL.md` 与配套资源 | [官方说明](https://open.workbuddy.cn/en/docs/skill) |
| 豆包工作 | 待核实当前客户端的完整技能包导入方式 | 接入目标；未核实本地目录和执行限制 | 暂无本项目可核实的官方目录约定 |
| 千问办公 | `~/.qwenworkcn/skills/`，或扩展 → 技能 → 安装技能 | 标准目录或带同名顶层目录的 ZIP | [官方帮助](https://qwenwork.cn/docs/features/skills)、[ZIP 规则](https://www.alibabacloud.com/help/zh/qwenwork/skills-management) |
| ZCode | 用户目录 `~/.zcode/skills/`；Settings → Skills → Refresh | 标准技能目录，也支持从其他 Agent 导入 | [官方文档](https://zcode.z.ai/cn/docs/skill) |
| 其他 runtime | 使用其已确认的技能目录或完整包导入入口 | 能读取配套文件即可按同一格式接入 | [接入规范](https://agentskills.io/client-implementation/adding-skills-support) |

[Skills CLI](https://github.com/vercel-labs/skills) 是可选安装器，其支持列表和目录映射由该项目维护。不要将它的 `--all` 当成默认安装方式；只选你要使用的客户端。

## 通用命令

首次安装可直接交给 runtime：

```text
请安装 https://github.com/To3akaRin/mac-computer-use 中的完整 Agent Skill，
保留配套源码和脚本。定位安装后的 SKILL.md，在 Mac 本机调用统一入口 native doctor，
报告工具依赖、系统权限和实际执行位置。
```

具备 shell 时可使用：

```bash
npx skills add To3akaRin/mac-computer-use
```

已下载源码后，明确指定当前 runtime 的技能父目录：

```bash
sh scripts/install.sh --skills-dir "/已确认的技能父目录" --dry-run
sh scripts/install.sh --skills-dir "/已确认的技能父目录"
```

不要仅复制技能正文，或者把工具编译结果从另一种架构的 Mac 直接拷贝过去。统一入口在本机构建；安装后需要按客户端自己的机制刷新技能或重新启动会话。

## 最小验收

1. 确认 runtime 可以发现 `mac-computer-use` 并读取这份 `SKILL.md`。
2. 从用户项目目录调用 `sh "$SKILL_DIR/scripts/run.sh" native doctor`，确认执行位置是目标 Mac。
3. 调用 `native windows` 读取窗口，不操作真实业务控件。
4. 需要 CDP 时先调用 `cdp --help`，再连接已核实的本机测试端口。
5. 记录 runtime 版本、Mac 版本、执行方式、权限与实际结果，再把该环境标为已验证。
