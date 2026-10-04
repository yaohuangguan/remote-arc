import React from "react";
import { useI18n } from "./i18n.js";
import { TaskAvailability } from "./product-docs.js";
import "./public-docs.css";

export const useCaseSlugs = ["remote-development", "file-organization", "overnight-goals", "long-running-jobs", "scheduled-checks", "ci-follow-up", "data-work", "home-lab", "browser-research", "remote-support"] as const;
export type UseCaseSlug = typeof useCaseSlugs[number];
type Tr = (en: string, zh: string) => string;

function cases(tr: Tr) {
  return [
    {
      slug: "remote-development", category: tr("DEVELOPMENT", "开发"), title: tr("Fix a project on your own computer", "修复自己电脑上的项目"),
      intro: tr("Use the existing checkout, installed dependencies and toolchain. Ask your AI to inspect, edit and test on the computer where the work already lives.", "使用现有仓库、依赖和工具链，让 AI 在项目所在电脑上检查、修改并测试。"),
      prompt: tr("On my workstation, inspect the checkout in ~/projects/app, reproduce the failing route test, fix the affected code and rerun the focused tests. Show the diff before committing.", "在我的工作站上检查 ~/projects/app，复现失败的路由测试、修复相关代码并重跑测试。提交前给我看 diff。"),
      tools: "list_devices · device_tools · read_file · edit_block · start_process", permission: tr("File reads, file editing and terminal for tests", "文件读取、文件编辑，以及用于测试的终端权限"),
      steps: [tr("Resolve the named device and inspect its available tools and checkout.", "确认目标设备、可用工具和仓库状态。"), tr("Read the failing implementation before editing; run commands in the selected workspace.", "编辑前读取失败实现，在所选工作区运行命令。"), tr("Use focused checks, inspect the diff and report the result.", "运行相关检查、检查 diff 并汇报结果。")],
      proof: tr("A concrete diff, focused test output and a clear statement of remaining failures.", "具体 diff、相关测试结果，以及仍未解决的失败。"),
      limit: tr("Terminal runs as the local OS user. Workspace Scope does not sandbox shell commands. Local Undo covers supported file-tool edits, not shell edits or git history.", "终端以本机 OS 用户运行，Workspace Scope 不会隔离 Shell。Local Undo 覆盖受支持文件工具的修改，不覆盖 Shell 编辑或 git 历史。"), durable: false,
    },
    {
      slug: "file-organization", category: tr("FILES", "文件"), title: tr("Organize files with a reviewed move plan", "按确认的整理计划归类文件"),
      intro: tr("Inspect a chosen folder, propose a grouping plan and use an authorized local command to move files. Keep destructive changes separate from organization.", "检查指定文件夹、提出归类计划，再通过获授权本机命令移动文件，将破坏性修改与整理分开。"),
      prompt: tr("Inspect my selected Downloads folder and propose how to group documents and images. Show the move plan first. After I approve, move only those files, do not delete or overwrite anything, and save a before/after manifest.", "检查我指定的 Downloads 文件夹，提出文档和图片归类方式，先给我看移动计划。确认后只移动这些文件，不删除或覆盖，保存整理前后清单。"),
      tools: "list_directory · get_file_info · read_file · start_process", permission: tr("Folder reads for planning; separately authorized terminal for file moves", "文件夹读取用于规划，文件移动另需终端授权"),
      steps: [tr("Inspect names and metadata; avoid reading unnecessary file contents.", "检查名称和元数据，避免读取不必要文件内容。"), tr("Review destinations, collisions and the exact move list.", "确认目标位置、重名冲突和具体移动清单。"), tr("Execute the approved plan and verify the before/after manifest.", "执行已批准计划并核对整理前后清单。")],
      proof: tr("The approved move list, collision handling and verified destination files.", "已批准移动清单、冲突处理与已核对的目标文件。"),
      limit: tr("No dedicated move-file MCP tool is currently exposed. Moves use terminal access with real local-user permissions. Shell moves are outside Local Undo; a manifest helps review but is not transactional rollback.", "当前没有专门的移动文件 MCP 工具，移动通过具有真实本机用户权限的终端执行。Shell 移动不属于 Local Undo，清单帮助检查但不是事务回滚。"), durable: false,
    },
    {
      slug: "overnight-goals", category: tr("ADAPTIVE GOAL", "自主目标"), title: tr("Leave a goal with a verifiable finish line", "离开前交代一个可验证目标"),
      intro: tr("For work that needs investigation and changes of strategy, save an Agent Goal. A continuing controller reads results, chooses the next approved action and verifies completion.", "需要排查和调整策略的工作可以保存为 Agent Goal。持续运行的控制器读取结果、选择下一项已批准动作并验证完成。"),
      prompt: tr("On build-pc, fix the failing tests in this checkout. Keep changes in the selected workspace. Inspect failures before editing, run the focused tests after changes and finish only when pnpm test passes. Save the goal, record evidence and stop by the agreed deadline. Do not deploy or publish.", "在 build-pc 上修复当前仓库的失败测试，修改限定在所选工作区。修改前检查失败原因，修改后运行相关测试，pnpm test 通过后才完成。保存目标和证据，到约定期限停止，不部署或发布。"),
      tools: "create_agent_goal · get_goal_context · submit_goal_decision · get_automation", permission: tr("Needed file/terminal tools + background tasks + adaptive goals; source continuation if using source mode", "所需文件与终端工具 + 后台任务 + 自主目标；源模式还需开启源续接"),
      steps: [tr("Save the objective, success criteria, controller, workspace, tool set and limits.", "保存目标、验收标准、控制器、工作区、工具集合和限制。"), tr("Observe, act and adapt within the saved boundary. A long command can wait without continuous model inference.", "在保存的边界内观察、操作与调整；长命令等待期间无需持续模型推理。"), tr("Run the configured verification. Failed verification returns to the controller; success records evidence.", "执行配置的验证；失败返回控制器继续处理，成功保存证据。")],
      proof: tr("Completion evidence, verification exit code, run history and an explicit blocker if work could not finish.", "完成证据、验证退出码、运行历史；无法完成时说明具体阻塞。"),
      limit: tr("Source mode needs a continuing host runtime or verified task events. Plugin installation alone cannot guarantee overnight reasoning. Keep the computer powered and online; optional task keep-awake is bounded and requires opt-in.", "源模式需要持续宿主运行环境或经过验证的任务事件。安装 Plugin 本身不能保证过夜推理。电脑需供电联网；可选保持唤醒有界且需授权。"), durable: true,
    },
    {
      slug: "long-running-jobs", category: tr("LONG TASK", "长任务"), title: tr("Track a build, export or script after chat ends", "聊天结束后仍跟踪构建、导出或脚本"),
      intro: tr("When the command is known, save a Long Task rather than keeping a chat turn open. Remote Arc tracks the command and records its outcome independently of the creating conversation.", "命令已确定时，可以保存 Long Task，无需一直保持一个聊天轮次。Remote Arc 独立于创建它的对话跟踪命令并记录结果。"),
      prompt: tr("Run the existing report export on data-pc as a saved long task. Use the project directory, keep the output there and report the exit code and result summary. If the process handle is lost, fail instead of automatically running the export twice.", "在 data-pc 上将现有报表导出保存为长任务，使用项目目录并把输出保存在那里。汇报退出码与结果摘要；进程句柄丢失时失败停止，不自动重复导出。"),
      tools: "create_automation(kind=long_task) · get_automation · manage_automation", permission: tr("Terminal + background tasks", "终端 + 后台任务"),
      steps: [tr("Save the command, cwd, recovery choice and expiry.", "保存命令、cwd、恢复方式和到期时间。"), tr("The scheduler starts and follows the managed process; offline work waits for reconnection.", "调度器启动并跟踪受管进程，设备离线时等待重连。"), tr("Read exit status and bounded output summary from chat or Dashboard; cancel if needed.", "从聊天或 Dashboard 阅读退出状态与受限输出摘要，必要时取消。")],
      proof: tr("Exit code and the generated artifact checked on the device; a summary alone does not prove file integrity.", "退出码以及在设备上检查过的生成文件；摘要本身不能证明文件完整。"),
      limit: tr("The Task survives in the database, not the same PID. A lost acknowledged handle can restart or fail according to recovery. A dispatch with unknown outcome is not blindly replayed. No continuous AI planning is required for this fixed command.", "数据库保存的是 Task，不是同一个 PID。已确认进程的句柄丢失后按 recovery 重启或失败；派发结果未知时不会盲目重放。固定命令不需要持续 AI 规划。"), durable: true,
    },
    {
      slug: "scheduled-checks", category: tr("SCHEDULED WORK", "定时工作"), title: tr("Run a check later, or repeat it between runs", "稍后检查，或按间隔重复"),
      intro: tr("Save a fixed check or an adaptive goal for a future time. Repeated work starts a fresh run and keeps its own results without overlapping the same task.", "把固定检查或自主目标安排在未来时间。重复任务每轮重新运行、独立保存结果，同一任务不重叠执行。"),
      prompt: tr("At the agreed time, run the existing health-check script on home-server and save the result. Repeat 30 minutes after each run completes, stop at the deadline and do not restart services.", "在约定时间运行 home-server 上现有健康检查脚本并保存结果，每轮完成 30 分钟后再次运行，到期限停止，不重启服务。"),
      tools: "create_automation(kind=schedule_watch) or create_agent_goal(schedule=…) · get_automation", permission: tr("Required tools + background tasks + scheduled tasks; adaptive/source permissions if using an Agent Goal", "所需工具 + 后台任务 + 定时任务；使用自主或源目标时还需对应权限"),
      steps: [tr("Confirm an explicit timestamp or interval, the permitted action and stop limits.", "确认明确时间或间隔、允许动作与停止限制。"), tr("The cloud scheduler makes work due; device execution waits until the computer is available.", "云调度器把任务设为到期，设备执行等待电脑可用。"), tr("Read each run's result. For recurring goals, memory and iteration budgets reset for each run.", "阅读每轮结果；周期目标每轮重置工作记忆和迭代预算。")],
      proof: tr("Per-run timestamps, exit codes and result summaries; for an adaptive check, configured verification and evidence.", "每轮时间、退出码与结果摘要；自主检查还包括配置的验证与证据。"),
      limit: tr("Intervals start after completion, not at fixed wall-clock minutes. Calendar cron, timezone/DST behavior, missed-run backfill and automatic power-on are not implemented. The one-minute scheduler is not a precision timer.", "间隔从完成后开始，不是固定墙钟时间。未实现日历 Cron、时区与夏令时处理、错过运行补跑或自动开机；每分钟调度器不是精确定时器。"), durable: true,
    },
    {
      slug: "ci-follow-up", category: tr("CONDITION WATCH", "条件触发"), title: tr("Act after a matching CI or webhook event", "匹配 CI 或 Webhook 事件后执行"),
      intro: tr("A Condition Watch saves the matching event and a fixed action. Use it for an authorized follow-up that should wait until an external condition is met.", "Condition Watch 保存匹配事件和固定动作，适合等待外部条件满足后执行已授权后续操作。"),
      prompt: tr("Watch the configured CI callback for this run. When the expected workflow completes successfully, run the approved follow-up script on build-pc once. Stop at the deadline and record the event and result.", "监听配置的本轮 CI 回调；预期工作流成功完成后，在 build-pc 上运行一次已批准后续脚本，到期限停止，记录事件和结果。"),
      tools: "create_automation(kind=condition_watch) · get_automation · manage_automation", permission: tr("Required device tools and background tasks, or explicit account/repository authorization for a cloud GitHub merge", "设备所需工具与后台任务；云端 GitHub 合并则要求明确账户与仓库授权"),
      steps: [tr("Freeze the condition match and action. Store the returned secret callback URL securely.", "冻结条件匹配与动作，安全保存返回的秘密回调 URL。"), tr("Configure the event source to deliver to that URL; a matching event makes the saved plan due.", "配置事件来源向该 URL 投递，匹配事件触发已保存计划。"), tr("Check the action result and run history. A GitHub merge additionally requires an authorized installation and repository.", "检查动作结果和运行历史；GitHub 合并还要求已授权安装与仓库。")],
      proof: tr("The matched event and the actual action outcome, rather than just a received callback.", "匹配事件与实际动作结果，而非仅仅收到回调。"),
      limit: tr("Inbound condition hooks use a secret bearer URL and optional delivery-ID deduplication, not provider-specific GitHub HMAC verification. They are separate from signed outbound MCP task events. Do not treat every successful workflow as permission to merge.", "入站条件 Hook 使用秘密 Bearer URL 和可选 Delivery ID 去重，不是 GitHub 专属 HMAC 验证；它与出站签名 MCP 任务事件不同。工作流成功不等于获得合并许可。"), durable: true,
    },
    {
      slug: "data-work", category: tr("DATA", "数据"), title: tr("Process data using your installed environment", "用现有本机环境处理数据"),
      intro: tr("Use the Python, Node or other runtime already installed on the workstation. Keep input and generated artifacts in the chosen project directory.", "使用工作站已安装的 Python、Node 或其他运行时，将输入和生成文件放在指定项目目录。"),
      prompt: tr("On data-pc, use the existing Python environment to summarize reports/input.csv, check row totals and write reports/summary.md. If this will take a long time, save the approved script as a Long Task.", "在 data-pc 上使用现有 Python 环境汇总 reports/input.csv，检查行数合计并写入 reports/summary.md。耗时较长时，把已批准脚本保存为 Long Task。"),
      tools: "read_file · get_file_info · start_process · write_file; create_automation for a long job", permission: tr("File reads + needed editing/terminal tools; background tasks for durable processing", "文件读取 + 所需编辑或终端工具；持久处理还需后台任务"),
      steps: [tr("Inspect the schema and the installed runtime.", "检查数据结构和已安装运行时。"), tr("Run the approved analysis and keep outputs in the project.", "运行已批准分析，将结果保存在项目中。"), tr("Validate totals or output structure and return a concise report.", "验证合计或输出结构，返回简洁报告。")],
      proof: tr("Saved output path, validated totals and the command's exit status.", "输出路径、已验证合计和命令退出状态。"),
      limit: tr("File reads and command results can pass through the relay and AI client. Durable observations can retain excerpts. Keeping the dataset on the device does not mean no data ever leaves it.", "文件读取和命令结果可能经过 Relay 与 AI 客户端；持久观察可以保存片段。数据集留在设备上，不代表绝无数据离开设备。"), durable: false,
    },
    {
      slug: "home-lab", category: tr("HOME LAB", "家庭实验室"), title: tr("Inspect a headless host through its outbound connection", "通过出站连接检查无头主机"),
      intro: tr("Inspect services, logs and installed tooling without opening an inbound Remote Arc port. Save repeatable checks when you need them to run later.", "无需开放 Remote Arc 入站端口便可检查服务、日志和已有工具。需要稍后运行时，可保存可重复检查。"),
      prompt: tr("On home-server, inspect disk usage, failed systemd units and the last 100 lines of the media-service log. Explain the issue. Do not restart or reconfigure anything.", "在 home-server 上检查磁盘占用、失败的 systemd unit 和媒体服务日志最后 100 行，解释问题，不重启或修改配置。"),
      tools: "list_processes · read_file · start_process · process_output", permission: tr("Read tools; terminal when command-based inspection is required", "读取工具；命令级检查还需终端权限"),
      steps: [tr("Confirm the host is online and identify its permitted tools.", "确认主机在线及允许的工具。"), tr("Inspect the requested facts with bounded output.", "读取请求的事实，限制输出范围。"), tr("Report diagnosis separately from any proposed repair.", "把诊断结果与建议修复分开汇报。")],
      proof: tr("Relevant log excerpts, process state and command output tied to the diagnosis.", "支撑诊断的相关日志片段、进程状态和命令输出。"),
      limit: tr("Background login connection needs an available OS user session and network. Remote Arc does not replace fleet configuration management or permanently supervise arbitrary services.", "登录后台连接需要可用 OS 用户会话和网络。Remote Arc 不替代集群配置管理，也不永久监督任意服务。"), durable: false,
    },
    {
      slug: "browser-research", category: tr("BROWSER CONTEXT", "浏览器上下文"), title: tr("Read a page you explicitly share", "读取你明确共享的页面"),
      intro: tr("Share selected Chrome tabs and let the AI read page text, selections, links or tables through the same MCP connection.", "共享选定的 Chrome 标签页，让 AI 通过同一 MCP 连接读取正文、选中文字、链接或表格。"),
      prompt: tr("Read the tab I shared, extract the feature-comparison table and list the documentation links. Do not navigate or submit anything.", "读取我共享的标签页、提取功能对比表并列出文档链接，不跳转或提交任何内容。"),
      tools: "browser_list_tabs · browser_read_page · browser_get_selected_text · browser_extract_links · browser_extract_table", permission: tr("Browser read and explicit tab sharing", "浏览器只读与明确标签页共享"),
      steps: [tr("Install the companion and explicitly share a tab.", "安装 Companion 并明确共享标签页。"), tr("Select the shared tab ID and request only the needed context.", "选择已共享标签页 ID，只读取需要的上下文。"), tr("Return the extracted facts; revoke tab access when finished.", "返回提取的事实，结束后可以撤销标签页访问。")],
      proof: tr("Extracted text or table rows tied to the shared page.", "来自共享页面的正文或表格行。"),
      limit: tr("The companion is read-only. It does not click, navigate, fill forms or provide an adaptive browser agent; browser tools are outside the current Agent Goal action set.", "Companion 只读，不点击、跳转、填写表单或提供自主浏览器 Agent；浏览器工具不属于当前 Agent Goal 动作集合。"), durable: false,
    },
    {
      slug: "remote-support", category: tr("AUTHORIZED SUPPORT", "授权支持"), title: tr("Diagnose a computer you are allowed to manage", "诊断你有权管理的电脑"),
      intro: tr("Read logs and process state on your own machine or one you have permission to administer. Keep diagnosis separate from repair authority.", "读取自己或已获管理许可设备的日志与进程状态，将诊断权限和修复权限区分清楚。"),
      prompt: tr("On the office mini PC, inspect the sync-worker logs and running processes, explain why it fails and ask before restarting or modifying anything.", "在办公室 Mini PC 上检查 sync-worker 日志和运行进程，解释失败原因；重启或修改任何内容前先问我。"),
      tools: "read_file · list_processes · start_process", permission: tr("Read tools for diagnosis; separately authorized terminal actions for repairs", "读取工具用于诊断，修复的终端动作需要单独授权"),
      steps: [tr("Pair only a computer you own or are authorized to administer.", "只配对自己拥有或已获管理授权的电脑。"), tr("Inspect facts within the granted tool and path policy.", "在已授予工具和路径策略内检查事实。"), tr("Explain the cause and obtain the requested repair authorization.", "解释原因并取得请求中要求的修复授权。")],
      proof: tr("A diagnosis backed by the observed state; if repair is authorized, the post-repair check.", "有观察状态支撑的诊断；修复获授权时还应提供修复后检查。"),
      limit: tr("This is file/process support rather than GUI screen control. A prompt constraint is not an OS sandbox. Turning off access does not undo earlier changes.", "这是文件与进程支持，不是 GUI 屏幕控制。提示词约束不属于 OS 沙箱，关闭访问也不会撤销此前修改。"), durable: false,
    },
  ];
}

export function UseCaseCatalog() {
  const { tr } = useI18n();
  const items = cases(tr);
  return <main className="useCaseCatalog revisedUseCases">
    <header className="toolPageHeader"><span className="eyebrow">{tr("USE CASES", "使用场景")}</span><h1>{tr("What would you like done on your computer?", "你想让电脑上的哪项工作完成？")}</h1>
      <p>{tr("Start in your AI chat. Name the computer, describe the result and say how to check it. These examples show the tools, permissions and evidence each workflow needs.", "从 AI 聊天开始，说明目标电脑、想要的结果和检查方式。以下场景说明每种工作需要的工具、权限与证据。")}</p>
      <div className="useCaseEntry"><strong>{tr("Quick work uses tools. Ongoing work uses a saved Task.", "即时工作使用工具，持续工作保存为 Task。")}</strong><p>{tr("You do not need to configure every operation manually. Your AI can create an authorized long-running or scheduled task; Dashboard provides progress and stop controls.", "无需手动配置每次操作。AI 可以创建已授权长任务或定时任务，Dashboard 提供进度与停止控制。")}</p><a href="/docs/long-running-work">{tr("Understand durable work", "了解持久工作")} →</a></div>
    </header>
    <section className="useCaseGrid" aria-label={tr("Workflows", "工作流程")}>{items.map(item => <a className="useCaseCard" key={item.slug} href={"/use-cases/" + item.slug}>
      <span className="eyebrow">{item.category}</span><h2>{item.title}</h2><p>{item.intro}</p><span className="caseMode">{item.durable ? tr("Saved Task · staged release", "持久 Task · 准备发布") : tr("Direct tools", "直接工具调用")}</span><b aria-hidden="true">↗</b>
    </a>)}</section>
    <TaskAvailability />
    <footer className="catalogFooter"><p>{tr("Use your own projects and installed tools. Terminal access remains local-user access; browser context is read-only. Review the exact boundaries before granting capabilities.", "使用自己的项目和现有工具。终端仍是本机用户权限，浏览器上下文只读。授予能力前请了解具体边界。")}</p><a href="/docs">{tr("Exact capabilities", "准确能力")} →</a></footer>
  </main>;
}

export function UseCaseDetail({ slug }: { slug: UseCaseSlug }) {
  const { tr } = useI18n();
  const item = cases(tr).find(entry => entry.slug === slug)!;
  return <main className="technicalDoc revisedUseCases">
    <header className="articleHeader"><a className="caseBack" href="/use-cases">← {tr("All use cases", "全部使用场景")}</a><span className="eyebrow">{item.category}</span><h1>{item.title}</h1><p>{item.intro}</p>{item.durable && <TaskAvailability />}</header>
    <article className="technicalArticle useCaseDetailBody">
      <section><h2>{tr("Ask in your AI chat", "在 AI 聊天中提出请求")}</h2><blockquote className="casePrompt">{item.prompt}</blockquote><p>{tr("This is a sample request, not an automatically started task. The AI resolves the device and checks your existing authorization before using tools or saving ongoing work.", "这是示例请求，不会自动启动任务。AI 会先确认设备和已有授权，再使用工具或保存持续工作。")}</p></section>
      <section><h2>{tr("How the work proceeds", "工作如何推进")}</h2><ol>{item.steps.map(step => <li key={step}>{step}</li>)}</ol></section>
      <section><h2>{tr("Tools and permissions", "工具与权限")}</h2><div className="caseTools"><code>{item.tools}</code></div><p>{item.permission}</p><p>{tr("Permissions belong to the device. Task permissions add lifecycle capabilities; they do not override tool access, workspace roots or sensitive-path checks.", "权限属于每台设备。任务权限增加生命周期能力，不会覆盖工具授权、工作区范围或敏感路径检查。")}</p></section>
      <section><h2>{tr("What a useful result contains", "有用的结果应该包含什么")}</h2><p>{item.proof}</p>{item.durable && <p>{tr("Get the saved status and recent runs with get_automation or open Dashboard → Tasks. Failed, expired, cancelled and paused are distinct outcomes; they should not be described as completed work.", "通过 get_automation 或 Dashboard → Tasks 查看保存状态和近期运行。失败、到期、取消和暂停是不同结果，不能当成工作已完成。")}</p>}</section>
      <section><h2>{tr("Know the boundary", "了解边界")}</h2><p>{item.limit}</p><p>{tr("Active tool results pass through the hosted relay and your selected AI. Durable goals additionally save their contract, bounded observations, factual memory and evidence. Choose the content and access you grant accordingly.", "当前工具结果经过托管 Relay 和所选 AI；持久目标还会保存合同、受限观察、事实记忆和证据，请据此选择任务内容与访问授权。")}</p></section>
      <footer className="articleEndLinks"><a href="/connect-ai">{tr("Connect your AI", "连接 AI")} →</a><a href="/docs/long-running-work">{tr("Long-running work", "持续工作")} →</a><a href="/docs#docs-sandbox">{tr("Execution boundaries", "执行边界")} →</a></footer>
    </article>
  </main>;
}
