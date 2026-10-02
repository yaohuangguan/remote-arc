import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import "./landing-content.css";

export function HeroHeadline() {
  const { tr, locale } = useI18n();
  return <TypewriterHeadline key={locale} phrases={[tr("Build apps.", "构建应用。"), tr("Run tasks.", "执行任务。"), tr("Fix bugs.", "修复问题。"), tr("Analyze data.", "分析数据。")]} />;
}

function TypewriterHeadline({ phrases }: { phrases: [string, ...string[]] }) {
  const { tr } = useI18n();
  const [frame, setFrame] = useState({ index: 0, length: phrases[0].length, deleting: false });
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReducedMotion(motion.matches);
    const onVisibility = () => setVisible(!document.hidden);
    motion.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { motion.removeEventListener("change", onMotion); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);
  const phrase = phrases[frame.index] ?? phrases[0];
  useEffect(() => {
    if (reducedMotion || !visible) return;
    const delay = frame.deleting ? 48 : frame.length === phrase.length ? 2600 : 100;
    const timer = window.setTimeout(() => setFrame(previous => {
      if (previous.deleting) return previous.length === 0 ? { index: (previous.index + 1) % phrases.length, length: 0, deleting: false } : { ...previous, length: previous.length - 1 };
      return previous.length >= phrase.length ? { ...previous, deleting: true } : { ...previous, length: previous.length + 1 };
    }), delay);
    return () => window.clearTimeout(timer);
  }, [frame.deleting, frame.length, phrase.length, phrases.length, reducedMotion, visible]);
  return <div className="heroHeadlineGroup">
    <h1 className="heroHeadline"><span className="heroAccessible">{tr("Build apps, run tasks, fix bugs and analyze data on your own computer. Anywhere, anytime.", "让 AI 在自己的电脑上构建应用、执行任务、修复问题和分析数据。随时随地。")}</span><span aria-hidden="true"><span className="heroTypeLine">{reducedMotion ? phrase : phrase.slice(0, frame.length)}</span><span className="heroFixedLine"><span>{tr("Anywhere,", "随时，")}</span><span>{tr("Anytime.", "随地。")}</span></span></span></h1>
  </div>;
}

function ConnectionFilm() {
  const { tr, locale } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoplayAttempted = useRef(false);
  const [chapter, setChapter] = useState(0);
  const chapters = [
    { at: 0, title: tr("Choose your client", "选择 AI 客户端"), body: tr("Open the connection path for ChatGPT, Claude, Cursor or another Remote MCP client.", "打开 ChatGPT、Claude、Cursor 或其他 Remote MCP 客户端的连接入口。") },
    { at: 7, title: tr("Authorize in the client", "在客户端完成授权"), body: tr("The client opens Remote Arc OAuth. Review the scopes and authorize your account there.", "客户端会打开 Remote Arc OAuth，在那里核对 Scope 并授权账户。") },
    { at: 14, title: tr("Reuse your devices", "复用已配对设备"), body: tr("Ask in your AI chat. The same paired computers and their individual permissions apply.", "回到 AI 聊天提出请求，复用同一批已配对电脑和各自权限。") },
  ] as const;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => { if (motion.matches) video.pause(); };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (!entry.isIntersecting) video.pause();
      else if (!motion.matches && !autoplayAttempted.current) {
        autoplayAttempted.current = true;
        void video.play().catch(() => undefined);
      }
    }, { threshold: .45 });
    const onVisibility = () => { if (document.hidden) video.pause(); };
    observer.observe(video);
    motion.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { observer.disconnect(); motion.removeEventListener("change", onMotion); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);
  return <div className="connectionFilm">
    <div className="connectionFilmHeader"><span className="filmLiveMark" aria-hidden="true" /><strong>{tr("Inside Remote Arc", "Remote Arc 实际界面")}</strong><span>{tr("Product walkthrough", "产品流程演示")}</span></div>
    <video ref={videoRef} muted playsInline controls preload="metadata" poster="/demos/connect-workflow-poster.webp" aria-label={tr("Recorded Remote Arc interface walkthrough with example devices", "使用示例设备录制的 Remote Arc 实际界面流程演示")}
      onTimeUpdate={() => { const time = videoRef.current?.currentTime || 0; setChapter(time >= 14 ? 2 : time >= 7 ? 1 : 0); }}>
      <source src="/demos/connect-workflow.webm" type="video/webm" /><source src="/demos/connect-workflow.mp4" type="video/mp4" />
      <track kind="captions" src="/demos/connect-workflow-en.vtt" srcLang="en" label="English" default={locale === "en"} /><track kind="captions" src="/demos/connect-workflow-zh.vtt" srcLang="zh" label="中文" default={locale === "zh"} />
    </video>
    <div className="filmChapters" aria-label={tr("Video chapters", "视频章节")}>{chapters.map((item, index) => <button type="button" key={item.at} aria-pressed={chapter === index} onClick={() => { if (videoRef.current) videoRef.current.currentTime = item.at; setChapter(index); }}><span>{"0" + (index + 1)}</span>{item.title}</button>)}</div>
    <p className="filmDescription">{(chapters[chapter] ?? chapters[0]).body}</p>
    <p className="filmDisclosure">{tr("Recorded from the real product UI with example data. External client installation and OAuth are explained, not performed in this recording.", "录制自真实产品界面，使用示例数据。本片说明外部客户端安装与 OAuth 步骤，不执行真实授权。")}</p>
  </div>;
}

export function LandingContent() {
  const { tr } = useI18n();
  const [selected, setSelected] = useState(0);
  const [faqCategory, setFaqCategory] = useState(0);
  const scenarios = [
    { id: "code", label: tr("Fix a project", "修复项目"), request: tr("“On my workstation, find the failing test, fix the code and show me the verified diff.”", "“在我的工作站上找到失败测试、修复代码，给我看验证后的 diff。”"), result: tr("An actual change in your checkout, with test results you can inspect.", "真实仓库中的修改，以及可检查的测试结果。"), steps: [tr("Find the named computer and its permitted tools", "确认指定电脑与可用工具"), tr("Read the code and reproduce the failure", "读取代码、复现失败"), tr("Edit the affected files and rerun tests", "修改相关文件、重新测试"), tr("Return the diff, evidence and remaining issues", "返回 diff、证据与未解决问题")], tools: "read_file · edit_block · start_process", permission: tr("File editing + terminal", "文件编辑 + 终端"), link: "remote-development" },
    { id: "job", label: tr("Run a long job", "运行长任务"), request: tr("“Run the report export on data-pc. Save it as a task and keep the result for when I return.”", "“在 data-pc 上导出报表，保存为任务，我回来时能看到结果。”"), result: tr("A saved task with run history, exit status and a bounded result summary.", "保存的任务、运行历史、退出状态与受限结果摘要。"), steps: [tr("Save the approved command and recovery choice", "保存已批准命令与恢复方式"), tr("Run on the paired computer", "在已配对电脑执行"), tr("Track progress without an open chat turn", "无需保持聊天轮次也能跟踪进度"), tr("Record completion or the reason it stopped", "记录完成或停止原因")], tools: "create_automation · get_automation", permission: tr("Terminal + background tasks · staged release", "终端 + 后台任务 · 准备发布"), link: "long-running-jobs" },
    { id: "schedule", label: tr("Check it later", "稍后检查"), request: tr("“At the agreed time, run the health check on home-server. Save the result. Do not restart services.”", "“在约定时间检查 home-server 的健康状态并保存结果，不重启服务。”"), result: tr("A scheduled run and its result, within the action you authorized.", "在已授权动作范围内执行的定时检查与结果。"), steps: [tr("Confirm the start time, action and deadline", "确认开始时间、动作与期限"), tr("Save the schedule in Remote Arc", "在 Remote Arc 保存调度"), tr("Wait until due and the computer is available", "等待到期且电脑可用"), tr("Record each run for later inspection", "记录每轮结果供之后查看")], tools: "create_automation · manage_automation", permission: tr("Required tools + scheduled tasks · staged release", "所需工具 + 定时任务 · 准备发布"), link: "scheduled-checks" },
    { id: "inspect", label: tr("Understand a problem", "排查问题"), request: tr("“Read the service logs on my mini PC and explain the failure before changing anything.”", "“读取我 Mini PC 上的服务日志，先解释失败原因，不修改任何东西。”"), result: tr("A diagnosis tied to real files and process state on your computer.", "由电脑上真实文件和进程状态支撑的诊断。"), steps: [tr("Resolve the selected device", "确认目标设备"), tr("Read the relevant logs and processes", "读取相关日志与进程"), tr("Explain the cause from observed facts", "依据观察事实解释原因"), tr("Keep repair separate from diagnosis", "修复与诊断分别授权")], tools: "read_file · list_processes", permission: tr("Read-only tools", "只读工具"), link: "remote-support" },
  ] as const;
  const scenario = scenarios[selected] ?? scenarios[0];
  const faqGroups: { id: string; title: string; entries: [string, React.ReactNode][] }[] = [
    { id: "product", title: tr("Product & setup", "产品与使用"), entries: [
      [tr("What is Remote Arc? Is it a remote desktop?", "Remote Arc 是什么？是远程桌面吗？"), <>{tr("Remote Arc connects your AI to files, commands and tools on computers you own. Use it to inspect projects, make edits, run tests and read explicitly shared Chrome tabs. It does not stream your desktop or provide mouse-and-keyboard GUI control.", "Remote Arc 将 AI 连接到你自己电脑上的文件、命令与工具，用于检查项目、修改文件、运行测试和读取明确共享的 Chrome 标签页。它不串流桌面，也不提供鼠标键盘式 GUI 控制。")} <a href="/use-cases">{tr("Explore workflows", "查看使用场景")} →</a></>],
      [tr("Do I need another AI subscription or chat app?", "需要再订阅一个 AI 或换聊天应用吗？"), tr("Keep your existing ChatGPT, Claude, Cursor or compatible Remote MCP client. Connect Remote Arc through its supported Plugin/MCP path and OAuth. Your AI provider's plan and tool availability are separate from Remote Arc; support varies by client and account.", "继续使用已有 ChatGPT、Claude、Cursor 或兼容 Remote MCP 客户端，通过其支持的 Plugin/MCP 入口和 OAuth 连接。AI 服务的订阅与工具可用性独立于 Remote Arc，具体支持取决于客户端和账户。")],
      [tr("Which computers can I connect?", "哪些电脑可以连接？"), tr("Windows, macOS and Linux computers with the local agent installed. The CLI setup requires Node.js 20+. Pair each computer to your account and choose its permissions separately. Actual available tools depend on the installed agent and local environment.", "安装本地 Agent 的 Windows、macOS 与 Linux 电脑均可。CLI 配置需要 Node.js 20+。每台电脑分别配对到账户、选择权限，实际可用工具取决于已安装 Agent 和本机环境。")],
      [tr("Can I use it from my phone or outside my home network?", "能在手机上或外网使用吗？"), tr("Yes, through an AI client that supports the connection and tool calls on that device. Your paired computer connects outbound to the hosted relay, so your chat does not need to share its LAN. The computer, agent and internet connection still need to be available.", "可以，前提是该设备上的 AI 客户端支持连接与工具调用。已配对电脑向托管 Relay 建立出站连接，所以聊天端无需和电脑处于同一局域网。目标电脑、本地 Agent 与互联网连接仍需可用。")],
      [tr("What does it cost?", "怎么收费？"), <>{tr("The hosted service currently includes a free monthly allowance of 10,000 tool calls per account. A conversation can use several calls. AI-client subscriptions are separate, and paid top-ups are not available yet.", "托管服务当前每个账户每月提供 10,000 次免费工具调用，一次对话可能使用多次调用。AI 客户端订阅另算，目前尚未开放付费充值。" )} <a href="/pricing">{tr("See pricing and usage", "查看价格与额度")} →</a></>],
    ] },
    { id: "security", title: tr("Security & control", "安全与控制"), entries: [
      [tr("How much access am I giving the AI?", "AI 会获得多少电脑权限？"), <>{tr("You choose tools and paths per device, while OAuth scopes also constrain the client. Start read-only and add edits or terminal when needed. File tools enforce workspace policy. Terminal commands run as your local OS user and are not contained by an OS sandbox.", "你为每台设备选择工具和路径，OAuth Scope 还会限制客户端。从只读开始，按需开放编辑或终端。文件工具执行工作区策略；终端命令以本机 OS 用户身份运行，没有 OS 沙箱隔离。" )} <a href="/security-model">{tr("Read the security model", "了解安全模型")} →</a></>],
      [tr("Do I have to open a port or share my computer password?", "需要开放端口或提供电脑密码吗？"), tr("No inbound Remote Arc port or OS login password is needed. The agent connects outbound to the relay over encrypted transport and uses a device credential obtained through pairing. The AI client authorizes through OAuth. These credentials still need protection and can be revoked.", "不需要开放 Remote Arc 入站端口或提供 OS 登录密码。Agent 通过加密传输向 Relay 建立出站连接，使用配对获得的设备凭证；AI 客户端通过 OAuth 授权。这些凭证仍需保护，也可以撤销。")],
      [tr("Do my files stay private? What leaves the computer?", "文件是否私密？哪些内容会离开电脑？"), <>{tr("Requested file content, tool arguments and command output pass through the relay to your AI provider. Durable tasks also store their contract, bounded observations, memory and evidence. Undo snapshots stay local. HTTPS/WSS protects transport; this is not zero-knowledge end-to-end encryption.", "请求的文件内容、工具参数与命令输出会经过 Relay 返回 AI 服务。持久任务还保存合同、受限观察、工作记忆与证据，Undo 快照留在本机。HTTPS/WSS 保护传输，但不是 zero-knowledge 端到端加密。" )} <a href="/privacy">{tr("Read data handling", "查看数据处理说明")} →</a></>],
      [tr("Can I revoke access or stop ongoing work?", "能撤销访问或停止正在进行的工作吗？"), tr("Use Dashboard to revoke a device or AI-client grant, disable device tools, or pause/cancel saved Tasks. Account MCP pause blocks authenticated MCP calls. Removing access does not undo earlier effects or automatically terminate every process already started.", "可在 Dashboard 撤销设备或 AI 客户端授权、关闭设备工具，或暂停/取消已保存 Task。账户 MCP Pause 会阻止已认证 MCP 调用。撤销访问不会撤回此前副作用，也不等于自动终止所有已启动进程。")],
      [tr("Can I undo everything the AI changes?", "AI 的所有修改都能撤销吗？"), tr("Local Undo can restore supported file-tool edits when enabled, using snapshots on that device. It does not roll back shell commands, Git operations, deleted files or external service actions. Review the requested work and its permissions before execution.", "开启 Local Undo 后，可用设备上的快照恢复受支持的文件工具修改。它不回滚 Shell 命令、Git 操作、文件删除或外部服务动作。执行前应核对请求的工作和权限。")],
    ] },
    { id: "tasks", title: tr("Tasks & availability", "任务与在线状态"), entries: [
      [tr("Does every request become a Task?", "每次请求都是一个 Task 吗？"), tr("No. File reads and short commands are ordinary tool calls. A Task saves work that should continue, wait for a condition or run later. Your AI can create it under your authorization; Dashboard is optional for inspecting and managing it.", "不是。读取文件和短命令属于普通工具调用。Task 保存需要持续推进、等待条件或稍后执行的工作。AI 可以在授权范围内创建，Dashboard 用于按需查看与管理。")],
      [tr("Can the AI keep working while I sleep?", "我睡觉后 AI 能继续工作吗？"), <>{tr("A saved fixed task can run without the original chat. Adaptive work needs a continuing source host or an explicitly chosen hosted planner; Plugin access alone does not guarantee overnight reasoning. These capabilities are staged for release, with real Chat/Work overnight acceptance still pending.", "已保存的固定任务可独立于原聊天运行。自主工作需要持续源宿主或明确选择的托管 Planner，连接 Plugin 本身不保证过夜推理。这些能力正在准备发布，真实 Chat/Work 过夜验收仍待完成。" )} <a href="/docs/long-running-work">{tr("See requirements", "查看运行条件")} →</a></>],
      [tr("What if the computer sleeps, disconnects or restarts?", "电脑睡眠、断网或重启后会怎样？"), tr("New local work waits while the device is unreachable. Durable progress remains, and recovery follows the saved policy after the OS session and agent reconnect. An old process handle is not restored. Optional task keep-awake can help an active computer stay awake; it cannot wake an offline device or start a powered-off computer.", "设备不可达时，新的本机操作等待。持久进度仍在，OS 用户会话与 Agent 重连后按保存策略恢复，不恢复旧进程句柄。可选任务保持唤醒能帮助运行中的电脑不休眠，但不能唤醒离线设备或启动已关机电脑。")],
    ] },
  ];
  const currentFaq = faqGroups[faqCategory] ?? faqGroups[0]!;

  return <div className="landingContent">
    <section className="landingWork sectionBlock" id="how-it-works">
      <header className="modernSectionIntro"><span className="eyebrow">{tr("START WITH THE WORK", "先看能完成什么")}</span><h2>{tr("Ask for a result. Use the computer where the work lives.", "说出想要的结果，在项目所在电脑上完成。")}</h2><p>{tr("Your files, dependencies and tools stay in their existing environment. Remote Arc gives your AI a controlled path to read, edit and run there.", "文件、依赖和工具继续使用现有环境。Remote Arc 为 AI 提供受控的读取、编辑与执行通道。")}</p></header>
      <div className="workSelector" role="tablist" aria-label={tr("Choose a workflow", "选择工作场景")}>{scenarios.map((item, index) => <button role="tab" id={"scenario-tab-" + item.id} aria-controls={"scenario-panel-" + item.id} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} key={item.id} onClick={() => setSelected(index)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % scenarios.length : event.key === "ArrowLeft" ? (index + scenarios.length - 1) % scenarios.length : event.key === "Home" ? 0 : event.key === "End" ? scenarios.length - 1 : null;
        if (next === null) return; event.preventDefault(); setSelected(next); document.getElementById("scenario-tab-" + scenarios[next]!.id)?.focus();
      }}>{item.label}</button>)}</div>
      <div className="workExample" role="tabpanel" id={"scenario-panel-" + scenario.id} aria-labelledby={"scenario-tab-" + scenario.id} tabIndex={0}>
        <div className="workRequest"><span>{tr("YOU ASK IN YOUR AI CHAT", "在 AI 聊天中提出请求")}</span><blockquote>{scenario.request}</blockquote><p>{scenario.result}</p><a href={"/use-cases/" + scenario.link}>{tr("See the complete workflow", "查看完整流程")} ↗</a></div>
        <div className="workExecution"><span className="executionCaption">{tr("ON YOUR COMPUTER", "在你的电脑上")}</span><ol>{scenario.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol><div className="executionTools"><code>{scenario.tools}</code><p>{scenario.permission}</p></div></div>
      </div>
      <p className="workExampleNote">{tr("Workflow examples, not live execution. Persistent task features are staged for release.", "以上是工作流程示例，不执行真实操作；持久任务能力正在准备发布。")}</p>
    </section>

    <section className="landingSetup sectionBlock" id="connect-once">
      <header className="modernSectionIntro"><span className="eyebrow">{tr("ONE SETUP, REUSABLE ACCESS", "一次配置，重复使用")}</span><h2>{tr("Connect your AI client once.", "一次连接你的 AI 客户端。")}</h2><p>{tr("Pair the computer. Choose what it may do. Authorize your AI. After that, start with a request in your chat.", "配对电脑、选择能力并授权 AI。之后直接从聊天请求开始。")}</p></header>
      <div className="setupColumns"><div className="setupSteps">
        <article><span>01</span><div><h3>{tr("Run on the computer you want to use", "在需要使用的电脑上运行")}</h3><p>{tr("The CLI opens browser pairing. Sign in and verify the device code.", "CLI 打开浏览器配对，登录并核对设备码。")}</p><code>npx remotelink</code><small>{tr("Node.js 20+ · Windows / macOS / Linux", "Node.js 20+ · Windows / macOS / Linux")}</small></div></article>
        <article><span>02</span><div><h3>{tr("Choose permissions for this device", "选择这台设备的权限")}</h3><p>{tr("Start with reads. Add editing or terminal only when needed. Select workspace roots and background connection separately.", "从读取开始，按需增加编辑或终端，分别选择工作区与后台连接。")}</p><a href="/docs#docs-policy">{tr("Understand each control", "了解每个控制项")} →</a></div></article>
        <article><span>03</span><div><h3>{tr("Connect your existing AI client", "连接正在使用的 AI 客户端")}</h3><p>{tr("Use its Plugin or Remote MCP path, complete Remote Arc OAuth and ask for work on the paired computer.", "通过 Plugin 或 Remote MCP 入口完成 Remote Arc OAuth，再要求在已配对电脑上工作。")}</p><div className="setupClientLinks"><a href="/install/chatgpt">ChatGPT ↗</a><a href="/install/claude">Claude ↗</a><a href="/install/cursor">Cursor ↗</a></div></div></article>
      </div><ConnectionFilm /></div>
      <div className="setupEndpoint"><span>{tr("REMOTE MCP ENDPOINT", "REMOTE MCP 地址")}</span><code>https://mcp.remotearc.app/mcp</code><a href="/docs/mcp">{tr("Connection reference", "接入参考")} →</a></div>
    </section>

    <section className="landingGoals sectionBlock" id="long-running-work">
      <div className="goalIntro"><span className="eyebrow">{tr("WHEN ONE COMMAND IS NOT ENOUGH", "需要多轮推进时")}</span><h2>{tr("Give the agent a finish line.", "给 Agent 一个明确的完成标准。")}</h2><p>{tr("A useful long task needs a goal, not endless activity. Save the objective, approved tools, verification and limits, then let a continuing controller adapt to the results.", "有用的长任务需要目标，而不是无止境操作。保存目标、已批准工具、验证与限制，让持续控制器根据结果调整。")}</p><a href="/docs/long-running-work">{tr("How long-running work operates", "了解持续工作如何运行")} →</a><span className="stagedFeature">{tr("STAGED RELEASE · HOST ACCEPTANCE PENDING", "准备发布 · 宿主验收待完成")}</span></div>
      <div className="goalContract"><header><span>{tr("SAVED GOAL", "保存的目标")}</span><strong>{tr("Fix the failing tests", "修复失败测试")}</strong></header><dl>
        <div><dt>{tr("Where", "位置")}</dt><dd>build-pc · ~/projects/app</dd></div><div><dt>{tr("Done means", "完成标准")}</dt><dd>{tr("Full verification passes; changes and evidence are recorded.", "完整验证通过，记录修改与证据。")}</dd></div><div><dt>{tr("Limits", "限制")}</dt><dd>{tr("Approved tools, iteration budget, deadline. No deployment or publication.", "已批准工具、迭代预算和期限。不部署或发布。")}</dd></div>
      </dl><div className="goalCycle"><span>{tr("Observe", "观察")}</span><b>→</b><span>{tr("Act", "操作")}</span><b>→</b><span>{tr("Verify", "验证")}</span><b>↺</b></div><p>{tr("Saved progress survives interruptions. Source reasoning needs a continuing host or verified events; a hosted planner is a separate explicit option.", "保存进度可跨中断恢复。源推理需要持续宿主或验证后的事件，托管 Planner 是另一项明确选择。")}</p></div>
    </section>

    <section className="landingControl sectionBlock" id="your-controls">
      <header className="modernSectionIntro"><span className="eyebrow">{tr("YOUR COMPUTER, YOUR CONTROLS", "你的电脑，由你控制")}</span><h2>{tr("Grant the capabilities the work needs.", "只开放工作需要的能力。")}</h2><p>{tr("Each device has its own tools, paths and task permissions. A development machine can run commands while another computer stays read-only.", "每台设备各有工具、路径与任务权限。开发机可以执行命令，另一台电脑可以一直保持只读。")}</p></header>
      <div className="permissionLevels"><article><span>01</span><h3>{tr("Read and inspect", "读取与检查")}</h3><p>{tr("Files, directories and process state. Keep write and terminal tools disabled.", "文件、目录与进程状态，可以保持写入和终端关闭。")}</p><code>{tr("READ-ONLY", "只读")}</code></article><article><span>02</span><h3>{tr("Edit selected files", "编辑指定文件")}</h3><p>{tr("Add file editing under workspace and sensitive-path policy. Supported edits can keep Local Undo.", "在工作区和敏感路径策略内增加文件编辑，受支持修改可保存 Local Undo。")}</p><code>DEVELOPER</code></article><article><span>03</span><h3>{tr("Run installed tools", "运行本机工具")}</h3><p>{tr("Enable terminal separately. Commands inherit the local OS user's access; this is not an OS sandbox.", "单独开启终端。命令继承本机 OS 用户权限，这不是 OS 沙箱。")}</p><code>FULL / TERMINAL</code></article></div>
      <div className="controlDetails"><div><strong>{tr("Stop ongoing work", "停止持续工作")}</strong><p>{tr("Pause or cancel a Task. Disable task capabilities per device, revoke a computer or remove an AI client grant.", "暂停或取消 Task、关闭设备任务能力、撤销电脑或删除 AI 客户端授权。")}</p></div><div><strong>{tr("Know what is saved", "知道哪些内容会保存")}</strong><p>{tr("Requested content passes through the relay. Durable goals save bounded observations and evidence; Undo snapshots stay local.", "请求内容经过 Relay，持久目标保存受限观察与证据；Undo 快照留在本机。")}</p></div></div>
      <div className="safetyExample">
        <div className="safetyStory"><span className="eyebrow">SAFETY GUARD</span><h3>{tr("More capability. Your boundaries.", "释放能力，由你掌控。")}</h3><p>{tr("Let your AI build, test and solve problems within the access you grant. Remote Arc checks commands on the device and blocks recognized destructive patterns—including this shutdown request—before execution.", "让 AI 在你授予的权限内构建、测试、解决问题。Remote Arc 在设备上检查命令，执行前拦截已识别的破坏性模式，包括这里的关机请求。")}</p><p className="safetyScope">{tr("A focused safeguard alongside your device permissions. Terminal access still uses your OS account; this is not an OS sandbox or a guarantee against every harmful script.", "它是设备权限之外的一层针对性防护。终端仍使用你的 OS 账户权限，不是 OS 沙箱，也不保证识别所有有害脚本。")}</p></div>
        <figure className="safetyTerminal"><figcaption><span aria-hidden="true">● ● ●</span><span>{tr("Example · device terminal", "示例 · 设备终端")}</span></figcaption><div className="safetyTerminalBody"><div className="safetyTool">start_process</div><code>$ shutdown /s /t 0</code><div className="safetyBlocked">{tr("REQUEST BLOCKED", "请求已拦截")}</div><pre>Blocked by Remote Arc Safety Guard: system shutdown or reboot. Run this action manually on the device if you intentionally need it.</pre><p>{tr("The command was not started.", "命令未启动。")}</p></div></figure>
      </div>
      <div className="sectionResourceLinks"><a href="/security-model">{tr("Security model", "安全模型")} →</a><a href="/docs#docs-data">{tr("Data handling", "数据处理")} →</a><a href="/docs#docs-sandbox">{tr("Execution boundaries", "执行边界")} →</a></div>
    </section>

    <section className="landingQuestions sectionBlock">
      <header className="modernSectionIntro"><span className="eyebrow">{tr("BEFORE YOU CONNECT", "连接前了解")}</span><h2>{tr("The questions that matter.", "真正需要了解的问题。")}</h2><p>{tr("What it does, what you authorize and what happens to your data.", "能做什么、授权了什么，以及数据如何处理。")}</p></header>
      <div className="faqContent">
        <div className="faqCategories" role="tablist" aria-label={tr("FAQ topics", "常见问题分类")}>{faqGroups.map((group, index) => <button key={group.id} type="button" role="tab" id={"faq-tab-" + group.id} aria-controls={"faq-panel-" + group.id} aria-selected={faqCategory === index} tabIndex={faqCategory === index ? 0 : -1} onClick={() => setFaqCategory(index)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % faqGroups.length : event.key === "ArrowLeft" ? (index + faqGroups.length - 1) % faqGroups.length : event.key === "Home" ? 0 : event.key === "End" ? faqGroups.length - 1 : null;
          if (next === null) return; event.preventDefault(); setFaqCategory(next); document.getElementById("faq-tab-" + faqGroups[next]!.id)?.focus();
        }}>{group.title}</button>)}</div>
        <div className="modernFaq" role="tabpanel" id={"faq-panel-" + currentFaq.id} aria-labelledby={"faq-tab-" + currentFaq.id}>{currentFaq.entries.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">＋</span></summary><p>{answer}</p></details>)}</div>
      </div>
    </section>

    <section className="landingFinish sectionBlock"><div><span className="eyebrow">{tr("START WITH YOUR OWN COMPUTER", "从自己的电脑开始")}</span><h2>{tr("Bring your AI to the work already there.", "让 AI 进入已有的工作环境。")}</h2><p>{tr("Pair one device, start with the permissions you need and try a concrete request.", "配对一台设备、授予必要权限，再尝试一个具体请求。")}</p><div><a className="primaryButton" href="/install/chatgpt">{tr("Get started", "开始使用")} →</a><a href="/use-cases">{tr("Explore use cases", "浏览使用场景")} ↗</a></div></div><div className="finishCommand"><span>{tr("RUN ON YOUR COMPUTER", "在你的电脑上运行")}</span><code>npx remotelink</code><a href="https://github.com/yaohuangguan/remote-arc" target="_blank" rel="noreferrer">{tr("Open source · inspect the code", "开源 · 查看代码")} ↗</a></div></section>
  </div>;
}
