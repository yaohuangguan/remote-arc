import React from "react";
import { useI18n } from "./i18n.js";
import "./public-docs.css";

const endpoint = "https://mcp.remotearc.app/mcp";
const engineering = "https://github.com/yaohuangguan/remote-arc/blob/feat/goal-continuation/docs/";

export const publicToolGroups = [
  { en: "Device discovery", zh: "设备发现", scope: "devices:read", tools: ["list_devices", "device_tools"] },
  { en: "Read files and processes", zh: "文件与进程读取", scope: "computer:read", tools: ["list_directory", "read_file", "read_binary_file", "create_file_resource", "revoke_file_resource", "get_file_info", "list_processes"] },
  { en: "Edit files and run commands", zh: "编辑文件与执行命令", scope: "computer:write", tools: ["write_file", "edit_block", "undo_last_change", "start_process", "process_status", "process_output", "stop_process"] },
  { en: "Explicitly shared browser tabs", zh: "明确共享的浏览器标签页", scope: "browser:read", tools: ["browser_list_tabs", "browser_get_current_tab", "browser_read_page", "browser_get_selected_text", "browser_extract_links", "browser_extract_table"] },
  { en: "Per-tab browser interaction", zh: "按标签页授权浏览器交互", scope: "browser:interact", tools: ["browser_click", "browser_fill"] },
  { en: "Read durable tasks", zh: "读取持久任务", scope: "automation:read", tools: ["list_automations", "get_automation", "get_goal_context"] },
  { en: "Create and manage durable tasks", zh: "创建与管理持久任务", scope: "automation:write", tools: ["create_automation", "manage_automation"] },
  { en: "Adaptive goals and source decisions", zh: "自主目标与源 Agent 决策", scope: "automation:write + agent:write", tools: ["create_agent_goal", "submit_goal_decision"] },
] as const;
const toolCount = publicToolGroups.reduce((count, group) => count + group.tools.length, 0);

export function TaskAvailability() {
  const { tr } = useI18n();
  return <aside className="docsAvailability">
    <strong>{tr("About availability", "关于可用状态")}</strong>
    <p>{tr("This documentation covers the current development implementation. Persistent tasks and source-agent continuation are staged for release. Your deployment must include the matching relay and local agent. Real Chat/Work overnight acceptance and secure task-event delivery remain release checks; a UI preview is not a live execution service.", "本文覆盖当前开发实现。持久任务与源 Agent 续接正在准备发布，部署需要匹配的 Relay 和本地 Agent。真实 Chat/Work 过夜验收与安全任务事件投递仍属于发布检查；界面预览不提供真实执行服务。")}</p>
  </aside>;
}

function Code({ children }: { children: string }) {
  return <pre className="docsExample"><code>{children}</code></pre>;
}

function ToolReference() {
  const { tr } = useI18n();
  return <>
    <p>{tr(`The current hosted MCP implementation defines ${toolCount} public tools. Availability on a selected computer is further filtered by its permissions and installed agent capabilities. OAuth scope names describe authorization, not every tool's side effects: process_status and process_output currently require computer:write.`, `当前托管 MCP 实现定义了 ${toolCount} 个公开工具。目标电脑实际可用的能力还取决于设备权限和已安装 Agent。OAuth Scope 名称表达授权范围，不能直接当成工具副作用分类；例如 process_status 和 process_output 当前也要求 computer:write。`)}</p>
    <p>{tr("Plan entitlement is an account-level ceiling in addition to OAuth and device policy. Free can use the core remote-computer tools. Plus additionally authorizes binary reads, temporary revision-pinned file resources, durable and overnight Tasks, schedules, planned Agent Goals and supported keep-awake. UI visibility never substitutes for this relay-side gate.", "套餐 entitlement 是 OAuth 与设备策略之外的账户级上限。Free 可以使用核心远程电脑工具；Plus 额外授权二进制读取、绑定文件版本的临时文件资源、持久与隔夜 Task、定时任务、计划模式 Agent Goal 和受支持的 keep-awake。界面可见性不能替代 Relay 侧的套餐校验。")}</p>
    <div className="toolReferenceList">{publicToolGroups.map(group => <div key={group.en}>
      <h3>{tr(group.en, group.zh)}</h3><code>{group.tools.join(" · ")}</code><p>{tr("Required OAuth scope: ", "所需 OAuth Scope：")}{group.scope}</p>
    </div>)}</div>
    <p>{tr("Background-service controls, directory pickers and power leases are internal device/Dashboard helpers. MCP event methods are protocol extensions, not additional tools.", "后台服务控制、目录选择器和保持唤醒租约是设备或 Dashboard 内部辅助能力。MCP 事件方法属于协议扩展，不计入工具数量。")}</p>
  </>;
}

export function Documentation() {
  const { tr } = useI18n();
  const contents = [
    ["start", tr("Set up once", "一次配置")], ["model", tr("Chat, tools and Tasks", "聊天、工具与 Task")],
    ["routing", tr("System architecture", "系统架构")], ["policy", tr("Device permissions", "设备权限")],
    ["files", tr("Files and Undo", "文件与 Undo")], ["processes", tr("Processes and recovery", "进程与恢复")],
    ["automations", tr("Durable task modes", "持久任务模式")], ["continuation", tr("Chat and continuing agents", "Chat 与持续 Agent")],
    ["schedule", tr("Scheduling and sleep", "调度与休眠")], ["browser", tr("Browser context", "浏览器上下文")],
    ["sandbox", tr("Execution and isolation", "执行与隔离")], ["tools", tr("MCP tool reference", "MCP 工具参考")],
    ["data", tr("Data handling", "数据处理")], ["troubleshoot", tr("Troubleshooting", "排查问题")], ["limits", tr("Availability and limits", "可用状态与边界")],
  ];
  return <main className="technicalDoc productDocs">
    <header className="articleHeader">
      <span className="eyebrow">{tr("DOCUMENTATION", "文档")}</span>
      <h1>{tr("Your AI. Your computer. Work that can continue.", "你的 AI、你的电脑，可以持续推进的工作。")}</h1>
      <p>{tr("Pair a computer, choose its permissions and connect your AI through Remote MCP. Use ordinary tools for immediate work, or a durable Task when work needs to continue, wait for an event or run later.", "配对电脑、选择设备权限，再通过 Remote MCP 连接 AI。即时操作直接使用工具；需要持续推进、等待事件或稍后执行的工作，则保存为持久 Task。")}</p>
      <div className="articleMetaLinks"><a href="/docs/mcp">{tr("MCP reference", "MCP 接入参考")} →</a><a href="/docs/long-running-work">{tr("Long-running work", "持续工作指南")} →</a><a href="/use-cases">{tr("Use cases", "使用场景")} →</a></div>
      <TaskAvailability />
    </header>
    <div className="technicalDocLayout">
      <aside className="articleToc"><strong>{tr("CONTENTS", "目录")}</strong>{contents.map(([id, title]) => <a key={id} href={"#docs-" + id}>{title}</a>)}</aside>
      <article className="technicalArticle">
        <section id="docs-start">
          <h2>{tr("Set up the computer and the AI client once", "电脑和 AI 客户端各配置一次")}</h2>
          <p>{tr("On the Windows, macOS or Linux computer that owns the project, run the command below with Node.js 20 or newer. The CLI opens a short-lived browser pairing flow. Sign in, compare the code and approve the correct machine.", "在保存项目的 Windows、macOS 或 Linux 电脑上，使用 Node.js 20 或更高版本运行以下命令。CLI 会打开短期浏览器配对流程；登录、核对配对码并确认正确的电脑。")}</p>
          <Code>npx remotelink</Code>
          <p>{tr("New devices start with read-oriented tools. File editing, terminal execution, workspace roots and login background connection are separate choices. Finish setup before connecting your AI. The background switch installs an OS login service only after setup, and Dashboard reports its verified local state.", "新设备从读取类工具开始。文件编辑、终端执行、工作区目录和登录后台连接可以分别选择。完成设备设置后再连接 AI；后台开关会在完成设置后安装 OS 登录服务，Dashboard 显示的是本机确认后的状态。")}</p>
          <Code>{endpoint}</Code>
          <p>{tr("Connect the AI client to this endpoint and complete Remote Arc OAuth. Use the client-specific installation guide for ChatGPT, Claude or Cursor. Pairing a computer and authorizing an AI client are independent: you can revoke either relationship separately.", "将 AI 客户端连接到这个地址并完成 Remote Arc OAuth。ChatGPT、Claude 和 Cursor 各有安装指南。配对电脑与授权 AI 客户端是两条独立关系，可以分别撤销。")}</p>
          <div className="articleMetaLinks"><a href="/install/chatgpt">ChatGPT →</a><a href="/install/claude">Claude →</a><a href="/install/cursor">Cursor →</a></div>
        </section>
        <section id="docs-model">
          <h2>{tr("Keep using your AI chat", "继续从 AI 聊天入口使用")}</h2>
          <p>{tr("Ask for work in the chat you already use and name the target computer. Reading a file, inspecting a process or running a short command is an ordinary tool call. It does not create a Task for every operation.", "直接在平时的 AI 聊天中说明工作和目标电脑。读文件、查看进程或运行短命令属于普通工具调用，不会每次操作都创建一个 Task。")}</p>
          <p>{tr("A Task is a saved unit of ongoing work: its goal or fixed plan, trigger, device, approved capabilities, deadline and progress. It can contain many tool calls. When you request ongoing or scheduled work, the AI can save that Task inside your authorization; you do not need to fill out a Dashboard form. Dashboard is there to inspect results, pause or cancel tasks and change device permissions.", "Task 是一项保存下来的持续工作，包含目标或固定计划、触发方式、设备、已批准能力、期限和进度，可以包含很多次工具调用。你要求持续或定时工作时，AI 可以在授权范围内保存 Task，无需手动填写 Dashboard 表单。控制台用于查看结果、暂停或取消任务，以及修改设备权限。")}</p>
        </section>
        <section id="docs-routing">
          <h2>{tr("How execution reaches your computer", "执行如何抵达你的电脑")}</h2>
          <div className="articleFlow"><code>AI / Plugin</code><span>→</span><code>OAuth · MCP</code><span>→</span><code>Cloudflare Worker</code><span>→</span><code>Durable Object</code><span>→</span><code>outbound WSS</code><span>→</span><code>{tr("Local agent", "本地 Agent")}</code></div>
          <p>{tr("The Worker authenticates the account and client, checks policy and selects the device. Per-user Durable Objects route live requests over the device's outbound WebSocket. D1 stores accounts, authorization, policies and durable task progress. Commands and file operations execute on the paired computer using its installed software.", "Worker 认证账户与客户端、检查策略并选择设备。每用户 Durable Object 通过设备主动建立的出站 WebSocket 路由实时请求；D1 保存账户、授权、策略和持久任务进度。命令和文件操作在已配对电脑上执行，使用本机已经安装的软件。")}</p>
          <p>{tr("No public inbound port, router forwarding or VPN is required. Persistence is handled by the task scheduler and database; the device connection provides execution when the computer is available.", "无需公网入站端口、路由器映射或 VPN。任务调度器和数据库负责持久化，设备连接在电脑可用时提供真实执行。")}</p>
          <a href={engineering + "system-architecture.md"}>{tr("Full engineering architecture", "完整系统技术文档")} ↗</a>
        </section>
        <section id="docs-policy">
          <h2>{tr("Choose permissions for each computer", "分别选择每台电脑的权限")}</h2>
          <div className="docsTableWrap"><table className="articleTable"><thead><tr><th>{tr("Control", "控制项")}</th><th>{tr("What it governs", "控制什么")}</th></tr></thead><tbody>
            <tr><td>OAuth scopes</td><td>{tr("The AI client's account-level authorization. Device policy still applies.", "AI 客户端的账户级授权，仍需遵守设备策略。")}</td></tr>
            <tr><td>{tr("Allowed tools", "允许的工具")}</td><td>{tr("Read, edit, terminal and browser capabilities. Read-only, Developer and Full are convenience presets; individual tools remain controllable.", "读取、编辑、终端和浏览器能力。只读、Developer 和 Full 是快捷预设，工具仍可逐项控制。")}</td></tr>
            <tr><td>Trusted Write Locations</td><td>{tr("Persistent roots where file mutation can happen without per-request approval; scoped terminal commands also require an in-scope cwd.", "可无需逐次审批进行文件修改的长期可信目录；受范围限制的终端命令也要求 cwd 位于这些目录内。")}</td></tr>
            <tr><td>Sensitive Path Policy</td><td>{tr("Credential and browser-profile paths, with narrow explicit exceptions.", "凭证和浏览器 Profile 路径保护，可配置窄范围例外。")}</td></tr>
            <tr><td>{tr("Task permissions", "任务权限")}</td><td>{tr("Background work, scheduling, adaptive goals, source-agent continuation and task keep-awake, each with its own switch.", "后台工作、定时、自主目标、源 Agent 续接和任务保持唤醒各有独立开关。")}</td></tr>
            <tr><td>{tr("Local ceiling", "本机权限上限")}</td><td>{tr("npx remotelink --safe keeps a local read-only ceiling that Dashboard cannot expand.", "npx remotelink --safe 设置本机只读上限，Dashboard 无法远程扩大。")}</td></tr>
          </tbody></table></div>
          <p>{tr("Task permissions do not grant missing file or terminal tools. Source continuation and task keep-awake require opt-in. Turning off a task permission cancels affected active tasks. Changing the frozen device tool/path policy stops unattended work; it does not grant an old Task new authority.", "任务权限不会额外授予缺失的文件或终端工具。源续接和任务保持唤醒需要明确开启；关闭任务权限会取消受影响的活动任务。修改已冻结的设备工具或路径策略会停止无人值守工作，不会扩大旧 Task 的权限。")}</p>
        </section>
        <section id="docs-files">
          <h2>{tr("Files, protected paths and Local Undo", "文件、受保护路径和 Local Undo")}</h2>
          <p>{tr("File reads and writes are independent. The local core resolves paths, including symlinks, before enforcing workspace roots and sensitive-path protection. You can allow one required credential file without disabling all sensitive-path protection.", "文件读取和写入权限独立。本地核心先解析路径，包括符号链接，再执行工作区和敏感路径检查。需要某个凭证文件时，可以设置窄范围例外，无需关闭全部保护。")}</p>
          <p>{tr("Supported write_file and edit_block edits can save the previous file state under ~/.remotearc/undo. Snapshots stay on the computer. Undo checks the current file hash before restoring, so a newer change is not silently overwritten. Shell edits, deployments, database changes and external API actions are outside Local Undo.", "受支持的 write_file 和 edit_block 修改可将旧文件状态保存到 ~/.remotearc/undo，快照留在本机。Undo 恢复前会检查当前文件 Hash，避免静默覆盖后续修改。Shell 编辑、部署、数据库修改和外部 API 动作不属于 Local Undo。")}</p>
        </section>
        <section id="docs-processes">
          <h2>{tr("A process handle and a durable Task have different lifetimes", "进程句柄与持久 Task 的寿命不同")}</h2>
          <p>{tr("list_processes inspects OS processes without granting shell execution. start_process requires terminal permission and can run synchronously or in background mode. Background mode returns process_id; process_status, process_output and stop_process use that local agent handle.", "list_processes 查看 OS 进程，不等于授予 Shell 执行。start_process 要求终端权限，可以同步执行或后台运行；后台模式返回 process_id，供 process_status、process_output 和 stop_process 使用。")}</p>
          <div className="docsTableWrap"><table className="articleTable"><thead><tr><th>{tr("What persists", "保存的对象")}</th><th>{tr("After an interruption", "中断后会怎样")}</th></tr></thead><tbody>
            <tr><td>{tr("Direct background process", "直接后台进程")}</td><td>{tr("Its handle and captured output are in the running agent's memory. They are lost on agent restart; a machine reboot ends the old OS process.", "句柄和捕获的输出保存在当前 Agent 内存中，Agent 重启后丢失；电脑重启会结束旧 OS 进程。")}</td></tr>
            <tr><td>{tr("Durable Task", "持久 Task")}</td><td>{tr("The saved contract, progress and run history remain in D1. After device reconnection, execution continues from the saved state according to the recovery policy.", "合同、进度和运行历史保存在 D1。设备重连后，根据恢复策略从保存的状态继续处理。")}</td></tr>
            <tr><td>{tr("Always-on OS service", "常驻 OS 服务")}</td><td>{tr("Use a service manager for a daemon that must be restarted and supervised independently of an AI Task.", "需要独立于 AI Task 长期启动和监督的守护进程，应由服务管理器负责。")}</td></tr>
          </tbody></table></div>
          <p>{tr("For a known, acknowledged process whose handle is lost, a deterministic Task can restart the attempt or fail, according to recovery. Restart creates a new attempt; it does not revive the same PID. Agent Goals inspect the current state before choosing another action. If dispatch happened without an acknowledged result, the system records uncertainty and avoids blindly replaying the effect.", "对于已确认启动、但后来丢失句柄的进程，确定性 Task 会按 recovery 重新启动尝试或失败。重新启动产生新的尝试，不是恢复原 PID。Agent Goal 会先检查当前状态再决定下一步。如果已派发操作却没有确认结果，系统会记录不确定性，避免盲目重放副作用。")}</p>
          <p>{tr("Use a durable long_task for a lengthy build, export or script. Use launchd, systemd or Windows Services when the workload is a permanent service. These choices solve different lifecycle needs.", "长时间构建、导出或脚本可使用持久 long_task。工作负载属于常驻服务时，再使用 launchd、systemd 或 Windows 服务。两者解决不同的生命周期需求。")}</p>
        </section>
        <section id="docs-automations">
          <h2>{tr("Five ways to save ongoing work", "五种持续工作方式")}</h2>
          <div className="docsTableWrap"><table className="articleTable"><thead><tr><th>{tr("Mode", "模式")}</th><th>{tr("Behavior", "行为")}</th></tr></thead><tbody>
            <tr><td>Long Task</td><td>{tr("Track an approved command until it exits.", "跟踪已批准命令直到退出。")}</td></tr>
            <tr><td>Condition Watch</td><td>{tr("Run a fixed plan after a matching webhook.", "收到匹配 Webhook 后执行固定计划。")}</td></tr>
            <tr><td>Schedule Watch</td><td>{tr("Run a fixed plan later or at a completion-based interval.", "稍后执行，或按上轮完成后的间隔执行固定计划。")}</td></tr>
            <tr><td>Goal Loop</td><td>{tr("Repeat the same plan and verification until the check passes or a limit stops it.", "重复同一计划与验证，直到检查通过或触及停止限制。")}</td></tr>
            <tr><td>Agent Goal</td><td>{tr("Observe, choose an approved tool, adapt to results and verify completion.", "观察、选择已批准工具、根据结果调整并验证完成。")}</td></tr>
          </tbody></table></div>
          <p>{tr("A one-minute cloud scheduler advances due tasks with persisted leases and revisions. The interval controls when work becomes due, not an exact execution second. Task creation freezes the plan or objective, tools, device-policy snapshot and limits. Pause, cancel, expiry and stale-worker checks prevent an old execution turn from overwriting newer task state.", "每分钟云端调度器通过持久租约和 revision 推进到期任务。间隔控制何时进入待执行状态，不保证精确到某一秒。创建时会冻结计划或目标、工具、设备策略快照和限制；暂停、取消、到期及旧 Worker 检查阻止旧轮次覆盖新状态。")}</p>
          <p>{tr("A GitHub merge action runs in the cloud and needs an explicit account, installation and repository permission binding. A configured installation ID alone is not authorization to merge any user's repository. A condition callback is a secret URL; the current inbound condition hook does not claim GitHub HMAC verification.", "GitHub 合并动作在云端运行，需要明确的账户、安装和仓库权限绑定；配置 Installation ID 本身不代表有权合并任何用户仓库。条件回调采用秘密 URL，当前入站条件 Hook 不声称已实现 GitHub HMAC 校验。")}</p>
        </section>
        <section id="docs-continuation">
          <h2>{tr("Who keeps deciding the next step?", "谁持续决定下一步？")}</h2>
          <p>{tr("Source mode keeps decisions in your AI client: create_agent_goal(controller=source), read get_goal_context, then submit_goal_decision for the next action. The saved objective, factual memory, observations and journal support continuation in a later chat. Goals created through MCP are bound to the creating OAuth client for decision submission.", "源模式由你的 AI 客户端决定：create_agent_goal(controller=source) 保存目标，get_goal_context 读取上下文，submit_goal_decision 提交下一步。保存的目标、事实记忆、观察和日志支持后续聊天继续处理。通过 MCP 创建的源目标会把决策提交绑定到创建它的 OAuth 客户端。")}</p>
          <p>{tr("A continuing Work/Codex runtime can drive this loop. Ordinary Chat can create fixed background tasks and inspect them later; continued adaptive work needs a host that keeps the decision loop running or supports verified event continuation. Connecting a Plugin alone does not guarantee hours of reasoning. Hosted mode uses the explicitly selected configured Remote Arc planner; it may use a different model. Source mode never silently falls back to hosted mode.", "持续运行的 Work/Codex 环境可以推进这个循环。普通 Chat 可以创建固定后台任务并稍后查看；持续自主工作需要宿主维持决策循环，或支持经过验证的事件续接。连接 Plugin 本身不保证多小时推理。托管模式由明确选择的 Remote Arc Planner 推进，模型可能不同；源模式不会静默切换为托管模式。")}</p>
          <p>{tr("Configured task events notify meaningful state changes, such as needing an agent, completion or failure. Secure callback delivery and real host acceptance are still required. An accepted webhook is a receipt, not proof the host continued or the goal succeeded.", "配置后的任务事件通知需要 Agent、完成或失败等有意义的状态变化。仍需完成安全回调部署和真实宿主验收；Webhook 被接收只代表收件，不证明宿主已继续或目标已成功。")}</p>
          <a href="/docs/long-running-work#work-agent">{tr("Controller and overnight guide", "控制器与过夜指南")} →</a>
        </section>
        <section id="docs-schedule">
          <h2>{tr("Future starts, recurring work and keeping the computer awake", "未来启动、周期工作与电脑保持唤醒")}</h2>
          <p>{tr("Fixed plans and Agent Goals support a future ISO timestamp or interval schedule. Recurring runs of the same task do not overlap. The next interval starts from the previous run's completion, and a recurring Agent Goal starts with fresh working memory and its own iteration budget. Calendar cron, timezone/DST handling and missed-run backfill are not implemented.", "固定计划和 Agent Goal 支持未来 ISO 时间或间隔调度。同一任务不重叠运行，下一次间隔从上轮完成开始计算。周期 Agent Goal 每轮重置工作记忆和迭代预算；当前未实现日历 Cron、时区与夏令时处理或错过运行补跑。")}</p>
          <p>{tr("Login background connection uses launchd on macOS, Task Scheduler at user logon on Windows and systemd --user on Linux. It reconnects after wake or network interruptions. Locking the screen is different from sleeping: sleep and power loss make the computer unavailable until it returns.", "登录后台连接在 macOS 使用 launchd，Windows 使用用户登录时启动的 Task Scheduler，Linux 使用 systemd --user。唤醒或网络中断后会重连。锁屏不等于休眠；休眠和断电会让电脑不可用，必须等待恢复。")}</p>
          <p>{tr("Task keep-awake requires both device permission and keep_awake=true on that task, plus a compatible local agent. Active tasks renew short-lived OS power requests; completion, cancellation, pause or lease expiry releases them. This does not power on a shut-down computer, defeat forced sleep or permanently change power settings. Future tasks need an available computer when they start.", "任务保持唤醒同时要求设备授权、任务设置 keep_awake=true 和兼容的本地 Agent。活动任务续租短期 OS 电源请求，完成、取消、暂停或租约到期后释放。它不能启动已关机电脑、阻止强制休眠或永久修改电源设置；未来任务开始时电脑需要可用。")}</p>
        </section>
        <section id="docs-browser">
          <h2>{tr("Read the tabs you explicitly share", "读取你明确共享的标签页")}</h2>
          <p>{tr("The Chrome companion adds scoped page context to the same MCP connection. Share as many tabs as you need; Remote Arc has no fixed tab-count cap, and every tab starts read-only. You can separately enable Click & fill for one shared tab. Interaction requires a fresh page snapshot, rejects stale element refs, and blocks recognized password, one-time-code, payment-card and file-picker fields. Browser tools are not currently part of the six-tool adaptive goal action set.", "Chrome Companion 为同一 MCP 连接提供受控页面上下文。可以同时共享任意数量的标签页，Remote Arc 不设置固定数量上限，每个标签页默认只读；需要时再对某一个已共享标签页单独开启 Click & fill。交互必须基于最新页面快照，过期元素引用会被拒绝，并阻止能够通过标准字段类型或 autocomplete 元数据识别出的密码、一次性验证码、支付卡与文件选择字段。浏览器工具目前不属于自主目标的六种动作工具。")}</p>
          <a href="/docs/mcp#chrome-browser">{tr("Install the browser companion", "安装浏览器 Companion")} →</a>
        </section>
        <section id="docs-sandbox">
          <h2>{tr("Native execution and sandbox isolation", "本机执行与沙箱隔离")}</h2>
          <p>{tr("Sandbox isolation would place commands in an OS-enforced environment with restricted files, processes, credentials and network access. Remote Arc currently executes as the local OS user. Tool permissions, workspace paths and Safety Guard reduce reach and mistakes, but do not create an OS sandbox. A shell can reference paths beyond cwd and use the local user's network access.", "沙箱隔离是把命令放进由 OS 强制约束的环境，限制文件、进程、凭证和网络访问。Remote Arc 当前以本机 OS 用户身份执行。工具权限、工作区路径和 Safety Guard 可以缩小能力与减少误操作，但不构成 OS 沙箱；Shell 仍能引用 cwd 之外的路径并使用本机用户的网络权限。")}</p>
          <p>{tr("An AI client's own sandbox protects its execution environment; it does not automatically contain commands sent through MCP to your computer. For constrained file-only work, keep terminal disabled. For stronger isolation now, pair a dedicated restricted OS account or an isolated machine you manage. A container or VM requires its own correctly configured boundary.", "AI 客户端自身的沙箱保护的是它的运行环境，不会自动隔离通过 MCP 发到你电脑上的命令。仅需受限文件操作时应关闭终端。现阶段若需要更强隔离，可以配对受限的独立 OS 账户或你管理的隔离设备；容器或虚拟机仍需要正确配置自身边界。")}</p>
          <p>{tr("A selectable isolated execution profile is a future design, not a working Dashboard feature. Native access remains useful for your existing projects and tools. The engineering decision explains when isolation is appropriate and what must be verified before adding an isolation switch.", "可选隔离执行配置属于未来设计，当前 Dashboard 没有已实现的沙箱功能。本机访问仍适合已有项目与工具链；技术决策文档说明哪些场景需要隔离，以及增加开关前必须验证的边界。")}</p>
          <a href={engineering + "execution-isolation.md"}>{tr("Isolation design decision", "隔离技术决策")} ↗</a>
        </section>
        <section id="docs-tools"><h2>{tr("Public MCP tools", "公开 MCP 工具")}</h2><ToolReference /></section>
        <section id="docs-data">
          <h2>{tr("What passes through the relay, and what is saved", "哪些内容经过 Relay，哪些会保存")}</h2>
          <p>{tr("Active file contents, tool arguments and command output pass through the hosted relay and your chosen AI client. Transport uses HTTPS/WSS; this is not zero-knowledge end-to-end encryption. Operational audit records retain metadata such as tool, device, time and outcome rather than raw payloads.", "当前文件内容、工具参数和命令输出会经过托管 Relay 并返回所选 AI 客户端。传输使用 HTTPS/WSS，不属于 zero-knowledge 端到端加密。运行审计保留工具、设备、时间和结果等元数据，而非原始 Payload。")}</p>
          <p>{tr("Durable task storage is separate from audit storage. It saves approved commands/plans, objectives, verification, policy snapshots, run summaries, factual memory, bounded observations and completion evidence. Observations can contain file content or command output. Pending source decisions can contain edit content; their bodies are cleared after consumption, while idempotency hashes remain.", "持久任务存储独立于审计存储，会保存已批准的命令或计划、目标、验证、策略快照、运行摘要、事实记忆、受限观察和完成证据。观察可能包含文件内容或命令输出；待消费源决策可能包含编辑内容，消费后清除正文并保留幂等 Hash。")}</p>
          <p>{tr("Hosted goals send bounded context to the configured planner provider. Source goals return it to the authorized source client. Task event callbacks use an encrypted stored signing secret and carry short change metadata; readers obtain full context through authorized tools. Full local process capture and Undo snapshots have local retention limits.", "托管目标把受限上下文发送到配置的 Planner 服务，源目标则返回给已授权源客户端。任务事件回调使用加密保存的签名 Secret，仅携带简短变化元数据；完整上下文通过授权工具读取。本地完整进程捕获和 Undo 快照有各自的保留限制。")}</p>
          <a href="/privacy">{tr("Privacy details", "隐私详情")} →</a>
        </section>
        <section id="docs-troubleshoot">
          <h2>{tr("When work is not progressing", "工作没有推进时")}</h2>
          <ul className="articleBulletList">
            <li>{tr("Device offline: check power, login, local agent and network. Reconnect can resume a saved Task; the relay cannot wake a powered-off machine.", "设备离线：检查供电、登录、本地 Agent 和网络。重连可继续保存的 Task，Relay 无法唤醒已关机设备。")}</li>
            <li>{tr("Tool unavailable: inspect device_tools, device policy and the local --safe ceiling. A Task switch alone does not enable terminal access.", "工具不可用：检查 device_tools、设备策略和本机 --safe 上限。单独打开任务开关不会授予终端能力。")}</li>
            <li>{tr("Waiting for source AI: read get_goal_context and check the host runtime or event subscription. No new source decision means no new adaptive action.", "等待源 AI：读取 get_goal_context，检查宿主持续运行或事件订阅。没有新源决策，就没有新的自主动作。")}</li>
            <li>{tr("Policy changed or result unknown: read the error and journal, inspect the actual state, then choose a safe next step. Do not repeat an uncertain external effect blindly.", "策略变化或结果未知：阅读错误与日志、检查真实状态，再选择安全的下一步，不要盲目重复不确定的外部副作用。")}</li>
            <li>{tr("Finished without independent verification: provide a reliable verification command next time. A completion label alone is not an independent test.", "没有独立验证便显示完成：下次提供可靠验收命令。完成标签本身不等于独立测试。")}</li>
          </ul>
        </section>
        <section id="docs-limits">
          <h2>{tr("Availability and practical limits", "可用状态与实际边界")}</h2>
          <p>{tr("The current code includes persistent task recovery, source decisions, device task controls and bounded keep-awake helpers. Release still requires real Plugin OAuth, secure event-egress configuration, host continuation tests and target-OS power verification. These checks are separate from passing mocked tests and showing a Dashboard preview.", "当前代码包含持久任务恢复、源决策、设备任务控制和有界保持唤醒 Helper。发布仍需真实 Plugin OAuth、安全事件出站配置、宿主续接测试和目标 OS 电源验证；这些检查独立于模拟测试通过和 Dashboard 界面预览。")}</p>
          <p>{tr("Remote Arc does not provide GUI desktop control, arbitrary shell containment, exactly-once external effects or guaranteed model reasoning duration. Set a deliverable, verification and reasonable limits; treat failed, expired, cancelled and blocked work as distinct outcomes.", "Remote Arc 当前不提供 GUI 桌面控制、任意 Shell 隔离、外部副作用 exactly-once 保证或固定模型推理时长。请设置交付物、验收和合理限制，区分失败、到期、取消与阻塞结果。")}</p>
          <div className="articleEndLinks"><a href="/docs/long-running-work">{tr("Long-running work", "持续工作")} →</a><a href="/security-model">{tr("Security model", "安全模型")} →</a><a href="/use-cases">{tr("Use cases", "使用场景")} →</a></div>
        </section>
      </article>
    </div>
  </main>;
}

export function McpReference() {
  const { tr } = useI18n();
  return <main className="technicalDoc productDocs">
    <header className="articleHeader"><span className="eyebrow">REMOTE MCP</span><h1>{tr("Connect an AI client. Use the same paired computers.", "连接 AI 客户端，复用已配对的电脑。")}</h1>
      <p>{tr("One Streamable HTTP endpoint, Remote Arc OAuth and explicit tools. This reference covers connection, scopes, device discovery and the durable goal protocol.", "一个 Streamable HTTP 端点、Remote Arc OAuth 和明确的工具。本参考涵盖连接、Scope、设备发现和持久目标协议。")}</p>
      <Code>{endpoint}</Code><TaskAvailability />
    </header>
    <div className="technicalDocLayout"><aside className="articleToc"><strong>{tr("CONTENTS", "目录")}</strong>{[
      ["mcp-connect", tr("Connect your client", "连接客户端")], ["mcp-auth", tr("Authorization", "授权")], ["mcp-device", tr("Select a device", "选择设备")],
      ["mcp-tools", tr("Tools and scopes", "工具与 Scope")], ["mcp-goal", tr("Source goal protocol", "源目标协议")], ["mcp-events", tr("Task events", "任务事件")], ["chrome-browser", tr("Browser companion", "浏览器 Companion")],
    ].map(([id, label]) => <a key={id} href={"#" + id}>{label}</a>)}</aside><article className="technicalArticle">
      <section id="mcp-connect"><h2>{tr("Connect using the client installation path", "通过客户端安装入口连接")}</h2>
        <p>{tr("Pair your computer first. In ChatGPT, open Plugins and install Remote Arc when it is available to your account. For developer testing before publication, enable Developer mode under Settings → Security and login, add an MCP connection from the Plugins plus button and enter the endpoint above. Availability depends on your account and workspace policy.", "先配对电脑。在 ChatGPT 中打开 Plugins，账户可以看到 Remote Arc 时即可安装。发布前开发测试可在 Settings → Security and login 开启 Developer mode，再从 Plugins 加号添加 MCP 连接并填写上方地址。功能可用性取决于账户与工作区策略。")}</p>
        <p><a href="https://developers.openai.com/plugins/deploy/connect-chatgpt" target="_blank" rel="noreferrer">{tr("Official OpenAI connection guide", "OpenAI 官方连接指南")} ↗</a></p>
        <p>{tr("Claude uses a custom Remote MCP connector and OAuth. Cursor can use the generated MCP installation link or its remote server configuration. Other clients must support the endpoint transport and OAuth discovery; compatibility does not imply they can continue an agent overnight.", "Claude 使用自定义 Remote MCP Connector 和 OAuth；Cursor 可使用生成的 MCP 安装链接或远程服务器配置。其他客户端需要支持此端点的传输和 OAuth 发现。连接兼容不代表具备过夜 Agent 续接能力。")}</p>
        <div className="articleMetaLinks"><a href="/install/chatgpt">ChatGPT →</a><a href="/install/claude">Claude →</a><a href="/install/cursor">Cursor →</a></div>
      </section>
      <section id="mcp-auth"><h2>{tr("OAuth and device access are separate", "OAuth 与设备权限分离")}</h2>
        <p>{tr("The endpoint uses OAuth authorization code flow with PKCE and published discovery metadata. Sign in to Remote Arc and review the requested scopes. Device credentials stay with the local agent; you do not paste a computer credential into the AI client. Revoking a client grant, pausing account MCP access or revoking a device can stop access independently.", "端点使用带 PKCE 的 OAuth 授权码流程和公开发现元数据。登录 Remote Arc 并核对请求 Scope；设备凭证留在本地 Agent，不需要粘贴给 AI 客户端。客户端授权撤销、账户 MCP 暂停和设备撤销可分别切断访问。")}</p>
        <p>{tr("Task permission is persistent authority for the saved work. Every future device action still checks ownership, revocation, approved tools and the local path policy. Pausing MCP client access and pausing a Task are separate controls; use task controls to stop unattended execution.", "任务授权赋予的是已保存工作的持续执行能力；未来每次设备动作仍检查归属、撤销、已批准工具和本地路径策略。暂停 MCP 客户端访问与暂停 Task 是独立控制；停止无人值守执行应使用任务控制。")}</p>
      </section>
      <section id="mcp-device"><h2>{tr("Discover before acting", "先发现设备，再操作")}</h2>
        <ol><li>{tr("Call list_devices and resolve the user-named computer to device_id.", "调用 list_devices，把用户指定的电脑解析为 device_id。")}</li><li>{tr("Call device_tools for the tools available on that computer.", "调用 device_tools，查看目标电脑实际开放的工具。")}</li><li>{tr("Pass device_id with device tool calls; check the workspace and action's permission before a write or command.", "设备工具调用传入 device_id，写入或执行命令前检查工作区与动作权限。")}</li></ol>
        <Code>{'{ "device_id": "<id returned by list_devices>", "path": "/your/workspace/README.md" }'}</Code>
        <p>{tr("Path syntax is the target computer's syntax. Ordinary calls need an online device. A saved Task can wait for reconnection; that does not make a direct call durable.", "路径采用目标电脑的语法。普通调用要求设备在线；保存的 Task 可以等待重连，但不代表直接调用也具备持久化能力。")}</p>
      </section>
      <section id="mcp-tools"><h2>{tr("Tools and required scopes", "工具与所需 Scope")}</h2><ToolReference /></section>
      <section id="mcp-goal"><h2>{tr("Continue a goal from the source AI", "由源 AI 持续推进目标")}</h2>
        <p>{tr("Optional plan adds fixed/guided/autonomous phases, dependencies, useful minimum/maximum/end-at time, finalization reserve, required checks, stuck recovery and valuable safe continuation. Planned decisions also support revise_plan, execution_slice, phase_result and needs_reasoning. Saved slices continue without the source response; new judgment waits for a later source turn. Read the long-work guide for green-only isolated worktrees and the full contract.", "可选 plan 增加固定/引导/自主阶段、依赖、最少/最长/停止时间、收尾预留、必需检查、卡住恢复和有价值的安全续作。计划决策还支持 revise_plan、execution_slice、phase_result 与 needs_reasoning。已保存步骤可独立于源响应继续，新判断等待后续源轮次。完整合同和 Green-only 隔离 worktree 见持续工作指南。")}</p>
        <p>{tr("Choose source explicitly, define the success criteria and allow only the needed tools. The adaptive action set contains six file/command tools; process tracking is performed by the scheduler. It does not include arbitrary MCP tools, browser actions or cloud merges.", "明确选择 source、定义成功标准并只允许必要工具。自主动作集合包含六种文件或命令工具，进程跟踪由调度器负责；不包含任意 MCP 工具、浏览器动作或云端合并。")}</p>
        <Code>{JSON.stringify({ name: "Fix failing tests", device_id: "<device-id>", controller: "source", objective: "Fix the failing tests in this checkout", success_criteria: "Focused tests and full verification pass; record the changes", workspace: "/your/workspace", verify_command: "pnpm test", allowed_tools: ["list_directory", "read_file", "get_file_info", "edit_block", "start_process"], max_iterations: 80, keep_awake: false }, null, 2)}</Code>
        <ol><li>{tr("Create the goal and retain its automation_id. Source continuation must be enabled on the device.", "创建目标并保存 automation_id；设备必须开启源续接。")}</li><li>{tr("Read get_goal_context, including revision, whether a decision can be submitted, latest observation and journal sequence.", "读取 get_goal_context 的 revision、是否可提交、最新观察和日志序号。")}</li><li>{tr("Submit one tool, complete or pause decision using expected_revision and a stable idempotency_key. Reuse the exact key and payload on a transport retry; re-read context after a revision conflict.", "通过 expected_revision 和稳定 idempotency_key 提交一项 tool、complete 或 pause 决策。传输重试使用相同 Key 和 Payload；版本冲突后重新读取上下文。")}</li><li>{tr("Wait for the scheduler's observation, then continue. A complete decision needs evidence; configured verification must pass. Use manage_automation for pause, resume or cancel.", "等待调度器返回观察后继续。complete 决策需要证据，配置后的验证必须通过。manage_automation 用于暂停、恢复或取消。")}</li></ol>
        <p>{tr("The contract can also include a future ISO timestamp, a recurring interval and expiry. A new chat may read saved context, but only the authorized source client may submit decisions for an MCP-created source goal. A stopped host does not silently become a hosted goal.", "合同还可包含未来 ISO 时间、周期间隔与到期时间。新聊天可以读取保存的上下文，但 MCP 创建的源目标只接受已绑定源客户端的决策。宿主停止时不会静默改成托管目标。")}</p>
        <a href="/docs/long-running-work">{tr("Recovery, schedules and acceptance", "恢复、定时与验收详情")} →</a>
      </section>
      <section id="mcp-events"><h2>{tr("Signed task events are conditional", "签名任务事件需要满足部署条件")}</h2>
        <p>{tr("When safely configured, the endpoint advertises server/discover, events/list, events/subscribe and events/unsubscribe for automation.updated. Events contain task revision and brief change metadata; the host reads full context through authorized tools. Subscription and delivery are tied to the account and OAuth client.", "完成安全配置后，端点通过 server/discover、events/list、events/subscribe 和 events/unsubscribe 提供 automation.updated。事件包含任务版本和简短变化元数据，宿主通过授权工具读取完整上下文；订阅和投递绑定账户与 OAuth 客户端。")}</p>
        <p>{tr("The deployment needs MCP_EVENT_ENCRYPTION_KEY and a secure MCP_EVENT_EGRESS service binding. Without both, events are not advertised. Callbacks are verified, signed and retried with bounded attempts. There is no historical event replay; task context and the journal remain the recovery source. Actual Chat continuation is a separate acceptance test.", "部署需要 MCP_EVENT_ENCRYPTION_KEY 和安全 MCP_EVENT_EGRESS 服务绑定，缺少任一项便不会声明事件能力。回调经过验证、签名并有界重试；当前不提供历史事件重放，恢复依据是任务上下文与日志。真实 Chat 续接仍需独立验收。")}</p>
        <a href="https://developers.openai.com/plugins/build/mcp-events" target="_blank" rel="noreferrer">{tr("Official MCP Events reference", "官方 MCP Events 参考")} ↗</a>
      </section>
      <section id="chrome-browser"><h2>{tr("Install the scoped Chrome companion", "安装受控 Chrome Companion")}</h2>
        <p>{tr("Download and unzip the extension. In chrome://extensions, enable Developer mode, choose Load unpacked and select the extracted directory. Link it to the local agent, then explicitly share a tab. This beta is distributed as an unpacked extension, not through the Chrome Web Store.", "下载并解压扩展。在 chrome://extensions 开启 Developer mode，选择 Load unpacked 并选中解压目录。连接本地 Agent 后明确共享标签页。此 Beta 通过未打包扩展分发，未上架 Chrome Web Store。")}</p>
        <p><a href="/downloads/remote-arc-browser.zip" download>{tr("Download Chrome companion (.zip)", "下载 Chrome Companion (.zip)")} ↓</a></p>
        <p>{tr("Use browser_list_tabs to select tab_id when several tabs are shared. browser_read_page returns a snapshotId plus stable refs for that snapshot. browser_click and browser_fill require both that snapshot and an explicit per-tab Click & fill grant; a click invalidates the snapshot and the page must be read again.", "同时共享多个标签页时，用 browser_list_tabs 选择 tab_id。browser_read_page 会返回 snapshotId 和当前快照内的元素 ref；browser_click 与 browser_fill 只有在该标签页明确开启 Click & fill 后才能使用。每次点击都会使当前快照失效，下一次交互前必须重新读取页面。")}</p>
      </section>
      <footer className="articleEndLinks"><a href="/docs">{tr("Product documentation", "产品文档")} →</a><a href="/security-model">{tr("Security model", "安全模型")} →</a></footer>
    </article></div>
  </main>;
}
