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
  const [paused, setPaused] = useState(false);
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
    if (reducedMotion || paused || !visible) return;
    const delay = frame.deleting ? 48 : frame.length === phrase.length ? 2600 : 100;
    const timer = window.setTimeout(() => setFrame(previous => {
      if (previous.deleting) return previous.length === 0 ? { index: (previous.index + 1) % phrases.length, length: 0, deleting: false } : { ...previous, length: previous.length - 1 };
      return previous.length >= phrase.length ? { ...previous, deleting: true } : { ...previous, length: previous.length + 1 };
    }), delay);
    return () => window.clearTimeout(timer);
  }, [frame.deleting, frame.length, paused, phrase.length, phrases.length, reducedMotion, visible]);
  return <div className="heroHeadlineGroup">
    <h1 className="heroHeadline"><span className="heroAccessible">{tr("Build apps, run tasks, fix bugs and analyze data on your own computer. Anywhere, anytime.", "让 AI 在自己的电脑上构建应用、执行任务、修复问题和分析数据。随时随地。")}</span><span aria-hidden="true"><span className="heroTypeLine">{reducedMotion || paused ? phrase : phrase.slice(0, frame.length)}{!reducedMotion && !paused && <i className="heroTypeCursor" />}</span><span className="heroFixedLine"><span>{tr("Anywhere,", "随时，")}</span><span>{tr("Anytime.", "随地。")}</span></span></span></h1>
    {!reducedMotion && <button className="heroMotionControl" type="button" aria-pressed={paused} aria-label={paused ? tr("Play headline animation", "播放标题动画") : tr("Pause headline animation", "暂停标题动画")} title={paused ? tr("Play headline animation", "播放标题动画") : tr("Pause headline animation", "暂停标题动画")} onClick={() => setPaused(value => !value)}><span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span></button>}
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
  const scenarios = [
    { id: "code", label: tr("Fix a project", "修复项目"), request: tr("“On my workstation, find the failing test, fix the code and show me the verified diff.”", "“在我的工作站上找到失败测试、修复代码，给我看验证后的 diff。”"), result: tr("An actual change in your checkout, with test results you can inspect.", "真实仓库中的修改，以及可检查的测试结果。"), steps: [tr("Find the named computer and its permitted tools", "确认指定电脑与可用工具"), tr("Read the code and reproduce the failure", "读取代码、复现失败"), tr("Edit the affected files and rerun tests", "修改相关文件、重新测试"), tr("Return the diff, evidence and remaining issues", "返回 diff、证据与未解决问题")], tools: "read_file · edit_block · start_process", permission: tr("File editing + terminal", "文件编辑 + 终端"), link: "remote-development" },
    { id: "job", label: tr("Run a long job", "运行长任务"), request: tr("“Run the report export on data-pc. Save it as a task and keep the result for when I return.”", "“在 data-pc 上导出报表，保存为任务，我回来时能看到结果。”"), result: tr("A saved task with run history, exit status and a bounded result summary.", "保存的任务、运行历史、退出状态与受限结果摘要。"), steps: [tr("Save the approved command and recovery choice", "保存已批准命令与恢复方式"), tr("Run on the paired computer", "在已配对电脑执行"), tr("Track progress without an open chat turn", "无需保持聊天轮次也能跟踪进度"), tr("Record completion or the reason it stopped", "记录完成或停止原因")], tools: "create_automation · get_automation", permission: tr("Terminal + background tasks · staged release", "终端 + 后台任务 · 准备发布"), link: "long-running-jobs" },
    { id: "schedule", label: tr("Check it later", "稍后检查"), request: tr("“At the agreed time, run the health check on home-server. Save the result. Do not restart services.”", "“在约定时间检查 home-server 的健康状态并保存结果，不重启服务。”"), result: tr("A scheduled run and its result, within the action you authorized.", "在已授权动作范围内执行的定时检查与结果。"), steps: [tr("Confirm the start time, action and deadline", "确认开始时间、动作与期限"), tr("Save the schedule in Remote Arc", "在 Remote Arc 保存调度"), tr("Wait until due and the computer is available", "等待到期且电脑可用"), tr("Record each run for later inspection", "记录每轮结果供之后查看")], tools: "create_automation · manage_automation", permission: tr("Required tools + scheduled tasks · staged release", "所需工具 + 定时任务 · 准备发布"), link: "scheduled-checks" },
    { id: "inspect", label: tr("Understand a problem", "排查问题"), request: tr("“Read the service logs on my mini PC and explain the failure before changing anything.”", "“读取我 Mini PC 上的服务日志，先解释失败原因，不修改任何东西。”"), result: tr("A diagnosis tied to real files and process state on your computer.", "由电脑上真实文件和进程状态支撑的诊断。"), steps: [tr("Resolve the selected device", "确认目标设备"), tr("Read the relevant logs and processes", "读取相关日志与进程"), tr("Explain the cause from observed facts", "依据观察事实解释原因"), tr("Keep repair separate from diagnosis", "修复与诊断分别授权")], tools: "read_file · list_processes", permission: tr("Read-only tools", "只读工具"), link: "remote-support" },
  ] as const;
  const scenario = scenarios[selected] ?? scenarios[0];
  const faq = [
    [tr("Do I need a new chat app?", "需要换一个聊天应用吗？"), tr("No. Connect Remote Arc to your existing AI client through a Plugin or Remote MCP and OAuth. Then name the computer and ask for work in that chat. Use Dashboard when you want to manage devices or inspect tasks.", "不需要。通过 Plugin 或 Remote MCP 与 OAuth 连接已有 AI 客户端，然后在聊天中指定电脑并提出请求。需要管理设备或查看任务时再使用 Dashboard。")],
    [tr("Does every request become a Task?", "每次请求都是一个 Task 吗？"), tr("No. Reading a file or running a short command is an ordinary tool call. A Task saves work that should continue, wait for a condition or run later. The AI can create it under your authorization without a separate manual setup for every operation.", "不是。读文件或运行短命令属于普通工具调用。Task 保存需要持续推进、等待条件或稍后运行的工作，AI 可以在授权范围内创建，无需每次操作都手动设置。")],
    [tr("Can it keep working while I am asleep?", "我睡觉后它能继续工作吗？"), tr("A saved fixed task can run without the original chat. Adaptive work also needs a continuing source host or an explicitly selected hosted planner. Plugin access alone does not guarantee overnight reasoning. The computer must remain available, and real Chat/Work overnight acceptance is still pending for the staged implementation.", "已保存的固定任务可独立于原聊天运行。自主工作还需要持续源宿主或明确选择的托管 Planner；连接 Plugin 本身不保证过夜推理。电脑必须可用，当前准备发布的实现仍需真实 Chat/Work 过夜验收。")],
    [tr("What happens after a restart?", "重启后会怎样？"), tr("The durable Task and saved progress remain. Once the computer and local agent reconnect, recovery follows the saved policy. The old process handle is not preserved: a known lost attempt may restart or fail, while uncertain effects require inspection.", "持久 Task 和保存进度仍然存在。电脑与本地 Agent 重连后按照保存策略恢复；旧进程句柄不会保留。已确认但丢失的尝试可以重启或失败，不确定副作用需要检查。")],
    [tr("Is terminal access sandboxed?", "终端访问经过沙箱隔离吗？"), tr("No OS sandbox is included today. File tools enforce workspace and sensitive-path policy; terminal commands run as the local OS user. Use only the capabilities a computer needs, or a dedicated restricted environment when stronger isolation is required.", "当前没有 OS 沙箱。文件工具执行工作区与敏感路径策略，终端命令以本机 OS 用户运行。只开放电脑需要的能力；需要更强隔离时使用独立受限环境。")],
    [tr("What data can leave my computer?", "哪些数据可能离开电脑？"), tr("Requested file content and command output pass through the relay to your AI. Durable goals also save their contract, bounded observations, factual memory and evidence. Local Undo snapshots stay on the device. Read the data guide before choosing sensitive tasks.", "请求的文件内容和命令输出经 Relay 返回 AI。持久目标还保存合同、受限观察、事实记忆与证据；Local Undo 快照留在设备上。选择敏感任务前请阅读数据说明。")],
  ];
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
      <div className="sectionResourceLinks"><a href="/security-model">{tr("Security model", "安全模型")} →</a><a href="/docs#docs-data">{tr("Data handling", "数据处理")} →</a><a href="/docs#docs-sandbox">{tr("Execution boundaries", "执行边界")} →</a></div>
    </section>

    <section className="landingQuestions sectionBlock"><header className="modernSectionIntro"><span className="eyebrow">{tr("BEFORE YOU CONNECT", "连接前了解")}</span><h2>{tr("The questions that matter.", "真正需要了解的问题。")}</h2></header><div className="modernFaq">{faq.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">＋</span></summary><p>{answer}</p></details>)}</div></section>
    <section className="landingFinish sectionBlock"><div><span className="eyebrow">{tr("START WITH YOUR OWN COMPUTER", "从自己的电脑开始")}</span><h2>{tr("Bring your AI to the work already there.", "让 AI 进入已有的工作环境。")}</h2><p>{tr("Pair one device, start with the permissions you need and try a concrete request.", "配对一台设备、授予必要权限，再尝试一个具体请求。")}</p><div><a className="primaryButton" href="/install/chatgpt">{tr("Get started", "开始使用")} →</a><a href="/use-cases">{tr("Explore use cases", "浏览使用场景")} ↗</a></div></div><div className="finishCommand"><span>{tr("RUN ON YOUR COMPUTER", "在你的电脑上运行")}</span><code>npx remotelink</code><a href="https://github.com/yaohuangguan/remote-arc" target="_blank" rel="noreferrer">{tr("Open source · inspect the code", "开源 · 查看代码")} ↗</a></div></section>
  </div>;
}
