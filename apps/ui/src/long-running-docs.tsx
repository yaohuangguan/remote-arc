import React from "react";
import { useI18n } from "./i18n.js";
import { TaskAvailability } from "./product-docs.js";

export function LongRunningWorkDocs() {
  const { tr } = useI18n();
  const modes = [
    [tr("Goal task", "目标任务"), tr("Plan, act, inspect and revise until the outcome is verified or a bound stops the run.", "规划、执行、检查并调整，直到验证目标或触及停止边界。"), tr("Development, investigation, hours of work and overnight goals.", "开发、排查、持续数小时与隔夜目标。")],
    [tr("Command automation", "命令自动化"), tr("Run explicit saved shell code or an approved cloud action.", "执行明确保存的 shell 代码或已批准的云端操作。"), tr("Known scripts, tests and repeatable operations.", "已知脚本、测试与可重复操作。")],
  ];
  return (
    <main className="technicalDoc productDocs">
      <header className="articleHeader">
        <span className="eyebrow">{tr("DOCUMENTATION · LONG-RUNNING WORK", "文档 · 持续工作")}</span>
        <h1>{tr("Long-running, overnight and scheduled work", "长任务、过夜任务与定时任务")}</h1>
        <p>{tr("Give your agent a clear objective and a way to prove completion. Remote Arc preserves execution and progress while the agent works on your computer, even when you are away.", "给 Agent 一个明确目标和可验证的完成标准。你离开后，Remote Arc 仍保存任务与执行进度，让 Agent 在你的电脑上持续推进工作。")}</p>
        <div className="articleMetaLinks">
          <a href="/docs">{tr("All documentation", "全部文档")} →</a>
          <a href="/security-model">{tr("Security model", "安全模型")} →</a>
          <a href="https://github.com/yaohuangguan/remote-arc/blob/master/docs/chat-first-planned-goals.md" target="_blank" rel="noreferrer">{tr("Engineering reference", "系统技术参考")} ↗</a>
        </div>
      </header>
      <TaskAvailability />
      <div className="technicalDocLayout">
        <aside className="articleToc">
          <strong>{tr("CONTENTS", "目录")}</strong>
          {[
            ["overview", tr("What continues", "什么会持续运行")],
            ["modes", tr("Goal and execution", "目标与执行")],
            ["dashboard", tr("Creating from Dashboard", "从 Dashboard 创建")],
            ["permissions", tr("Device task settings", "设备任务设置")],
            ["agent", tr("Who keeps reasoning", "谁继续判断下一步")],
            ["prepare", tr("Prepare an overnight goal", "准备过夜目标")],
            ["plan", tr("Phases, quality and chat handoff", "阶段、质量与聊天续接")],
            ["schedule", tr("Scheduled goals", "定时目标")],
            ["recovery", tr("Interruptions and recovery", "中断与恢复")],
            ["status", tr("States and limits", "状态与限制")],
            ["evidence", tr("Completion and evidence", "完成与证据")],
            ["data", tr("Task data", "任务数据")],
            ["availability", tr("Availability", "可用状态")],
          ].map(([id, title]) => <a key={id} href={"#work-" + id}>{title}</a>)}
        </aside>
        <article className="technicalArticle">
          <section id="work-overview">
            <h2>{tr("One goal, many decisions", "一个目标，多轮推进")}</h2>
            <p>{tr("Keep using your AI chat. Reading a file or running an ordinary command is a tool call, not a persistent task. When you ask for ongoing, overnight or scheduled work, the AI can create and manage a task under your existing permissions. You do not need to open Dashboard for every operation; use it to inspect progress, pause work or change device permissions.", "继续从 AI 聊天入口使用即可。读文件或执行普通命令是工具调用，不是持久任务。你要求持续、过夜或定时工作时，AI 可以在已有权限内创建和管理任务；不需要每次操作都打开 Dashboard。控制台主要用于看进度、暂停任务和管理设备权限。")}</p>
            <p><strong>Remote Arc Plus.</strong> {tr("Durable Tasks, overnight and long-running work, schedules, planned Agent Goals and supported keep-awake require a Plus account entitlement in addition to the normal OAuth and device permission checks.", "持久 Task、隔夜与长任务、定时任务、计划模式 Agent Goal 以及受支持的 keep-awake，除常规 OAuth 与设备权限检查外，还要求账户具备 Plus entitlement。")}</p>
            <p>{tr("The AI receives a task ID and a Dashboard link when it creates the work. Chat and Dashboard refer to the same saved task; the link opens its progress directly. A later chat turn uses that ID to read the checkpoint. You can also copy the task's chat reference from Dashboard. One chat may have several tasks: this is not an automatic binding to a private ChatGPT conversation ID.", "AI 创建工作后会得到任务 ID 和 Dashboard 链接。聊天与 Dashboard 对应同一条保存的任务，链接可直接打开它的进度；后续聊天用该 ID 读取检查点。也可从 Dashboard 复制任务的聊天引用。一段聊天可以有多个任务，这不等于自动绑定 ChatGPT 私有的对话 ID。")}</p>
            <p>{tr("A useful overnight task includes observation, action, checks and changes of strategy. Remote Arc stores the objective, permissions, progress and results. A continuing agent can use each new result to decide what to do next until the acceptance criteria are met or a real blocker appears.", "有效的过夜任务包含观察、操作、检查和策略调整。Remote Arc 保存目标、权限、进度与结果，持续运行的 Agent 根据每个新结果判断下一步，直到满足验收标准或遇到真正的阻塞。")}</p>
            <p>{tr("A long-running command can wait without a model thinking continuously. Adaptive work also needs a continuing reasoning controller. Connecting the Plugin enables access to tools; the AI host determines how and when reasoning continues.", "长时间运行的命令可以在模型没有持续推理时继续等待。需要动态调整的工作还需要持续推理控制器。连接 Plugin 提供工具访问，AI 宿主决定推理如何以及何时继续。")}</p>
          </section>
          <section id="work-modes">
            <h2>{tr("One goal with a plan and a time budget", "一个目标，包含计划与时间预算")}</h2>
            <div className="tableScroll"><table><thead><tr><th>{tr("Mode", "模式")}</th><th>{tr("Behavior", "行为")}</th><th>{tr("Useful for", "适合")}</th></tr></thead>
              <tbody>{modes.map(([mode, behavior, use]) => <tr key={mode}><td>{mode}</td><td>{behavior}</td><td>{use}</td></tr>)}</tbody></table></div>
            <p>{tr("Choose the start condition independently: now, a future time, a repeat interval or a matching event. Long-running and planned work are the same goal task. Supply verification whenever the outcome can be checked automatically.", "单独选择启动条件：现在、未来时间、重复间隔或匹配事件。长任务与计划工作属于同一个目标任务，能自动检查成果时应提供验收。")}</p>
          </section>
          <section id="work-dashboard">
            <h2>{tr("Creating a task without a chat", "不经过聊天，直接创建任务")}</h2>
            <p>{tr("Dashboard → Tasks → Create manually saves the instructions in that form. You do not need to repeat those instructions in a chat. Remote Arc does not read a ChatGPT conversation or automatically open one.", "Dashboard → 任务 → 手动创建会保存表单里的指令，无需在聊天中重复交代。Remote Arc 不会读取 ChatGPT 对话，也不会自动开启聊天。")}</p>
            <div className="tableScroll"><table><thead><tr><th>{tr("What you create", "创建内容")}</th><th>{tr("What happens next", "接下来会发生什么")}</th></tr></thead><tbody>
              <tr><td>{tr("Goal · hosted AI", "目标 · 托管 AI")}</td><td>{tr("A configured model can plan and execute after you leave. If no model is configured, creation is blocked rather than silently switching executors.", "已配置模型可在你离开后规划和执行。未配置模型时阻止创建，不会悄悄更换执行器。")}</td></tr>
              <tr><td>{tr("Goal · connected AI", "目标 · 已连接 AI")}</td><td>{tr("Without a decision or approved command slice, it visibly awaits that client. Copying the reference enables an authorized client to read context; it does not wake an idle chat.", "没有决策或已批准命令步骤时，明确等待该客户端。复制引用让已授权客户端读取上下文，不会唤起空闲聊天。")}</td></tr>
              <tr><td>{tr("Command automation", "命令自动化")}</td><td>{tr("Runs executable shell instructions exactly as entered inside the approved working directory. A sentence asking for a summary belongs in a goal, not a command field.", "在已批准工作目录中原样运行 shell 指令。要求总结的一句话应填写为目标，而不是命令。")}</td></tr>
              <tr><td>{tr("Start condition", "启动条件")}</td><td>{tr("Eligible now, at the selected time, after an interval, or after the secret event webhook matches. The trigger does not supply an AI executor.", "现在、指定时间、间隔结束或秘密 Webhook 匹配后进入待执行。触发条件本身不会提供 AI 执行器。")}</td></tr>
            </tbody></table></div>
            <p>{tr("Saving is not running. The task list shows actual run starts, execution state and scheduler health; details show saved instructions, observations, results and evidence. A copied reference retrieves cloud task state, not the original chat or a local checkpoint file. The client needs matching task tools and OAuth permissions.", "保存不等于执行。列表显示真实启动次数、执行状态和调度健康；详情显示保存的指令、观察、结果与证据。复制引用读取云端任务状态，不是原聊天或本地检查点文件；客户端需要匹配的任务工具和 OAuth 权限。")}</p>
            <p>{tr("Closing Dashboard does not cancel a task. An offline device waits for reconnection; there is no remote power-on. Keep-awake only prevents a supported, online computer from sleeping when enabled and authorized.", "关闭 Dashboard 不会取消任务。离线设备等待重连，无法远程开机。保持唤醒只在受支持的在线电脑上获准开启后阻止睡眠。")}</p>
          </section>
          <section id="work-permissions">
            <h2>{tr("Control task capabilities per computer", "按电脑控制任务能力")}</h2>
            <p>{tr("Open Dashboard → Devices → Manage → Background & tasks. Each computer has separate switches for background tasks, scheduled tasks, adaptive goals, source-agent continuation and permission to stay awake during a task. OAuth access and the computer's tool/path permissions must also allow the work.", "打开 Dashboard → 设备 → 管理 → 后台与任务。每台电脑分别控制后台任务、定时任务、自主目标任务、源 Agent 续接，以及允许任务期间保持唤醒。OAuth 授权和电脑的工具、路径权限也必须允许这项工作。")}</p>
            <p>{tr("Turning off a permission stops affected tasks. It does not undo changes already made. Existing authorized task behavior is retained for older device settings; source-agent continuation and task keep-awake require explicit opt-in.", "关闭权限会停止受影响的任务，已经产生的修改不会因此自动撤销。旧设备设置保留之前已授权的任务行为；源 Agent 续接和任务保持唤醒需要明确开启。")}</p>
          </section>
          <section id="work-agent">
            <h2>{tr("Choose the reasoning controller", "选择推理控制器")}</h2>
            <p>{tr("Source mode keeps reasoning in your current AI conversation. Normal Chat can save a plan, authorize bounded command slices and resume from get_goal_context on a later turn. If the turn disappears, those saved deterministic steps continue; new judgment waits in needs_reasoning. Automatic source wakeup needs real host support and is not assumed. Work, Codex and other hosts use the same capability-based protocol.", "源模式让推理留在你当前的 AI 对话。普通 Chat 可以保存计划、授权有界命令步骤，并在后续轮次通过 get_goal_context 续接。轮次消失后，已保存的确定性步骤继续，新判断等待在 needs_reasoning。自动唤醒需要真实宿主支持，不能预先假定。Work、Codex 与其他宿主使用同一套按能力建模的协议。")}</p>
            <p>{tr("Hosted planner is a separate option: the configured Remote Arc planner selects actions after the creating chat ends. Its model may differ from your chat model. Remote Arc does not silently change controllers if your source agent stops.", "托管 Planner 是独立选项：由 Remote Arc 配置的 Planner 在创建对话结束后继续选择动作，它的模型可能与聊天模型不同。源 Agent 停止时，Remote Arc 不会悄悄替换控制器。")}</p>
            <p>{tr("Codex /plan prepares an approach; /goal continues toward a verifiable objective across turns. Host documentation describes multi-hour work, rather than a fixed twenty-hour guarantee.", "Codex 的 /plan 用于准备方案，/goal 用于跨轮次推进可验证目标。宿主文档描述的是多小时工作能力，并非固定二十小时的保证。")} <a href="https://learn.chatgpt.com/use-cases/follow-goals" target="_blank" rel="noreferrer">{tr("Goal mode reference", "目标模式参考")} ↗</a></p>
          </section>
          <section id="work-prepare">
            <h2>{tr("Prepare an overnight goal", "准备一个过夜目标")}</h2>
            <ol>
              <li>{tr("Tell your AI chat the deliverable, acceptance checks and deadline. The AI can save these as a task without a Dashboard form.", "在 AI 聊天中说明交付物、验收检查和期限。AI 可以把这些保存为任务，无需到 Dashboard 填表。")}</li>
              <li>{tr("Choose the target computer, workspace and required tools; enable the corresponding device task permissions.", "选择目标电脑、工作区和所需工具，开启对应的设备任务权限。")}</li>
              <li>{tr("Select a controller that can continue while you are away, and set an iteration budget and deadline.", "选择能够在你离开后继续工作的控制器，设置迭代预算与期限。")}</li>
              <li>{tr("Keep the computer powered, connected and logged in. Update the local agent if task keep-awake is unavailable; opt in for this task when needed.", "保持电脑供电、联网和登录；任务唤醒能力不可用时更新本地 Agent，按需为本任务开启。")}</li>
              <li>{tr("Review the saved goal, then let the agent inspect, act and verify. Check the result and evidence when you return.", "确认保存的目标，让 Agent 检查、操作与验收；回来后阅读结果和证据。")}</li>
            </ol>
            <div className="articleCallout"><strong>{tr("Example goal", "目标示例")}</strong><p>{tr("Fix the failing tests in this repository. Stay within the selected workspace, inspect failures before editing, run the focused tests after each change, and complete only after the full verification command passes. Record changes and any blocker. Stop at the configured deadline.", "修复这个仓库中的失败测试。限定在所选工作区内，修改前检查失败原因，每次修改后运行相关测试，完整验收命令通过后才完成。记录修改和阻塞，到配置的期限停止。")}</p></div>
          </section>
          <section id="work-plan">
            <h2>{tr("Phases, quality and a durable chat handoff", "阶段、质量与持久聊天续接")}</h2>
            <p>{tr("New Dashboard goals always save a bounded plan; the default lets the executor plan from the objective. Optional custom settings supply fixed phases or guided priorities. Fixed mode follows provided phases; guided mode uses priorities; autonomous mode asks the selected controller to inspect and propose a bounded plan. Phases have objectives, success criteria, dependencies and optional verification or deterministic execution slices. Completed prerequisites gate downstream work. Partial or blocked work is recorded while independent authorized phases can continue.", "新建 Dashboard 目标始终保存有界计划，默认让执行器根据目标自主规划。可选自定义设置提供固定阶段或引导优先级。固定模式遵循提供的阶段，引导模式按优先级规划，自主模式由所选控制器检查状态并提出有界计划。阶段包含目标、成功标准、依赖，以及可选验证或确定性执行步骤。下游要求前置阶段完成；部分完成或阻塞会记录，独立的已授权阶段可以继续。")}</p>
            <p>{tr("Minimum time means useful work, never filler edits. Maximum time and an ISO stop-at time bound the run; the earliest limit applies. Finalization reserve closes risky new work and allows process settlement, final checks and a saved report. Phase limits yield partial outcomes. Known incomplete dependencies are never advanced just because a timer expired.", "最少时间指有用工作，不要求凑数修改。最长时间和带时区偏移的 ISO 停止时间限制运行，以最早限制为准。预留收尾时间停止风险较大的新工作，用于处理进程、最终检查和保存报告。阶段超时记录为部分完成，不能因计时结束而推进尚未满足的依赖。")}</p>
            <div className="articleCallout"><strong>{tr("Green-only quality", "只接受通过检查的版本")}</strong><p>{tr("Configure required test, typecheck, build, benchmark or invariant commands. Requires updated remotelink and a clean Git repository root. Remote Arc creates a task-owned detached worktree, checks its baseline and evaluates candidates before promoting an accepted checkpoint. The checked tree must stay unchanged through validation. A rejected attempt stays in its old worktree; recovery creates a new candidate from the accepted frontier. Your original branch and existing files are not reset. Accepted work needs review before application to that branch.", "可配置必需的测试、类型、构建、基准或不变量检查。需要新版 remotelink 和干净的 Git 仓库根目录。Remote Arc 创建任务拥有的独立 worktree，检查基线，候选通过验收后才推进已接受版本。验证期间被检查的代码树必须保持一致。失败尝试保留在旧 worktree，恢复时从已验收版本创建新候选，不重置原分支和已有文件。将成果应用到原分支前仍需审查。")}</p></div>
            <p>{tr("Repeated equivalent failures and turns without material progress trigger replanning or parking. Optional highest-value continuation requires justified candidates with value, risk, effort, confidence and a way to verify; oversized work is rejected. No safe useful work means waiting for reasoning or safely finalizing. Plan facts survive phase changes while detailed phase memory resets; private chain of thought is never stored.", "等价失败重复出现、轮次缺乏实质进展时，会重新规划或搁置。可选的高价值续作要求候选给出价值、风险、工作量、信心与验证方式，超出剩余安全时间的工作不接受。没有安全有用工作时等待判断或安全收尾。计划事实跨阶段保留，阶段详细记忆重置，不保存私有思维过程。")}</p>
            <p>{tr("The next source turn reads the saved plan, phase, elapsed/remaining time, frontier, candidate, quality results, observations, blockers and bounded journal. It submits a revision and idempotency key. A source timeout does not erase the goal and never silently selects another model. Final reports separate accepted work, rejected attempts, partial work, blockers, untouched phases and unavailable checks. A finalized task is not a claim that every objective passed.", "下一轮源对话读取保存的计划、阶段、已用与剩余时间、已验收版本、候选、质量结果、观察、阻塞和有界日志，再使用 revision 和幂等 key 提交。源轮次超时不删除目标，也不会悄悄选择另一模型。最终报告区分已接受成果、失败尝试、部分完成、阻塞、未处理阶段与未执行检查。任务收尾不等于每个目标都已通过。")}</p>
          </section>
          <section id="work-schedule">
            <h2>{tr("Schedule the same goal loop", "定时启动同一目标循环")}</h2>
            <p>{tr("Goal tasks can start immediately, at a future timestamp, after a recurring interval or after a matching webhook. Each recurring run starts with fresh progress and its own iteration budget. Runs of the same task do not overlap. The interval is measured from the previous run's completion.", "目标任务可以立即启动、在未来时间启动、按间隔重复，或由匹配 Webhook 触发。每轮周期任务从新的进度开始，使用独立迭代预算；同一个任务不重叠运行，间隔从上一轮完成时计算。")}</p>
            <p>{tr("The computer must be available when work starts. Calendar cron, timezone/DST rules, missed-run catch-up and powering on a computer are not provided by these interval schedules.", "开始工作时电脑必须可用。当前间隔调度不提供日历 Cron、时区与夏令时规则、错过任务补跑或自动开机。")}</p>
          </section>
          <section id="work-recovery">
            <h2>{tr("Continue from saved progress", "从保存的进度继续")}</h2>
            <p>{tr("A temporary device disconnect waits for reconnection. Transient planner errors get bounded retries. A new conversation can read the saved goal, factual memory, latest result and ordered journal. An uncertain action outcome is reported for inspection before another action is chosen.", "设备暂时断线时等待重连，Planner 的临时错误有界重试。新对话可以读取保存的目标、事实记忆、最新结果和有序日志。操作结果不确定时先说明情况、检查现状，再选择下一步。")}</p>
            <div className="docsTableWrap"><table className="articleTable"><thead><tr><th>{tr("Interruption", "中断")}</th><th>{tr("Recovery", "恢复")}</th></tr></thead><tbody>
              <tr><td>{tr("Chat ends", "聊天结束")}</td><td>{tr("Fixed saved tasks continue. Adaptive source tasks still need the host to submit further decisions; hosted tasks use the selected configured planner.", "固定持久任务可以继续；自适应源任务仍需要宿主提交后续决策，托管任务则使用已选择配置的 Planner。")}</td></tr>
              <tr><td>{tr("Device disconnects", "设备断线")}</td><td>{tr("The task waits for reconnection. Saved progress remains; no new local action runs while offline.", "任务等待重连，保存进度仍在，离线时不执行新的本机动作。")}</td></tr>
              <tr><td>{tr("Local agent or machine restarts", "本地 Agent 或机器重启")}</td><td>{tr("The task remains in D1. After the OS/user session and agent return, a lost acknowledged process handle follows restart/fail for fixed work, or inspection for an Agent Goal. The old PID and local capture are not restored.", "任务仍保存在 D1。OS 用户会话和 Agent 恢复后，已确认但丢失的进程句柄按固定任务 restart/fail 或 Agent Goal 重新检查处理；不恢复旧 PID 和本地捕获。")}</td></tr>
              <tr><td>{tr("Relay worker is replaced", "Relay Worker 被替换")}</td><td>{tr("Persistent leases and revisions fence stale writes. A later scheduler turn reads the saved state. Unknown dispatch effects are inspected rather than blindly replayed.", "持久租约和版本阻止旧写回，后续调度轮次读取保存状态。未知派发副作用先检查，不盲目重放。")}</td></tr>
            </tbody></table></div>
            <p>{tr("restart means a new command attempt, not resuming the same OS process. Use fail for a fixed command that cannot safely run twice, and inspect the real state after an uncertain outcome. Permanent daemons still belong under an OS service manager; durable Tasks solve the lifecycle of approved work.", "restart 指新的命令尝试，不是继续同一个 OS 进程。不能安全重复的固定命令应选择 fail，结果不确定时检查真实状态。常驻守护进程仍应使用 OS 服务管理器，持久 Task 解决的是已批准工作的生命周期。")}</p>
            <p>{tr("Use Pause to suspend further work and Cancel to stop the task. Cancellation attempts to stop its managed process. Changing file/tool safety policy stops old tasks rather than granting them new authority. No system can automatically undo every shell or external action.", "Pause 暂停后续工作，Cancel 停止任务并尝试停止受管进程。修改文件或工具安全策略会停止旧任务，不会给它们扩大权限。系统无法自动撤销所有命令或外部操作。")}</p>
          </section>
          <section id="work-status">
            <h2>{tr("Read the state and respect the limits", "理解状态与停止限制")}</h2>
            <div className="docsTableWrap"><table className="articleTable"><thead><tr><th>{tr("State", "状态")}</th><th>{tr("Meaning", "含义")}</th></tr></thead><tbody>
              <tr><td>waiting / running</td><td>{tr("Waiting for its start or next turn, or executing work.", "等待开始或下一轮，或正在执行。")}</td></tr>
              <tr><td>waiting_for_device</td><td>{tr("Execution needs the offline computer to reconnect.", "执行需要离线电脑重新连接。")}</td></tr>
              <tr><td>waiting_for_event</td><td>{tr("Waiting for a condition, or awaiting a source decision. Read the phase; awaiting_agent means the AI must continue.", "等待条件或源决策。查看 phase，awaiting_agent 表示需要 AI 继续。")}</td></tr>
              <tr><td>paused / cancelled</td><td>{tr("Further task work is suspended or stopped. Prior effects are not automatically undone.", "后续任务工作已暂停或停止，此前副作用不会自动撤销。")}</td></tr>
              <tr><td>completed / failed / expired</td><td>{tr("A run/goal finished, could not finish, or reached its deadline. Check evidence and run history; a recurring task can wait for its next run.", "一轮或目标完成、无法完成，或到达期限。检查证据与运行历史，周期任务可等待下一轮。")}</td></tr>
            </tbody></table></div>
            <p>{tr("max_iterations limits planning turns, not hours or tokens. The current Agent Goal limit is 1–2000 turns, with a legacy MCP default of 30 and a new Dashboard default of 720. New Dashboard goals also save a finite per-run time budget (24 hours by default). Task expiry, run limits and host/provider quotas also apply. Reaching a budget or deadline is a stopping outcome, not success. A one-minute scheduler advances due work; schedules are not exact-second timers.", "max_iterations 限制规划轮数，不是小时或 Token。当前 Agent Goal 范围为 1–2000 轮，旧 MCP 默认 30 轮，新 Dashboard 默认 720 轮。新 Dashboard 目标同时保存有限的单次时间预算（默认 24 小时）；任务期限、运行次数和宿主或服务额度也适用。触及预算或期限是停止结果，不是成功。每分钟调度器推进到期工作，调度不是精确到秒的计时器。")}</p>
          </section>
          <section id="work-evidence">
            <h2>{tr("Read completion evidence", "阅读完成证据")}</h2>
            <p>{tr("A configured verification command must pass before the goal completes. If it fails, the result goes back to the controller for a revised plan. Without a verifier, completion is the controller's evidence-backed assessment rather than independent verification.", "已配置的验收命令必须通过，目标才会完成。验收失败会把结果交回控制器调整方案。没有验收命令时，完成状态来自控制器依据证据作出的判断，不能等同于独立验证。")}</p>
            <p>{tr("Read the status, attempts, last observation, completion evidence and progress journal. A notification that an event was received does not itself mean the goal succeeded. Real blockers, budget exhaustion and expiry are reported as their own outcomes.", "阅读状态、运行次数、最后观察、完成证据和进度日志。收到事件通知本身不代表目标已成功；真正的阻塞、预算耗尽和到期会以各自的结果显示。")}</p>
          </section>
          <section id="work-data">
            <h2>{tr("Understand persisted task data", "了解持久化的任务数据")}</h2>
            <p>{tr("Durable goals save their contract, factual memory, bounded tool/process observations, decision summaries and progress metadata in the control plane. These observations may include file contents or command output. Pending source decisions may temporarily contain edit content; their bodies are cleared after consumption.", "持久目标将合同、事实记忆、受限工具或进程观察、决策摘要和进度元数据保存到控制面。观察可能包含文件内容或命令输出；待消费的源决策可能临时包含编辑内容，消费后清除正文。")}</p>
            <p>{tr("Observations are sent to the selected hosted planner or returned to the authorized source agent. Local full process output and Undo snapshots remain subject to the execution core's retention. Choose tasks and access boundaries accordingly.", "观察会发给所选托管 Planner，或返回已授权的源 Agent。本地完整进程输出和 Undo 快照遵循执行核心的保留规则，应据此选择任务与访问范围。")}</p>
          </section>
          <section id="work-availability">
            <h2>{tr("Availability and validation", "可用状态与验证")}</h2>
            <div className="articleCallout"><p>{tr("This guide describes the current task execution contract. Source-agent continuation and signed events require the matching relay, device settings and host support. Safe event delivery must be configured by the deployment operator. Real Chat/Work overnight acceptance is a separate release check; preview and mocked tests do not prove it.", "本文描述当前任务执行合同。源 Agent 续接和签名事件需要匹配的 Relay、设备设置及宿主支持，安全事件投递由部署方配置。真实 Chat/Work 过夜验收是独立发布检查，预览和模拟测试不能证明已经通过。")}</p></div>
            <p>{tr("Keeping a device awake uses a temporary system request. Power loss, forced sleep, lid policy, network failure and unavailable OS services can still interrupt work. Login background connection alone does not prevent sleep.", "保持唤醒使用临时系统请求。断电、强制休眠、关盖策略、断网及不可用的系统服务仍可能中断工作；登录后台连接本身不能防止休眠。")}</p>
          </section>
        </article>
      </div>
    </main>
  );
}
