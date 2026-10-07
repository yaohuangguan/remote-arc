import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import "./landing-interactive-demo.css";

type DemoScenario = {
  id: string;
  label: string;
  request: string;
  result: string;
  permission: string;
  link: string;
};

type DemoEvent = {
  tool: string;
  arguments: string;
  output: string;
  duration: string;
};


type DemoClient = "ChatGPT" | "Claude" | "Cursor";

const clientLogo: Record<DemoClient, string> = {
  ChatGPT: "/demo-brands/chatgpt.svg",
  Claude: "/demo-brands/claude.svg",
  Cursor: "/demo-brands/cursor.svg",
};

type DemoGlyphName = "menu" | "new" | "share" | "dots" | "plus" | "mic" | "send" | "chevron" | "terminal" | "check" | "sidebar" | "paperclip" | "sparkle" | "search";

function DemoGlyph({ name, size = 18 }: { name: DemoGlyphName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {name === "menu" && <><path d="M4 7h16M4 12h16M4 17h16" /></>}
    {name === "new" && <><path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="m13 11 7-7 1 1-7 7-3 1 1-3z" /></>}
    {name === "share" && <><path d="M12 16V3m0 0-4 4m4-4 4 4" /><path d="M5 13v5a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-5" /></>}
    {name === "dots" && <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>}
    {name === "plus" && <path d="M12 5v14M5 12h14" />}
    {name === "mic" && <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" /></>}
    {name === "send" && <><path d="M12 19V5m0 0-6 6m6-6 6 6" /></>}
    {name === "chevron" && <path d="m6 9 6 6 6-6" />}
    {name === "terminal" && <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m7 9 3 3-3 3m6 0h4" /></>}
    {name === "check" && <path d="m5 12 4 4L19 6" />}
    {name === "sidebar" && <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>}
    {name === "paperclip" && <path d="m20 11-8 8a5 5 0 0 1-7-7l9-9a3 3 0 0 1 4 4l-9 9a1 1 0 0 1-2-2l8-8" />}
    {name === "sparkle" && <><path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z" /><path d="m19 18 .5 1.5L21 20l-1.5.5L19 22l-.5-1.5L17 20l1.5-.5L19 18Z" /></>}
    {name === "search" && <><circle cx="10" cy="10" r="6" /><path d="m14.5 14.5 6 6" /></>}
  </svg>;
}

function eventsFor(id: string, tr: (en: string, zh: string) => string): DemoEvent[] {
  switch (id) {
    case "job":
      return [
        { tool: "start_process", arguments: '{"command":"node export-report.js","background":true}', output: tr("process_id: proc_demo_01 · running", "process_id: proc_demo_01 · 运行中"), duration: "164ms" },
        { tool: "process_status", arguments: '{"process_id":"proc_demo_01"}', output: tr("status: exited · exit_code: 0", "状态：已结束 · 退出码：0"), duration: "19ms" },
        { tool: "get_file_info", arguments: '{"path":"~/reports/export.csv"}', output: tr("export.csv · file exists", "export.csv · 文件已生成"), duration: "12ms" },
      ];
    case "schedule":
      return [
        { tool: "list_devices", arguments: "{}", output: tr("home-server · available", "home-server · 可用"), duration: "24ms" },
        { tool: "create_automation", arguments: '{"device":"home-server","type":"schedule"}', output: tr("schedule saved · awaiting due time", "计划已保存 · 等待执行时间"), duration: "88ms" },
        { tool: "get_automation", arguments: '{"id":"example_schedule"}', output: tr("status: scheduled · no service restart", "状态：已计划 · 不重启服务"), duration: "16ms" },
      ];
    case "inspect":
      return [
        { tool: "list_processes", arguments: '{"device":"mini-pc"}', output: tr("node service found · pid 2048", "已找到 Node 服务 · pid 2048"), duration: "36ms" },
        { tool: "read_file", arguments: '{"path":"~/app/logs/server.log","length":80}', output: tr("Found repeated connection timeout warnings", "发现重复的连接超时警告"), duration: "27ms" },
        { tool: "get_file_info", arguments: '{"path":"~/app/logs/server.log"}', output: tr("Log readable · no files modified", "日志可读 · 未修改文件"), duration: "14ms" },
      ];
    default:
      return [
        { tool: "list_directory", arguments: '{"path":"~/projects/app"}', output: tr("14 entries · source and tests located", "14 项 · 已定位源代码与测试"), duration: "32ms" },
        { tool: "read_file", arguments: '{"path":"~/projects/app/src/format.ts"}', output: tr("84 lines read · failing edge case located", "已读取 84 行 · 定位边界条件"), duration: "21ms" },
        { tool: "edit_block", arguments: '{"path":"~/projects/app/src/format.ts"}', output: tr("1 replacement · local undo available", "完成 1 处替换 · 可本地撤销"), duration: "55ms" },
        { tool: "start_process", arguments: '{"command":"npm test","cwd":"~/projects/app"}', output: tr("PASS · 24 tests · exit_code: 0", "通过 · 24 项测试 · 退出码：0"), duration: "2.4s" },
      ];
  }
}

type DemoProgress = { working: string; done: string };

function progressFor(id: string, tr: (en: string, zh: string) => string): DemoProgress[] {
  switch (id) {
    case "job":
      return [
        { working: tr("Starting the report export…", "正在启动报表导出…"), done: tr("Report export started in the background.", "报表已在后台开始导出。") },
        { working: tr("Checking whether the process finished…", "正在检查进程是否完成…"), done: tr("The export process exited successfully.", "导出进程已成功结束。") },
        { working: tr("Verifying the output file…", "正在验证输出文件…"), done: tr("Confirmed that export.csv was created.", "已确认 export.csv 文件生成。") },
      ];
    case "schedule":
      return [
        { working: tr("Checking the available computer…", "正在检查可用电脑…"), done: tr("The home server is available.", "家庭服务器已就绪。") },
        { working: tr("Saving the health-check schedule…", "正在保存健康检查计划…"), done: tr("The health check is scheduled.", "健康检查任务已安排。") },
        { working: tr("Checking the saved task settings…", "正在核对已保存的任务…"), done: tr("Confirmed: status only, no service restart.", "已确认只检查状态，不会重启服务。") },
      ];
    case "inspect":
      return [
        { working: tr("Locating the running service…", "正在定位运行中的服务…"), done: tr("Found the running Node.js service.", "已找到正在运行的 Node.js 服务。") },
        { working: tr("Reading the recent server logs…", "正在读取最近的服务器日志…"), done: tr("Repeated connection timeouts appear in the logs.", "日志中出现了重复的连接超时。") },
        { working: tr("Confirming read-only access…", "正在确认只读操作…"), done: tr("Log inspection is complete; nothing was changed.", "日志检查完成，没有修改任何文件。") },
      ];
    default:
      return [
        { working: tr("Finding the relevant files and tests…", "正在定位相关代码和测试…"), done: tr("Located the source file and its tests.", "找到了目标源文件和相关测试。") },
        { working: tr("Checking the failing edge case…", "正在检查失败的边界情况…"), done: tr("Identified the formatting edge case.", "定位了格式化逻辑中的边界问题。") },
        { working: tr("Applying a focused, reversible fix…", "正在进行可撤销的针对性修改…"), done: tr("Updated the formatter; local undo is available.", "已修复格式化逻辑，支持本地撤销。") },
        { working: tr("Running the test suite…", "正在运行测试套件…"), done: tr("All 24 tests passed.", "24 项测试全部通过。") },
      ];
  }
}

export function InteractiveWorkDemo({ scenarios }: { scenarios: readonly DemoScenario[] }) {
  const { tr } = useI18n();
  const [selected, setSelected] = useState(0);
  const [step, setStep] = useState(-1);
  const [client, setClient] = useState<DemoClient>("ChatGPT");
  const demoRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const events = eventsFor(scenarios[selected]?.id ?? "code", tr);
  const scenario = scenarios[selected] ?? scenarios[0];
  const finished = step >= events.length * 2 + 1;
  const active = step >= 0 && !finished;

  useEffect(() => {
    if (step < 0 || finished) return;
    const delay = step === 0 ? 800 : step % 2 === 1 ? 580 : 430;
    const timer = window.setTimeout(() => setStep((previous) => previous + 1), delay);
    return () => window.clearTimeout(timer);
  }, [step, selected, finished]);

  useEffect(() => {
    const container = demoRef.current;
    if (!container || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setStep((current) => current === -1 ? 0 : current);
        observer.disconnect();
      }
    }, { threshold: 0.35 });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [step, selected]);

  if (!scenario) return null;

  const finalReply = scenarios[selected]?.id === "code"
    ? tr("I fixed the formatting edge case and reran the tests: 24 passed. The diff is ready for review.", "我修复了格式化的边界问题并重新运行测试：24 项全部通过。修改内容已准备好供你检查。")
    : scenarios[selected]?.id === "inspect"
      ? tr("The logs point to repeated connection timeouts. I haven't changed any files or restarted the service.", "日志显示反复发生连接超时。我没有修改任何文件，也没有重启服务。")
      : scenarios[selected]?.id === "schedule"
        ? tr("The health check is scheduled. It will collect status only; no service restart is included.", "健康检查已安排，届时只采集状态，不包含重启服务。")
        : tr("The export finished successfully. The result and task status are available to inspect when you return.", "报表导出已成功完成，稍后回来可以查看结果与任务状态。");

  const pickScenario = (index: number) => {
    setSelected(index);
    setStep(0);
  };

  const progress = progressFor(scenario.id, tr);
  const progressIndex = Math.min(progress.length - 1, Math.max(0, Math.floor(step / 2)));
  const progressTitle = finished
    ? tr("Finished working on your request", "已完成本次任务")
    : step < 1
      ? tr("Thinking through the next steps…", "正在规划执行步骤…")
      : step >= progress.length * 2
        ? tr("Preparing the result…", "正在整理执行结果…")
        : progress[progressIndex]?.working ?? tr("Working on your request…", "正在执行任务…");
  const prompt = scenario.request.replace(/^“|”$/g, "");

  return (
    <div className="homeDemo" ref={demoRef}>
      <div className="homeDemoToolbar">
        <div className="homeDemoExamples" aria-label={tr("Try an example request", "选择示例任务")}>
          {scenarios.map((example, index) => (
            <button key={example.id} type="button" className={index === selected ? "active" : ""}
              aria-pressed={index === selected} onClick={() => pickScenario(index)}>{example.label}</button>
          ))}
        </div>
        <div className="homeDemoClientSwitch" aria-label={tr("Preview the conversation in an AI client", "切换 AI 客户端界面")}>
          <span>{tr("CHAT VIEW", "对话界面")}</span>
          {(["ChatGPT", "Claude", "Cursor"] as const).map((name) => (
            <button type="button" key={name} className={"homeDemoClientTab--" + name.toLowerCase()} aria-pressed={name === client} onClick={() => setClient(name)}>
              <img src={clientLogo[name]} alt="" />{name}
            </button>
          ))}
        </div>
      </div>

      <div className="homeDemoSurface">
        <section className={"homeDemoChat homeDemoChat--" + client.toLowerCase()} aria-label={tr("Example conversation in " + client, client + " 对话示例")}>
          {client !== "Cursor" && <aside className="homeDemoChatRail" aria-hidden="true">
            <div className="homeDemoRailTop"><DemoGlyph name="sidebar" size={19} /><DemoGlyph name="new" size={19} /></div>
            <div className="homeDemoRailBottom"><span className="homeDemoRailAvatar">S</span></div>
          </aside>}
          <div className="homeDemoChatMain">
            <header className="homeDemoChatChrome">
              {client === "ChatGPT" && <>
                <div className="homeDemoBrandTitle"><img src={clientLogo.ChatGPT} alt="" /><strong>ChatGPT</strong><DemoGlyph name="chevron" size={14} /></div>
                <div className="homeDemoChromeActions"><DemoGlyph name="share" size={17} /><DemoGlyph name="dots" size={19} /></div>
              </>}
              {client === "Claude" && <>
                <div className="homeDemoBrandTitle"><img src={clientLogo.Claude} alt="" /><strong>Claude</strong></div>
                <div className="homeDemoClaudeNav"><span className="selected">Chat</span><span>Cowork</span><span>Code</span></div>
              </>}
              {client === "Cursor" && <>
                <div className="homeDemoCursorWindow"><span /><span /><span /></div>
                <div className="homeDemoCursorTab"><img src={clientLogo.Cursor} alt="" /><span>Agent</span><DemoGlyph name="chevron" size={12} /></div>
                <div className="homeDemoChromeActions"><DemoGlyph name="new" size={16} /><DemoGlyph name="dots" size={17} /></div>
              </>}
            </header>

            <div className="homeDemoChatBody">
              {client === "Cursor" && <div className="homeDemoCursorContext"><DemoGlyph name="sidebar" size={14} /><span>{tr("New chat", "新对话")}</span><span className="homeDemoCursorContextModel">Auto</span></div>}
              <div className="homeDemoUserBubble">{prompt}</div>

              {step >= 0 && <div className="homeDemoAssistant">
                {client === "Claude" && <img className="homeDemoAssistantLogo" src={clientLogo.Claude} alt="" />}
                {client === "Cursor" && <div className="homeDemoCursorAgent"><DemoGlyph name="sparkle" size={15} /><strong>Agent</strong><span>· Auto</span></div>}
                {client !== "Cursor" && <p className="homeDemoAssistantIntro">
                  {tr("I'll use Remote Arc to check this on your computer.", "我会通过 Remote Arc 在你的电脑上检查并处理。")}
                </p>}
                <div className="homeDemoActivity" aria-live="polite" aria-atomic="false">
                  <header className="homeDemoActivityHeader">
                    <img src="/remote-arc-app-icon.svg" alt="" className="homeDemoActivityLogo" />
                    <div className="homeDemoActivityHeading">
                      <span>Remote Arc</span>
                      <strong>{progressTitle}</strong>
                    </div>
                    {finished ? <span className="homeDemoActivityCheck"><DemoGlyph name="check" size={15} /></span> : <span className="homeDemoMiniSpinner" aria-label={tr("Working", "正在执行")} />}
                  </header>
                  {step > 0 && <ol className="homeDemoProgressList">
                    {progress.map((part, index) => {
                      const started = step >= index * 2 + 1;
                      const done = step >= index * 2 + 2;
                      if (!started) return null;
                      return <li key={index} className={done ? "homeDemoProgressDone" : "homeDemoProgressCurrent"}>
                        <span className="homeDemoProgressMarker">{done ? <DemoGlyph name="check" size={11} /> : <span className="homeDemoProgressPulse" />}</span>
                        <span>{done ? part.done : part.working}</span>
                      </li>;
                    })}
                  </ol>}
                </div>
                {finished ? <>
                  <p className="homeDemoAssistantAnswer">{finalReply}</p>
                  <div className="homeDemoMessageTools" aria-hidden="true"><DemoGlyph name="paperclip" size={14} /><DemoGlyph name="share" size={14} /><DemoGlyph name="dots" size={16} /></div>
                </> : null}
              </div>}
            </div>

            <div className="homeDemoComposer">
              {client === "ChatGPT" && <div className="homeDemoComposerBox">
                <div className="homeDemoComposerPlaceholder">{tr("Ask anything", "有问题，尽管问")}</div>
                <div className="homeDemoComposerRow">
                  <span className="homeDemoComposerRound"><DemoGlyph name="plus" size={19} /></span>
                  <span className="homeDemoComposerTools"><DemoGlyph name="sparkle" size={16} />{tr("Tools", "工具")}</span>
                  <span className="homeDemoComposerSpacer" />
                  <DemoGlyph name="mic" size={19} />
                  <span className="homeDemoComposerSend"><DemoGlyph name="send" size={18} /></span>
                </div>
              </div>}
              {client === "Claude" && <div className="homeDemoComposerBox">
                <div className="homeDemoComposerPlaceholder">{tr("Reply to Claude…", "回复 Claude…")}</div>
                <div className="homeDemoComposerRow">
                  <DemoGlyph name="plus" size={20} /><span className="homeDemoComposerSpacer" />
                  <span className="homeDemoClaudeModel">Sonnet 4.6 <DemoGlyph name="chevron" size={13} /></span>
                  <span className="homeDemoComposerSend"><DemoGlyph name="send" size={18} /></span>
                </div>
              </div>}
              {client === "Cursor" && <div className="homeDemoComposerBox">
                <div className="homeDemoCursorAddContext"><DemoGlyph name="plus" size={13} /> {tr("Add context", "添加上下文")}</div>
                <div className="homeDemoComposerPlaceholder">{tr("Plan, search, build anything", "规划、搜索、构建任何内容")}</div>
                <div className="homeDemoComposerRow">
                  <span className="homeDemoCursorMode">∞ {tr("Agent", "智能体")} <DemoGlyph name="chevron" size={12} /></span>
                  <span className="homeDemoCursorModel">Auto <DemoGlyph name="chevron" size={12} /></span>
                  <span className="homeDemoComposerSpacer" />
                  <DemoGlyph name="paperclip" size={16} />
                  <span className="homeDemoComposerSend"><DemoGlyph name="send" size={16} /></span>
                </div>
              </div>}
              <span className="homeDemoComposerDisclaimer">{client === "Cursor" ? tr("AI-generated code may contain errors.", "AI 生成的代码可能有误。") : client === "Claude" ? tr("Claude can make mistakes. Please double-check responses.", "Claude 可能出错，请核实回复。") : tr("ChatGPT can make mistakes. Check important info.", "ChatGPT 也可能出错。请核查重要信息。")}</span>
            </div>
          </div>
        </section>

        <section className="homeDemoTerminal" aria-label={tr("Example device execution log", "示例设备执行日志")}>
          <header className="homeDemoTerminalHeader">
            <div className="homeDemoTerminalDots" aria-hidden="true"><i /><i /><i /></div>
            <span>Remote Arc <b>/</b> {tr("device activity", "设备活动")}</span>
            <span className="homeDemoTerminalDevice"><i aria-hidden="true" />{tr("example-workstation", "示例工作站")}</span>
          </header>
          <div className="homeDemoTerminalBody" ref={terminalRef} role="log" aria-label={tr("Simulated tool call sequence", "模拟工具调用序列")}>
            <div className="homeDemoTerminalBanner">
              <span className="homeDemoMonoAccent">remote-arc</span>
              <span>{tr(" · local execution", " · 本地执行")}</span>
            </div>
            <div className="homeDemoTerminalInfo">✓ {tr("Secure MCP connection ready", "安全 MCP 连接已就绪")}</div>
            {step < 0 && <p className="homeDemoTerminalWaiting">{tr("Waiting for a request from your chat…", "等待来自 AI 对话的请求…")}</p>}
            {step >= 0 && (
              <div className="homeDemoTraceLine"><span className="homeDemoTraceTime">00:00</span><span className="homeDemoTraceEvent">request</span><code>{tr("Device policy checked · approved tools", "已检查设备策略 · 已授权工具")}</code></div>
            )}
            {events.map((event, index) => {
              const showCall = step >= index * 2 + 1;
              const showResult = step >= index * 2 + 2;
              return showCall ? <React.Fragment key={event.tool + index}>
                <div className="homeDemoTraceLine"><span className="homeDemoTraceTime">{`00:${String(index * 2 + 1).padStart(2, "0")}`}</span><span className="homeDemoTraceEvent">tool.call</span><code>{event.tool}</code></div>
                <div className="homeDemoTraceArgs"><code>{event.arguments}</code></div>
                {showResult && <div className="homeDemoTraceLine homeDemoTraceResult"><span className="homeDemoTraceTime">{`00:${String(index * 2 + 2).padStart(2, "0")}`}</span><span className="homeDemoTraceSuccess">tool.done</span><code>{event.output} <small>· {event.duration}</small></code></div>}
              </React.Fragment> : null;
            })}
            {finished && <div className="homeDemoTerminalFinished">✓ {tr("Execution complete · response delivered", "执行完成 · 已返回结果")}</div>}
            {active && <span className="homeDemoTerminalCursor" aria-hidden="true">▌</span>}
          </div>
          <footer className="homeDemoTerminalFooter">
            <span>{tr("Permission", "所需权限")}: {scenario.permission}</span>
            <span>{finished ? tr("Complete", "已完成") : active ? tr("Executing", "执行中") : tr("Ready", "就绪")}</span>
          </footer>
        </section>
      </div>

      <div className="homeDemoUnder">
        <p>{tr("Guided simulation with example data. No real device is connected and no commands are executed.", "使用示例数据的引导式模拟，不会连接真实设备，也不会执行命令。")}</p>
        <a href={"/use-cases/" + scenario.link}>{tr("Explore this workflow", "了解这类工作流程")} ↗</a>
      </div>
    </div>
  );
}
