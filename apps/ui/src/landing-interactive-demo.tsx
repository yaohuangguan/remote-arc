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

export function InteractiveWorkDemo({ scenarios }: { scenarios: readonly DemoScenario[] }) {
  const { tr } = useI18n();
  const [selected, setSelected] = useState(0);
  const [step, setStep] = useState(-1);
  const [client, setClient] = useState<"ChatGPT" | "Claude">("ChatGPT");
  const demoRef = useRef<HTMLDivElement>(null);
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

  if (!scenario) return null;

  const pickScenario = (index: number) => {
    setSelected(index);
    setStep(0);
  };

  return (
    <div className="homeDemo" ref={demoRef}>
      <div className="homeDemoToolbar">
        <div className="homeDemoExamples" aria-label={tr("Try an example request", "选择演示任务")}>
          {scenarios.map((example, index) => (
            <button
              key={example.id}
              type="button"
              className={index === selected ? "active" : ""}
              aria-pressed={index === selected}
              onClick={() => pickScenario(index)}
            >{example.label}</button>
          ))}
        </div>
        <span className="homeDemoMode"><i aria-hidden="true" />{tr("INTERACTIVE DEMO", "互动演示")}</span>
      </div>

      <div className="homeDemoSurface">
        <section className="homeDemoChat" aria-label={tr("Example AI chat", "AI 对话示例")}>
          <header className="homeDemoPanelHeader">
            <div className="homeDemoAppMark"><span aria-hidden="true">✳</span><div><strong>{client}</strong><small>{tr("Connected to Remote Arc", "已连接 Remote Arc")}</small></div></div>
            <div className="homeDemoClientSelect" aria-label={tr("Choose example AI client", "选择示例 AI 客户端")}>
              {(["ChatGPT", "Claude"] as const).map((name) => (
                <button type="button" key={name} aria-pressed={name === client} onClick={() => setClient(name)}>{name}</button>
              ))}
            </div>
          </header>
          <div className="homeDemoChatBody">
            <div className="homeDemoChatStarter">{tr("You ask. Remote Arc gives your AI access to real tools.", "你说出需求，Remote Arc 为 AI 提供真实工具。")}</div>
            <div className="homeDemoUserBubble">{scenario.request.replace(/^“|”$/g, "")}</div>
            {step < 0 ? (
              <div className="homeDemoAssistantHint">{tr("Send this example to see the tool calls.", "发送这个示例，看看工具如何执行。")}</div>
            ) : (
              <div className="homeDemoAssistant">
                <span className="homeDemoAssistantSymbol">✳</span>
                <div>
                  <strong>{finished ? tr("Task completed", "任务完成") : tr("Working with Remote Arc…", "正在通过 Remote Arc 执行…")}</strong>
                  {finished ? <p>{scenario.result.replace(/^“|”$/g, "")}</p> :
                    <p>{tr("Calling approved tools on the example computer.", "正在示例电脑上调用已授权的工具。")}</p>}
                  {finished && <div className="homeDemoComplete">✓ {tr("Results returned to this chat", "结果已返回 AI 对话")}</div>}
                </div>
              </div>
            )}
          </div>
          <div className="homeDemoComposer">
            <span>{tr("Example request", "示例请求")}</span>
            <button type="button" disabled={active} onClick={() => setStep(0)}>
              {step < 0 ? tr("Send request", "发送请求") : finished ? tr("Replay", "重新演示") : tr("Running…", "执行中…")}
              <span aria-hidden="true"> ↗</span>
            </button>
          </div>
        </section>

        <section className="homeDemoTerminal" aria-label={tr("Example device execution log", "示例设备执行日志")}>
          <header className="homeDemoTerminalHeader">
            <div className="homeDemoTerminalDots" aria-hidden="true"><i /><i /><i /></div>
            <span>Remote Arc <b>/</b> {tr("device activity", "设备活动")}</span>
            <span className="homeDemoTerminalDevice"><i aria-hidden="true" />{tr("example-workstation", "示例工作站")}</span>
          </header>
          <div className="homeDemoTerminalBody" role="log" aria-label={tr("Simulated tool call sequence", "模拟工具调用序列")}>
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
