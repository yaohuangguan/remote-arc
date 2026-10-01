# 官网内容审查与重构记录

日期：2026-10-01。继续入口：`PLAN.md`、`docs/long-running-work-progress.md`。
工作分支：`feat/goal-continuation`，PR44，基于 PR43；保留原 release HOLD。

## 审查基线

| PR | 已核对的 head | 能力来源 |
| --- | --- | --- |
| 41 | `61b29b623861b3034bc2f8074556b2898f91d298` | 浏览器配对、权限选择、登录后台连接、本机安装确认、Connect AI |
| 43 | `3ec08ca5b1c2646382737b6cbba23bc7c3749648` | 持久自动化、固定目标循环、Hosted Agent Goal、恢复、条件与定时 |
| 44 | `4b38499b1cc85f2933802f9ea2379fe18e51838f` | 源决策、版本/租约围栏、检查点、签名事件、设备任务权限、保持唤醒、任务证据 |

PR41 已包含在当前分支祖先中；PR44 的比较基线是 PR43，不能因官网说明而把
尚未发布的功能宣称为生产可用。实际代码和部署能力优先于旧宣传文案。

## 主要发现与修正

| 旧说明/问题 | 对应代码事实 | 更新 |
| --- | --- | --- |
| 受管进程不能跨重启，所有此类工作要用 OS 服务 | `process.ts` 的句柄在内存；D1 中 Task 合同/进度持久化 | 分开说明直接进程、持久 Task 和常驻 OS 服务 |
| 重连/丢句柄总能直接恢复 | 已确认句柄丢失按 restart/fail；未知派发结果先检查，不盲重放 | 写清新尝试不是旧 PID 恢复 |
| 工具总数 24 | 当前 MCP 注册 26 个公开工具 | 统一工具分组和准确 OAuth Scope |
| MCP 页使用旧 Apps/Advanced settings 接入 | 当前官方 Plugins / Security and login 开发接入 | 更新 MCP/安装页，公开 listing 仍注明准备发布 |
| Agent 必须托管推理 | source/hosted 两种 controller | 写明源循环、宿主责任和无静默切换 |
| “数据不留云端”或只讲 audit | Task contract/observations/memory/evidence 单独持久化 | Docs、隐私、安全页说明可能包含文件或命令内容 |
| 后台连接等于一直在线 | 登录服务、自主重连与临时 power lease 是不同功能 | 写明睡眠、关机、未来任务和真实 OS 验收边界 |
| 定时等于墙钟 Cron | interval 从完成后开始；同任务不重叠 | 不承诺日历、DST、错过运行回填或自动开机 |
| 沙箱与目录限制混淆 | 本机用户 shell，无 OS 沙箱 | 公开解释 + `execution-isolation.md` 设计建议 |
| Use Cases 只有即时工具示例 | 代码已有持久/自主/定时/条件任务 | 增加四种场景，每个给请求、流程、权限、证据与边界 |
| 首页假 ChatGPT UI + 六秒动画 | 不是实际客户端，也不展现产品 | 实际 Remote Arc 界面录制、示例标注、字幕与播放控制 |
| 首页连接步骤以下重复能力卡片 | 缺少用户请求到结果的具体链路 | 重构为场景、安装、长目标、权限、FAQ 与开始入口 |
| 首屏仅有单个开发场景 | 既有开发工具和准备发布的持续/定时工作 | 保留 Anywhere / Anytime 主信息，短场景轮换并给长任务入口 |
| 复制按钮忽略 Clipboard 拒绝 | 浏览器可能禁用剪贴板或要求用户手势 | 捕获失败、提示手动复制、清理重置计时器 |

## 新内容结构

- `/docs`：用户入口、架构、权限、文件/Undo、进程与恢复、五种 Task、源/托管、
  定时与唤醒、浏览器、隔离、26 个工具、数据、排错和可用状态。
- `/docs/mcp`：当前连接方式、Scope、发现设备、完整工具分组、源目标调用协议、
  有条件签名事件和 Chrome Companion；保留 `#chrome-browser` 链接。
- `/docs/long-running-work`：详细持续目标指南，补充重启恢复表、状态与预算解释。
- `/use-cases`：十个场景，其中六个即时场景和四个持久工作场景；每个独立路由。
  根据用户最终方向移除 PPT，保留项目开发、文件整理、数据处理、服务器、
  浏览器上下文、支持诊断，以及自主目标、长命令、定时检查、CI 条件跟进。
- 首屏：`Build apps.` → `Run tasks.` → `Fix bugs.` → `Analyze data.`；
  根据用户最终反馈固定两行 `Anywhere,` / `Anytime.`，突出远程可达。
  `Your AI. Your computer.` 与副标题明确执行位置，过夜/定时能力放在场景提示。
  字号及标题行高固定，轮换不挤动说明或按钮。
  按用户最终要求不显示光标和暂停按钮，减少动画偏好下使用静态标题；
  长任务可用条件在首屏直接链接。
- 首页：`LandingContent` 独立组件；可键盘切换的四个场景、实际产品录制、
  安装三步、持久目标合同、设备权限、分组 FAQ 和清晰 CTA。
- SEO / sitemap / Worker marketing routes 同步覆盖新增场景，语言和主题保持一致。

## 来源与措辞边界

产品事实来自 `apps/relay/src/mcp.ts`、`automations.ts`、`source-goals.ts`、
`automation-store.ts`、`task-events.ts`、`device-task-policy.ts`，CLI 的
`background.ts`/`keep-awake.ts` 与 execution-core 的本地工具实现。

外部宿主入口和机制采用当前实际打开的官方文档，不使用旧截图或营销推断：

- [OpenAI Plugin connection](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [MCP Events](https://developers.openai.com/plugins/build/mcp-events)
- [Long-running work](https://learn.chatgpt.com/docs/long-running-work)

任务持久化不等于同一进程永生，事件接收不等于 Agent 完成，mock 测试不等于
真实过夜宿主验收，容器或路径限制不等于已验证的 OS 隔离。

## 验证记录

- `pnpm run ci` 通过，包括所有类型检查、执行核心集成、本地 MCP 模式 Smoke
  和持久目标回归。最终首屏调整另行通过 UI 类型检查与生产构建。
- 一次性源审查核对 26 个文档工具与真实 MCP 注册一致；十个 Use Case 的
  canonical、metadata、sitemap 和 Worker 路由覆盖通过。
- 桌面 1280/1440px、手机 390px 覆盖首页、Docs、MCP、持续工作指南、场景
  目录和详情，中英/明暗、章节跳转及键盘 Tab 场景切换。320px 核对最长英文
  标题和导航；未见横向溢出，修复原导航控制台按钮在窄屏被截断的问题。
- 完整四场景轮换期间标题高度和说明位置保持不变。减少动画偏好
  下标题静态、视频不自动播放；强制 Clipboard 拒绝后有手动复制提示且无
  未捕获异常。最终构建页面没有浏览器运行错误。
- 真实界面录制为 21 秒、1280×800、30fps；WebM/MP4、海报、双语字幕及三个
  章节齐全。录像使用示例数据，不把未执行的客户端安装或 OAuth 当成成功演示。
- Docs/MCP/Use Cases/Pricing 分包加载；主包约 543kB 的既有构建警告仍在，低于此次
  重构前约 597kB。当前 PR 的远程 CI 与 Cloudflare 预览以最新提交检查为准。

真实 Plugin/Chat/Work 过夜续接、生产安全事件出站服务与目标 OS 电源助手验收
仍未完成。保留 release HOLD，不部署生产、不迁移生产数据库、不合并或发布。

## 2026-10-02 官网收尾

- 首页删除光标、光标 CSS 和暂停控件/状态，保留轮换、隐藏页停止计时与
  减少动画偏好。手机空文本阶段预留与实际行高一致，避免轮换引起位置变化。
- FAQ 改为产品与使用 5 项、安全与控制 5 项、任务与在线状态 3 项，分组 Tab
  支持方向键/Home/End。回答产品定位、现有客户端、设备、手机/外网、费用、
  授权、端口/凭证、数据流向、撤销与 Undo，以及持续工作的实际条件。
- 删除重复 Technical Resources 页面、菜单和内部链接；旧 `/resources` 由
  Worker 对 GET/HEAD 301 到 `/docs`，静态预览也有客户端跳转，sitemap 移除旧页。
- 重构 Pricing 为免费额度、额外容量咨询、计数说明、任务条件和价格 FAQ。
  `usage.ts` / Wrangler 核对默认账户每月 10,000 次；UTC 自然月重置，MCP
  处理器计数后的失败可能消耗额度。没有支付、充值或付费套餐实现，所以同步
  删除 Pricing 和 Dashboard 中可立即充值的承诺；AI 订阅与托管推理另行说明。
- 类型检查、完整本地 CI、生产构建、实际 Worker GET/HEAD 跳转和 SEO/sitemap
  检查通过。1440px 桌面、390/320px 手机核对中英、明暗、FAQ 键盘、价格问答、
  旧页跳转和减少动画；无横向溢出或浏览器运行错误。
- 同网设备唤醒未实现，用户明确要求先搁置，本次没有增加唤醒工具、权限或 UI。
