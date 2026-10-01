import React from "react";
import { useI18n } from "./i18n.js";

export function LongRunningWorkDocs() {
  const { tr } = useI18n();
  const modes = [
    ["Long Task", tr("Track an approved command until it exits.", "跟踪已批准的命令直到退出。"), tr("Builds, exports, lengthy scripts.", "构建、导出、长时间脚本。")],
    ["Condition Watch", tr("Start a fixed plan when a matching event arrives.", "收到匹配事件后启动固定计划。"), tr("Respond to a webhook or CI result.", "响应 Webhook 或 CI 结果。")],
    ["Schedule Watch", tr("Start a fixed plan at a future time or recurring interval.", "在未来时间或周期性间隔启动固定计划。"), tr("Repeatable maintenance and checks.", "可重复的维护与检查。")],
    ["Goal Loop", tr("Repeat the same plan and verification until the check passes.", "重复同一计划与验收，直到检查通过。"), tr("Known recovery recipes.", "步骤已知的恢复流程。")],
    ["Agent Goal", tr("Inspect results, choose the next action, revise and verify.", "检查结果、选择下一步、调整方案并验收。"), tr("Coding, investigation and tasks whose next step depends on the result.", "开发、排查以及下一步取决于结果的工作。")],
  ];
  return (
    <main className="technicalDoc">
      <header className="articleHeader">
        <span className="eyebrow">{tr("DOCUMENTATION · LONG-RUNNING WORK", "文档 · 持续工作")}</span>
        <h1>{tr("Long-running, overnight and scheduled work", "长任务、过夜任务与定时任务")}</h1>
        <p>{tr("Give your agent a clear objective and a way to prove completion. Remote Arc preserves execution and progress while the agent works on your computer, even when you are away.", "给 Agent 一个明确目标和可验证的完成标准。你离开后，Remote Arc 仍保存任务与执行进度，让 Agent 在你的电脑上持续推进工作。")}</p>
        <div className="articleMetaLinks">
          <a href="/docs">{tr("All documentation", "全部文档")} →</a>
          <a href="/security-model">{tr("Security model", "安全模型")} →</a>
          <a href="https://github.com/yaohuangguan/remote-arc/blob/feat/goal-continuation/docs/system-architecture.md" target="_blank" rel="noreferrer">{tr("Engineering reference", "系统技术参考")} ↗</a>
        </div>
      </header>
      <div className="technicalDocLayout">
        <aside className="articleToc">
          <strong>{tr("CONTENTS", "目录")}</strong>
          {[
            ["overview", tr("What continues", "什么会持续运行")],
            ["modes", tr("Choose a task mode", "选择任务模式")],
            ["permissions", tr("Device task settings", "设备任务设置")],
            ["agent", tr("Who keeps reasoning", "谁继续判断下一步")],
            ["prepare", tr("Prepare an overnight goal", "准备过夜目标")],
            ["schedule", tr("Scheduled goals", "定时目标")],
            ["recovery", tr("Interruptions and recovery", "中断与恢复")],
            ["evidence", tr("Completion and evidence", "完成与证据")],
            ["data", tr("Task data", "任务数据")],
            ["availability", tr("Availability", "可用状态")],
          ].map(([id, title]) => <a key={id} href={"#work-" + id}>{title}</a>)}
        </aside>
        <article className="technicalArticle">
          <section id="work-overview">
            <h2>{tr("One goal, many decisions", "一个目标，多轮推进")}</h2>
            <p>{tr("Keep using your AI chat. Reading a file or running an ordinary command is a tool call, not a persistent task. When you ask for ongoing, overnight or scheduled work, the AI can create and manage a task under your existing permissions. You do not need to open Dashboard for every operation; use it to inspect progress, pause work or change device permissions.", "继续从 AI 聊天入口使用即可。读文件或执行普通命令是工具调用，不是持久任务。你要求持续、过夜或定时工作时，AI 可以在已有权限内创建和管理任务；不需要每次操作都打开 Dashboard。控制台主要用于看进度、暂停任务和管理设备权限。")}</p>
            <p>{tr("A useful overnight task includes observation, action, checks and changes of strategy. Remote Arc stores the objective, permissions, progress and results. A continuing agent can use each new result to decide what to do next until the acceptance criteria are met or a real blocker appears.", "有效的过夜任务包含观察、操作、检查和策略调整。Remote Arc 保存目标、权限、进度与结果，持续运行的 Agent 根据每个新结果判断下一步，直到满足验收标准或遇到真正的阻塞。")}</p>
            <p>{tr("A long-running command can wait without a model thinking continuously. Adaptive work also needs a continuing reasoning controller. Connecting the Plugin enables access to tools; the AI host determines how and when reasoning continues.", "长时间运行的命令可以在模型没有持续推理时继续等待。需要动态调整的工作还需要持续推理控制器。连接 Plugin 提供工具访问，AI 宿主决定推理如何以及何时继续。")}</p>
          </section>
          <section id="work-modes">
            <h2>{tr("How the AI chooses a task mode", "AI 如何选择任务模式")}</h2>
            <div className="tableScroll"><table><thead><tr><th>{tr("Mode", "模式")}</th><th>{tr("Behavior", "行为")}</th><th>{tr("Useful for", "适合")}</th></tr></thead>
              <tbody>{modes.map(([mode, behavior, use]) => <tr key={mode}><td>{mode}</td><td>{behavior}</td><td>{use}</td></tr>)}</tbody></table></div>
            <p>{tr("One computer can support several modes. Choose Agent Goal when failures or discoveries may require a different next step. Supply a verification command whenever completion can be checked automatically.", "一台电脑可以支持多种模式。如果失败或新发现可能改变下一步，选择 Agent Goal；完成结果能够自动检查时，应提供验收命令。")}</p>
          </section>
          <section id="work-permissions">
            <h2>{tr("Control task capabilities per computer", "按电脑控制任务能力")}</h2>
            <p>{tr("Open Dashboard → Devices → Task permissions. Each computer has separate switches for background tasks, scheduled tasks, adaptive goals, source-agent continuation and permission to stay awake during a task. OAuth access and the computer's tool/path permissions must also allow the work.", "打开 Dashboard → Devices → 任务权限。每台电脑分别控制后台任务、定时任务、自主目标任务、源 Agent 续接，以及允许任务期间保持唤醒。OAuth 授权和电脑的工具、路径权限也必须允许这项工作。")}</p>
            <p>{tr("Turning off a permission stops affected tasks. It does not undo changes already made. Existing authorized task behavior is retained for older device settings; source-agent continuation and task keep-awake require explicit opt-in.", "关闭权限会停止受影响的任务，已经产生的修改不会因此自动撤销。旧设备设置保留之前已授权的任务行为；源 Agent 续接和任务保持唤醒需要明确开启。")}</p>
          </section>
          <section id="work-agent">
            <h2>{tr("Choose the reasoning controller", "选择推理控制器")}</h2>
            <p>{tr("Source agent keeps decisions in the AI client you are using. Work or Codex can use a persistent goal runtime to keep reading progress and submitting the next action. Chat needs a working task-event subscription so new results can prompt further processing. The host's available features, quotas and autonomy limits still apply.", "源 Agent 模式由你正在使用的 AI 客户端继续判断。Work 或 Codex 可以通过持续目标运行环境读取进度并提交下一步；Chat 需要可用的任务事件订阅，让新结果触发后续处理。宿主的功能、额度和自主运行限制仍然适用。")}</p>
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
          <section id="work-schedule">
            <h2>{tr("Schedule the same goal loop", "定时启动同一目标循环")}</h2>
            <p>{tr("Agent Goals can start immediately, at a future timestamp or after a recurring interval. Each recurring run starts with fresh progress and its own iteration budget. Runs of the same task do not overlap. The interval is measured from the previous run's completion.", "Agent Goal 可以立即启动、在未来时间启动，或按间隔重复。每轮周期任务从新的进度开始，使用独立迭代预算；同一个任务不重叠运行，间隔从上一轮完成时计算。")}</p>
            <p>{tr("The computer must be available when work starts. Calendar cron, timezone/DST rules, missed-run catch-up and powering on a computer are not provided by these interval schedules.", "开始工作时电脑必须可用。当前间隔调度不提供日历 Cron、时区与夏令时规则、错过任务补跑或自动开机。")}</p>
          </section>
          <section id="work-recovery">
            <h2>{tr("Continue from saved progress", "从保存的进度继续")}</h2>
            <p>{tr("A temporary device disconnect waits for reconnection. Transient planner errors get bounded retries. A new conversation can read the saved goal, factual memory, latest result and ordered journal. An uncertain action outcome is reported for inspection before another action is chosen.", "设备暂时断线时等待重连，Planner 的临时错误有界重试。新对话可以读取保存的目标、事实记忆、最新结果和有序日志。操作结果不确定时先说明情况、检查现状，再选择下一步。")}</p>
            <p>{tr("Use Pause to suspend further work and Cancel to stop the task. Cancellation attempts to stop its managed process. Changing file/tool safety policy stops old tasks rather than granting them new authority. No system can automatically undo every shell or external action.", "Pause 暂停后续工作，Cancel 停止任务并尝试停止受管进程。修改文件或工具安全策略会停止旧任务，不会给它们扩大权限。系统无法自动撤销所有命令或外部操作。")}</p>
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
            <div className="articleCallout"><p>{tr("This guide describes the staged long-running-work implementation. Source-agent continuation and signed events require the matching relay, device settings and host support. Safe event delivery must be configured by the deployment operator. Real Chat/Work overnight acceptance is a separate release check; preview and mocked tests do not prove it.", "本文描述正在准备发布的持续工作实现。源 Agent 续接和签名事件需要匹配的 Relay、设备设置及宿主支持，安全事件投递由部署方配置。真实 Chat/Work 过夜验收是独立发布检查，预览和模拟测试不能证明已经通过。")}</p></div>
            <p>{tr("Keeping a device awake uses a temporary system request. Power loss, forced sleep, lid policy, network failure and unavailable OS services can still interrupt work. Login background connection alone does not prevent sleep.", "保持唤醒使用临时系统请求。断电、强制休眠、关盖策略、断网及不可用的系统服务仍可能中断工作；登录后台连接本身不能防止休眠。")}</p>
          </section>
        </article>
      </div>
    </main>
  );
}
