import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import { InteractiveWorkDemo } from "./landing-interactive-demo.js";
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

export function ConnectionFilm() {
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


/** Reused by the homepage and the Remote MCP guide so example behavior stays identical. */
export function LandingInteractiveDemo() {
  const { tr } = useI18n();
  const scenarios = [
    { id: "code", label: tr("Fix a project", "修复项目"), request: tr("“On my workstation, find the failing test, fix the code and show me the verified diff.”", "“在我的工作站上找到失败测试、修复代码，给我看验证后的 diff。”"), result: tr("An actual change in your checkout, with test results you can inspect.", "真实仓库中的修改，以及可检查的测试结果。"), steps: [tr("Find the named computer and its permitted tools", "确认指定电脑与可用工具"), tr("Read the code and reproduce the failure", "读取代码、复现失败"), tr("Edit the affected files and rerun tests", "修改相关文件、重新测试"), tr("Return the diff, evidence and remaining issues", "返回 diff、证据与未解决问题")], tools: "read_file · edit_block · start_process", permission: tr("File editing + terminal", "文件编辑 + 终端"), link: "remote-development" },
    { id: "job", label: tr("Run a long job", "运行长任务"), request: tr("“Run the report export on data-pc. Save it as a task and keep the result for when I return.”", "“在 data-pc 上导出报表，保存为任务，我回来时能看到结果。”"), result: tr("A saved task with run history, exit status and a bounded result summary.", "保存的任务、运行历史、退出状态与受限结果摘要。"), steps: [tr("Save the approved command and recovery choice", "保存已批准命令与恢复方式"), tr("Run on the paired computer", "在已配对电脑执行"), tr("Track progress without an open chat turn", "无需保持聊天轮次也能跟踪进度"), tr("Record completion or the reason it stopped", "记录完成或停止原因")], tools: "create_automation · get_automation", permission: tr("Terminal + background tasks · Plus", "终端 + 后台任务 · Plus"), link: "long-running-jobs" },
    { id: "schedule", label: tr("Check it later", "稍后检查"), request: tr("“At the agreed time, run the health check on home-server. Save the result. Do not restart services.”", "“在约定时间检查 home-server 的健康状态并保存结果，不重启服务。”"), result: tr("A scheduled run and its result, within the action you authorized.", "在已授权动作范围内执行的定时检查与结果。"), steps: [tr("Confirm the start time, action and deadline", "确认开始时间、动作与期限"), tr("Save the schedule in Remote Arc", "在 Remote Arc 保存调度"), tr("Wait until due and the computer is available", "等待到期且电脑可用"), tr("Record each run for later inspection", "记录每轮结果供之后查看")], tools: "create_automation · manage_automation", permission: tr("Required tools + scheduled tasks · Plus", "所需工具 + 定时任务 · Plus"), link: "scheduled-checks" },
    { id: "slides", label: tr("Create a PPT", "制作 PPT"), request: tr("“Use my existing notes and charts to make a 12-slide presentation. Save an editable .pptx and verify its slide count.”", "“把我已有的笔记和图表做成 12 页演示文稿，保存可编辑的 PPTX 并检查页数。”"), result: tr("An editable presentation saved on the selected computer, verified with a local script.", "在指定电脑上生成可编辑演示文稿，并通过本机脚本核验。"), steps: [tr("Inspect the notes, charts and installed slide library", "检查笔记、图表及已安装的 PPT 库"), tr("Generate the deck in the approved output folder", "在获授权的目录生成幻灯片"), tr("Inspect the slide count and document structure", "检查页数与文档结构")], tools: "read_file · start_process · get_file_info", permission: tr("Files + authorized terminal + installed PPTX library", "文件 + 已授权终端 + 本机 PPTX 库"), link: "presentation-deck" },
    { id: "excel", label: tr("Build an Excel report", "生成 Excel"), request: tr("“Combine my monthly CSVs into an Excel workbook with deduplicated rows, totals and a trend chart. Check the totals.”", "“把月度 CSV 合并为 Excel，去重、汇总并绘制趋势图，最后核对合计。”"), result: tr("A checked .xlsx workbook with reconciled source totals.", "带有合计核验结果的 .xlsx 工作簿。"), steps: [tr("Inspect source CSVs and their columns", "检查 CSV 和字段"), tr("Build the workbook with locally installed tools", "使用本机安装的工具生成 Excel"), tr("Reconcile totals and check the output file", "核对总数并检查输出文件")], tools: "read_file · start_process · get_file_info", permission: tr("Files + authorized terminal + installed XLSX library", "文件 + 已授权终端 + 本机 XLSX 库"), link: "spreadsheet-report" },
    { id: "inspect", label: tr("Understand a problem", "排查问题"), request: tr("“Read the service logs on my mini PC and explain the failure before changing anything.”", "“读取我 Mini PC 上的服务日志，先解释失败原因，不修改任何东西。”"), result: tr("A diagnosis tied to real files and process state on your computer.", "由电脑上真实文件和进程状态支撑的诊断。"), steps: [tr("Resolve the selected device", "确认目标设备"), tr("Read the relevant logs and processes", "读取相关日志与进程"), tr("Explain the cause from observed facts", "依据观察事实解释原因"), tr("Keep repair separate from diagnosis", "修复与诊断分别授权")], tools: "read_file · list_processes", permission: tr("Read-only tools", "只读工具"), link: "remote-support" },
  ] as const;
  return <InteractiveWorkDemo scenarios={scenarios} />;
}

/** The homepage's existing AI / MCP / computer architecture illustration. */
export function LandingArchitectureDiagram() {
  const { tr } = useI18n();
  return <>
      <div className="goalContract"><header><span>{tr("YOUR CHAT → REAL TOOLS", "AI 对话 → 真实工具")}</span><strong>{tr("One chat. Real execution.", "一个对话，真正执行。")}</strong></header><dl>
        <div><dt>{tr("The brain", "负责思考")}</dt><dd>{tr("Your existing AI chat and model", "你已经在使用的 AI 聊天与模型")}</dd></div><div><dt>{tr("The bridge", "负责连接")}</dt><dd>{tr("Remote Arc · MCP, device permissions and routing", "Remote Arc · MCP、设备权限与路由")}</dd></div><div><dt>{tr("The tools", "负责执行")}</dt><dd>{tr("Your computer · files, terminal and processes", "你的电脑 · 文件、终端与进程")}</dd></div>
      </dl><div className="goalCycle"><span>{tr("Think", "思考")}</span><b>→</b><span>{tr("Use tools", "调用工具")}</span><b>→</b><span>{tr("Verify", "验证")}</span><b>↺</b></div><p>{tr("No separate model API key is required. Your AI provider's plan, message and context limits still apply; Remote Arc has separate tool-call limits. Stronger models may handle harder work, but permissions stay under your control.", "无需单独配置模型 API Key。AI 服务商的套餐、消息和上下文限制仍适用，Remote Arc 另有工具调用额度。更强的模型可以处理更难的任务，但授权始终由你掌控。")}</p></div>
  </>;
}

export function LandingContent() {
  const { tr } = useI18n();
  const [faqCategory, setFaqCategory] = useState(0);
  const faqGroups: { id: string; title: string; entries: [string, React.ReactNode][] }[] = [
    { id: "product", title: tr("Product & setup", "产品与使用"), entries: [
      [tr("What is Remote Arc? Is it a remote desktop?", "Remote Arc 是什么？是远程桌面吗？"), <>{tr("Remote Arc gives the AI client you already use controlled access to files, processes, terminals and explicitly shared browser tabs on computers you own. It can also persist deterministic Tasks such as long commands, schedules and condition watches. It does not stream your desktop or claim that ordinary Chat keeps reasoning after the chat ends.", "Remote Arc 让你正在使用的 AI 客户端以受控权限访问自己电脑上的文件、进程、终端和明确共享的浏览器标签页，也能保存长命令、定时任务和条件监听等确定性 Task。它不串流桌面，也不声称普通 Chat 结束后 AI 仍会自动持续推理。")} <a href="/use-cases">{tr("Explore workflows", "查看使用场景")} →</a></>],
      [tr("Do I need another AI subscription or chat app?", "需要再订阅一个 AI 或换聊天应用吗？"), tr("Keep your existing ChatGPT, Claude, Cursor or compatible Remote MCP client. Connect Remote Arc through its supported Plugin/MCP path and OAuth. Your AI provider's plan and tool availability are separate from Remote Arc; support varies by client and account.", "继续使用已有 ChatGPT、Claude、Cursor 或兼容 Remote MCP 客户端，通过其支持的 Plugin/MCP 入口和 OAuth 连接。AI 服务的订阅与工具可用性独立于 Remote Arc，具体支持取决于客户端和账户。")],
      [tr("Which computers can I connect?", "哪些电脑可以连接？"), tr("Windows, macOS and Linux computers with the local Agent installed. Native downloads and Homebrew need no Node.js; only npm/npx installation requires Node.js 20+. Pair each computer to your account and choose its permissions separately. Actual available tools depend on the installed Agent and local environment.", "安装本地 Agent 的 Windows、macOS 与 Linux 电脑均可。直接下载和 Homebrew 安装不需要 Node.js；只有 npm/npx 安装方式需要 Node.js 20+。每台电脑分别配对到账户、选择权限，实际可用工具取决于已安装 Agent 和本机环境。")],
      [tr("Can I use it from my phone or outside my home network?", "能在手机上或外网使用吗？"), tr("Yes, through an AI client that supports the connection and tool calls on that device. Your paired computer connects outbound to the hosted relay, so your chat does not need to share its LAN. The computer, agent and internet connection still need to be available.", "可以，前提是该设备上的 AI 客户端支持连接与工具调用。已配对电脑向托管 Relay 建立出站连接，所以聊天端无需和电脑处于同一局域网。目标电脑、本地 Agent 与互联网连接仍需可用。")],
      [tr("What does it cost?", "怎么收费？"), <>{tr("Free includes core remote-computer tools and the current 10,000-call monthly hosted allowance. Plus adds binary reads, durable long-command Tasks, schedules, condition watches and supported keep-awake. Plus is currently early access; self-service billing is not enabled in this release candidate. AI-client subscriptions remain separate.", "Free 包含核心远程电脑工具与当前每月 10,000 次托管调用额度。Plus 增加二进制读取、持久长命令 Task、定时任务、条件监听与受支持的保持唤醒。Plus 当前为抢先体验，本 release candidate 尚未开放自助付费；AI 客户端订阅仍独立计算。" )} <a href="/pricing">{tr("Compare Free & Plus", "对比 Free 与 Plus")} →</a></>],
    ] },
    { id: "security", title: tr("Security & control", "安全与控制"), entries: [
      [tr("How much access am I giving the AI?", "AI 会获得多少电脑权限？"), <>{tr("You choose tools per device, while OAuth scopes constrain the client. Ordinary non-sensitive reads can remain broad; persistent file changes stay inside Trusted Write Locations. An out-of-scope write pauses for approval. Sensitive paths remain separately protected. Terminal is a separate high-risk capability and is not contained by an OS sandbox.", "你为每台设备选择工具，OAuth Scope 同时限制客户端。普通非敏感读取可以保持灵活；持续文件修改只发生在可信写入区域内，越界写入会暂停等待审批。敏感路径继续独立保护；终端是单独的高风险能力，并没有 OS 沙箱隔离。" )} <a href="/security-model">{tr("Read the security model", "了解安全模型")} →</a></>],
      [tr("Do I have to open a port or share my computer password?", "需要开放端口或提供电脑密码吗？"), tr("No inbound Remote Arc port or OS login password is needed. The agent connects outbound to the relay over encrypted transport and uses a device credential obtained through pairing. The AI client authorizes through OAuth. These credentials still need protection and can be revoked.", "不需要开放 Remote Arc 入站端口或提供 OS 登录密码。Agent 通过加密传输向 Relay 建立出站连接，使用配对获得的设备凭证；AI 客户端通过 OAuth 授权。这些凭证仍需保护，也可以撤销。")],
      [tr("Do my files stay private? What leaves the computer?", "文件是否私密？哪些内容会离开电脑？"), <>{tr("Requested file content, tool arguments and command output pass through the relay to your AI provider. Durable tasks also store their contract, bounded observations, memory and evidence. Undo snapshots stay local. HTTPS/WSS protects transport; this is not zero-knowledge end-to-end encryption.", "请求的文件内容、工具参数与命令输出会经过 Relay 返回 AI 服务。持久任务还保存合同、受限观察、工作记忆与证据，Undo 快照留在本机。HTTPS/WSS 保护传输，但不是 zero-knowledge 端到端加密。" )} <a href="/privacy">{tr("Read data handling", "查看数据处理说明")} →</a></>],
      [tr("Can I revoke access or stop ongoing work?", "能撤销访问或停止正在进行的工作吗？"), tr("Use Dashboard to revoke a device or AI-client grant, disable device tools, or pause/cancel saved Tasks. Account MCP pause blocks authenticated MCP calls. Removing access does not undo earlier effects or automatically terminate every process already started.", "可在 Dashboard 撤销设备或 AI 客户端授权、关闭设备工具，或暂停/取消已保存 Task。账户 MCP Pause 会阻止已认证 MCP 调用。撤销访问不会撤回此前副作用，也不等于自动终止所有已启动进程。")],
      [tr("Can I undo everything the AI changes?", "AI 的所有修改都能撤销吗？"), tr("Local Undo can restore supported file-tool edits when enabled, using snapshots on that device. It does not roll back shell commands, Git operations, deleted files or external service actions. Review the requested work and its permissions before execution.", "开启 Local Undo 后，可用设备上的快照恢复受支持的文件工具修改。它不回滚 Shell 命令、Git 操作、文件删除或外部服务动作。执行前应核对请求的工作和权限。")],
    ] },
    { id: "tasks", title: tr("Tasks & availability", "任务与在线状态"), entries: [
      [tr("Does every request become a Task?", "每次请求都是一个 Task 吗？"), tr("No. File reads and short commands are ordinary tool calls. A Task saves work that should continue, wait for a condition or run later. Your AI can create it under your authorization; Dashboard is optional for inspecting and managing it.", "不是。读取文件和短命令属于普通工具调用。Task 保存需要持续推进、等待条件或稍后执行的工作。AI 可以在授权范围内创建，Dashboard 用于按需查看与管理。")],
      [tr("Can the AI keep working while I sleep?", "我睡觉后 AI 能继续工作吗？"), <>{tr("Saved deterministic Tasks can continue after the chat turn ends: long commands can be tracked, scheduled work can become due and condition watches can react to events. If the next step genuinely requires new AI judgment, ordinary Chat currently has no supported autonomous wake path through Remote Arc, so the task must wait for an active supported AI host.", "聊天轮次结束后，已保存的确定性 Task 仍可继续：长命令可以持续跟踪，定时任务可以到期执行，条件监听可以响应事件。如果下一步真正需要新的 AI 判断，普通 Chat 目前没有可由 Remote Arc 自主唤醒的受支持通道，因此任务必须等待可用的 AI 宿主。" )} <a href="/docs/long-running-work">{tr("See requirements", "查看运行条件")} →</a></>],
      [tr("What if the computer sleeps, disconnects or restarts?", "电脑睡眠、断网或重启后会怎样？"), tr("New local work waits while the device is unreachable. Durable progress remains, and recovery follows the saved policy after the OS session and agent reconnect. An old process handle is not restored. Optional task keep-awake can help an active computer stay awake; it cannot wake an offline device or start a powered-off computer.", "设备不可达时，新的本机操作等待。持久进度仍在，OS 用户会话与 Agent 重连后按保存策略恢复，不恢复旧进程句柄。可选任务保持唤醒能帮助运行中的电脑不休眠，但不能唤醒离线设备或启动已关机电脑。")],
    ] },
  ];
  const currentFaq = faqGroups[faqCategory] ?? faqGroups[0]!;

  return <div className="landingContent">
    <section className="landingWork sectionBlock" id="how-it-works">
      <header className="modernSectionIntro"><span className="eyebrow">{tr("FROM CHAT TO ACTION", "从 AI 对话到真实执行")}</span><h2>{tr("Watch your AI use real tools.", "看看 AI 如何真正动手。")}</h2><p>{tr("Choose a task, then watch the conversation, tool calls and results unfold side by side. This guided demo shows what Remote Arc makes possible on your own computer.", "选择一个任务，直观看到 AI 对话、工具调用和执行结果如何联动。通过引导式演示，了解 Remote Arc 如何让 AI 使用你电脑上的工具。")}</p></header>
      <LandingInteractiveDemo />
    </section>

    <section className="landingUnexpected sectionBlock" id="unexpected-workflows">
      <header className="modernSectionIntro">
        <span className="eyebrow">{tr("UNEXPECTED, BUT PRACTICAL", "想不到，但真能做到")}</span>
        <h2>{tr("Wait. My AI can do that on my computer?", "等等，AI 还能帮我干这些？")}</h2>
        <p>{tr("These workflows reuse software and files already on your own computer. Grant the necessary tools, review high-impact actions and check the real output.", "这些工作流直接利用你电脑上已有的软件与文件。你授予所需工具，审核高风险操作，最后检查真实产物。")}</p>
      </header>
      <div className="unexpectedGrid">
        <a className="unexpectedCard" href="/use-cases/presentation-deck"><span className="unexpectedSymbol" aria-hidden="true">▣</span><span className="eyebrow">{tr("DOCUMENTS → SLIDES", "资料 → PPT")}</span><h3>{tr("A folder of notes becomes an editable slide deck", "一文件夹资料，变成可编辑 PPT")}</h3><p>{tr("Generate a deck from local outlines and charts; validate the slides with your installed document tooling.", "用本地大纲与图表生成演示文稿，再利用已有文档工具检查页数。")}</p><span className="unexpectedLink">{tr("Explore slides", "了解 PPT 场景")} ↗</span></a>
        <a className="unexpectedCard" href="/use-cases/spreadsheet-report"><span className="unexpectedSymbol" aria-hidden="true">▦</span><span className="eyebrow">{tr("HUNDREDS OF FILES → EXCEL", "数百份文件 → EXCEL")}</span><h3>{tr("Turn scattered records into a checked workbook", "把零散数据汇总成可核验的 Excel")}</h3><p>{tr("Deduplicate local CSVs, build formulas and charts, and reconcile totals before presenting the result.", "批量整理本机 CSV、去重、创建公式与图表，并核对合计。")}</p><span className="unexpectedLink">{tr("Explore spreadsheets", "了解表格场景")} ↗</span></a>
        <a className="unexpectedCard" href="/use-cases/desktop-automation"><span className="unexpectedSymbol" aria-hidden="true">⌖</span><span className="eyebrow">{tr("LOCAL GUI SCRIPTS", "本机桌面脚本")}</span><h3>{tr("Automate the software that has no API", "没 API 的桌面软件，也能试着自动化")}</h3><p>{tr("Run a reviewed mouse-and-keyboard script through an authorized terminal, if the OS and desktop tools support it. No native mouse MCP yet.", "在系统支持且已授权的情况下，通过终端执行鼠标键盘脚本。目前尚无原生鼠标 MCP 工具。")}</p><span className="unexpectedLink">{tr("See the boundaries", "查看使用条件")} ↗</span></a>
        <a className="unexpectedCard" href="/use-cases/cross-device-handoff"><span className="unexpectedSymbol" aria-hidden="true">⇄</span><span className="eyebrow">{tr("WINDOWS + MAC", "WINDOWS + MAC")}</span><h3>{tr("One chat, two computers, independently verified", "一次对话，操作两台电脑分别验收")}</h3><p>{tr("Diagnose a Windows build and verify the same change on a connected Mac, with each device's own permissions.", "检查 Windows 上的构建，再到已连接的 Mac 上独立验证，权限各自管理。")}</p><span className="unexpectedLink">{tr("Explore multi-device work", "了解多设备场景")} ↗</span></a>
      </div>
      <p className="unexpectedDisclosure">{tr("These use existing file/terminal capabilities and user-installed applications, not built-in PPT, Excel or desktop-control MCP tools. Results require validation.", "以上依赖现有文件/终端能力与用户已安装的软件，不代表内置 PPT、Excel 或桌面控制 MCP 工具；实际结果仍需验收。")}</p>
    </section>

    <div className="sectionResourceLinks"><a href="/remote-mcp">{tr("New to Remote MCP? Read the practical guide", "初次接触 Remote MCP？查看实用指南")} →</a><a href="/docs/mcp">{tr("MCP technical reference", "MCP 技术参考")} →</a></div>

    <section className="landingSetup sectionBlock" id="connect-once">
      <header className="modernSectionIntro"><span className="eyebrow">{tr("BEYOND THE CONNECTION", "连接，只是开始")}</span><h2>{tr("More than an MCP server.", "不止是 MCP 服务器。")}<br /><span>{tr("Controlled access to your computers, with durable tasks.", "再加上可持久保存的确定性任务。")}</span></h2><p>{tr("MCP connects your AI to tools. Remote Arc brings those tools to your own computers, persists approved deterministic tasks, and gives you control over the access behind every action.", "MCP 让 AI 连接工具。Remote Arc 把工具带到你自己的电脑上，持久保存已授权的确定性任务，并让你掌控每次操作背后的权限。")}</p></header>
      <div className="platformCapabilities">
        <article><span className="platformCapabilityIndex">01 · {tr("CONNECT", "连接")}</span><h3>{tr("Your real working environment", "进入真实工作环境")}</h3><p>{tr("Reach your paired Windows, macOS and Linux computers from a compatible AI client. Work with the files, projects and tools already there.", "从兼容的 AI 客户端访问已配对的 Windows、macOS 和 Linux，使用已有文件、项目与工具。")}</p><div className="platformCapabilityTags"><span>{tr("Multiple devices", "多设备")}</span><span>{tr("OAuth access", "OAuth 授权")}</span></div><a href="/connect-ai">{tr("Connect your AI", "连接你的 AI")} →</a></article>
        <article><span className="platformCapabilityIndex">02 · {tr("EXECUTE", "执行")}</span><h3>{tr("Saved work that keeps moving", "保存任务，持续推进")}</h3><p>{tr("Track long commands and run approved work on timers or events. Task state persists across chat disconnects; fresh AI judgment is deliberately outside this production guarantee.", "跟踪长命令，并按时间或事件执行已授权工作。任务状态可跨聊天断开持久保存；新的 AI 判断不属于当前生产能力保证。")}</p><div className="platformCapabilityTags"><span>{tr("Tasks · Plus", "任务 · Plus")}</span><span>{tr("Progress & results", "进度与结果")}</span></div><a href="/docs/long-running-work">{tr("Explore task execution", "了解任务执行")} →</a></article>
        <article><span className="platformCapabilityIndex">03 · {tr("CONTROL", "掌控")}</span><h3>{tr("Authority stays with you", "权限始终由你掌控")}</h3><p>{tr("Choose tools and trusted write locations per device. Review write approvals, inspect activity, restore supported file edits and revoke access.", "按设备选择工具和可信写入区域，审批写入请求、查看活动、恢复受支持的文件修改，并随时撤销访问。")}</p><div className="platformCapabilityTags"><span>{tr("Device policies", "设备策略")}</span><span>Local Undo</span></div><a href="/security-model">{tr("Understand the boundaries", "了解执行边界")} →</a></article>
      </div>
    </section>

    <section className="landingGoals sectionBlock" id="bring-your-ai">
      <div className="goalIntro"><span className="eyebrow">{tr("BRING YOUR CHAT. GIVE IT REAL TOOLS.", "带上你的 AI 对话，接入真实工具。")}</span><h2>{tr("Turn your AI chat into a power tool.", "让你的 AI 对话，真正拥有动手能力。")}</h2><p>{tr("Keep the AI model and chat plan you already use. Remote Arc connects it to files, terminals and processes on your own computers — without a separate model API key or an additional model-token bill from Remote Arc.", "继续使用你熟悉的 AI 模型和聊天套餐。Remote Arc 将它连接到你自己电脑上的文件、终端与进程，不需要额外的模型 API Key，也不会向你另收模型 Token 费用。")}</p><div className="aiPowerBenefits"><span>{tr("No separate API key", "无须额外 API Key")}</span><span>{tr("Use your existing plan", "沿用现有聊天套餐")}</span><span>{tr("Better model, smarter tool use", "模型越强，工具使用越聪明")}</span></div><a href="/connect-ai">{tr("Connect your AI", "连接你的 AI")} →</a><span className="stagedFeature">{tr("YOUR MODEL THINKS · REMOTE ARC CONNECTS & EXECUTES", "你的模型负责思考 · REMOTE ARC 负责连接与执行")}</span></div>
      <LandingArchitectureDiagram />
    </section>

    <section className="landingControl sectionBlock" id="your-controls">
      <header className="modernSectionIntro"><span className="eyebrow">{tr("YOUR COMPUTER, YOUR CONTROLS", "你的电脑，由你控制")}</span><h2>{tr("Read broadly. Write narrowly. Approve the exception.", "读取可以灵活，写入保持克制，越界再审批。")}</h2><p>{tr("Remote Arc separates what AI may inspect from where it may make lasting changes. Ordinary non-sensitive files can stay readable, while persistent writes are limited to Trusted Write Locations or a temporary approval.", "Remote Arc 把“可以查看什么”和“可以长期修改哪里”分开。普通非敏感文件可以保持可读，持续写入只允许发生在可信写入区域或临时审批范围内。")}</p></header>
      <div className="permissionLevels"><article><span>01</span><h3>{tr("Read ordinary files", "读取普通文件")}</h3><p>{tr("Read-only tools can inspect ordinary non-sensitive files outside your write locations, so you do not have to permanently trust every folder you occasionally reference.", "只读工具可以查看可信写入区域之外的普通非敏感文件，不需要为了偶尔读取一个文件就永久信任整个目录。")}</p><code>{tr("READ VISIBILITY", "读取范围")}</code></article><article><span>02</span><h3>{tr("Trusted Write Locations", "可信写入区域")}</h3><p>{tr("Persistent file changes stay inside the folders you trust. Sensitive locations remain separately protected.", "持续文件修改只发生在你长期信任的目录内；敏感位置仍由独立策略保护。")}</p><code>{tr("TRUSTED WRITE", "可信写入")}</code></article><article><span>03</span><h3>{tr("Approve the exception", "审批临时越界")}</h3><p>{tr("A write outside those locations pauses before execution. Allow it once, allow the same file briefly, trust the folder, or deny it.", "写入超出这些区域时会在执行前暂停。你可以仅允许一次、短时允许同一文件、信任该目录，或直接拒绝。")}</p><code>{tr("BOUNDARY APPROVAL", "越界审批")}</code></article></div>
      <div className="controlDetails"><div><strong>{tr("Sensitive paths stay protected", "敏感路径保持独立保护")}</strong><p>{tr("Credential-bearing locations such as .ssh, .aws, browser profiles and environment files are not opened just because another folder is trusted. Narrow exceptions are explicit.", "像 .ssh、.aws、浏览器 Profile 与环境文件这类可能包含凭证的位置，不会因为其他目录被信任而自动开放；例外必须明确且尽量窄。")}</p></div><div><strong>{tr("Terminal is a separate high-risk capability", "终端是独立的高风险能力")}</strong><p>{tr("Trusted Write Locations are not an OS sandbox. Terminal commands run as the local OS user, so terminal access is enabled and audited separately.", "可信写入区域不是 OS 沙箱。终端命令仍以本机 OS 用户身份运行，因此终端权限会独立开启并单独审计。")}</p></div></div>
      <div className="safetyExample">
        <div className="safetyStory"><span className="eyebrow">SAFETY GUARD</span><h3>{tr("Room to work. Boundaries you set.", "让 AI 放手工作，边界由你设定。")}</h3><p>{tr("Give your AI permission to improve a project. Keep your private keys protected. Remote Arc checks file tools on the device against your tool permissions, trusted write locations and sensitive-path policy.", "让 AI 获准改进项目，同时保护你的私钥。Remote Arc 在设备上按工具权限、可信写入区域和敏感路径策略检查文件操作。")}</p><a className="safetyLearnLink" href="/security-model">{tr("See how access is controlled", "了解权限如何控制")} →</a><p className="safetyScope">{tr("Terminal access is a separate permission and runs as your OS user. These file-tool boundaries are not an OS sandbox.", "终端权限单独授予，并以你的 OS 用户身份运行。文件工具的访问边界不属于 OS 沙箱。")}</p></div>
        <figure className="safetyTerminal"><figcaption><span aria-hidden="true">● ● ●</span><span>{tr("Illustration · device policy checks", "示例 · 设备权限检查")}</span></figcaption><div className="safetyPolicyBody">
          <div className="safetyPolicyRequest allowed"><div><code>write_file</code><span>{tr("ALLOWED", "允许执行")}</span></div><code className="safetyPath">~/projects/site/src/App.tsx</code><p>{tr("File writing is enabled. This file is inside your trusted project folder.", "已开启文件写入，文件位于你的可信项目目录内。")}</p></div>
          <div className="safetyPolicyRequest blocked"><div><code>read_file</code><span>{tr("BLOCKED", "已拦截")}</span></div><code className="safetyPath">~/.ssh/id_ed25519</code><pre>Blocked by Remote Arc Sensitive Path Policy. Add a narrow sensitive-path exception for this device if you intentionally need access.</pre><p>{tr("The private key stays unread. Any exception must be explicitly configured by you.", "私钥未被读取。例外访问必须由你明确配置。")}</p></div>
        </div></figure>
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

    <section className="landingFinish sectionBlock"><div><span className="eyebrow">{tr("START WITH YOUR OWN COMPUTER", "从自己的电脑开始")}</span><h2>{tr("Bring your AI to the work already there.", "让 AI 进入已有的工作环境。")}</h2><p>{tr("Pair one device, start with the permissions you need and try a concrete request.", "配对一台设备、授予必要权限，再尝试一个具体请求。")}</p><div><a className="primaryButton" href="/install/chatgpt">{tr("Get started", "开始使用")} →</a><a href="/use-cases">{tr("Explore use cases", "浏览使用场景")} ↗</a></div></div><div className="finishCommand"><span>{tr("RUN ON YOUR COMPUTER", "在你的电脑上运行")}</span><code>npx remotelink</code><a href="https://github.com/yaohuangguan/remote-arc" target="_blank" rel="noreferrer">{tr("View source · Review security", "查看源码 · 审查安全性")} ↗</a><small>{tr("Source available under a proprietary license.", "源码公开可查阅，采用专有许可证。")} <a href="https://github.com/yaohuangguan/remote-arc/blob/master/LICENSE" target="_blank" rel="noreferrer">{tr("License", "许可证")} ↗</a></small></div></section>
  </div>;
}
