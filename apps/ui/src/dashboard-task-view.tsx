import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import type { PlannedProgress } from "./planned-goal-view.js";
const PlannedGoalProgress = React.lazy(() => import("./planned-goal-view.js").then(module => ({ default: module.PlannedGoalProgress })));

type Task = {
  id: string;
  status: string;
  state_json: string | null;
  created_at: string;
  last_run_at: string | null;
  expires_at: string | null;
  interval_seconds: number;
  last_error: string | null;
};
type Progress = {
  planned?: PlannedProgress;
  phase?: string;
  process_id?: string;
  agent?: {
    iteration?: number;
    last_decision_summary?: string;
    completion_evidence?: string;
    observation?: string;
  };
};
type Run = {
  id: string;
  attempt: number;
  status: string;
  exit_code: number | null;
  output_summary: string | null;
  error: string | null;
  started_at: string;
};

export function taskProgress(task: Pick<Task, "state_json">): Progress {
  try { return (JSON.parse(task.state_json || "{}") || {}) as Progress; }
  catch { return {}; }
}

export function taskNeedsAgent(task: Pick<Task, "state_json" | "status">) {
  return task.status === "waiting_for_event" && ["awaiting_agent", "needs_reasoning"].includes(taskProgress(task).phase || "");
}

export function taskNeedsAttention(task: Pick<Task, "state_json" | "status">) {
  return taskNeedsAgent(task) || ["waiting_for_device", "failed", "expired"].includes(task.status);
}

export function TaskResults({ task, referenceControl }: { task: Task; referenceControl?: React.ReactNode }) {
  const { tr, locale } = useI18n();
  const linked = new URLSearchParams(location.search).get("task") === task.id;
  const [open, setOpen] = useState(linked);
  const details = useRef<HTMLDetailsElement>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const progress = taskProgress(task);
  useEffect(() => {
    if (!linked) return;
    const frame = requestAnimationFrame(() => details.current?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [linked]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let fetching = false;
    async function load() {
      if (fetching) return;
      fetching = true;
      try {
        const response = await fetch("/api/automations/" + encodeURIComponent(task.id), { signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json() as { runs?: Run[] };
        if (!controller.signal.aborted) {
          setRuns(Array.isArray(data.runs) ? data.runs.slice(0, 10) : []);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally { fetching = false; }
    }
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [open, task.id, retry]);

  const timestamp = (value: string | null) => value
    ? new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US") : "—";
  const phaseLabel = ["awaiting_agent", "needs_reasoning"].includes(progress.phase || "") ? tr("Waiting for the source AI", "等待来源 AI 决策")
    : task.status === "waiting_for_device" ? tr("Waiting for the computer to reconnect", "等待电脑重新连接")
    : task.status === "waiting_for_event" ? tr("Waiting for a matching event", "等待匹配事件")
    : task.status === "paused" ? tr("Task paused", "任务已暂停")
    : progress.phase === "agent_verify_running" || progress.phase === "goal_running" ? tr("Verifying the result", "正在验证结果")
    : progress.phase === "agent_process_running" || progress.phase === "step_running" ? tr("Command in progress", "命令执行中")
    : tr("Ready for the next step", "等待下一步");

  return (
    <details ref={details} open={open} className="automationDetails" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{tr("Progress & results", "进度与结果")}<span aria-hidden="true">›</span></summary>
      <div className="taskResultsBody">
        <div className="taskChatReference"><strong>{tr("This task's chat reference", "这条任务的聊天引用")}</strong><code>{task.id}</code>{referenceControl}<p>{tr("Paste the reference into your connected AI chat to read this task's saved progress. It is the same task shown here.", "将引用粘贴到已连接的 AI 聊天中，即可读取这条任务保存的进度。聊天与这里管理的是同一条任务。")}</p></div>
        {progress.planned && <React.Suspense fallback={<p role="status">{tr("Loading saved plan…", "正在加载保存的计划…")}</p>}><PlannedGoalProgress value={progress.planned} expiresAt={task.expires_at} /></React.Suspense>}
        {!['completed', 'failed', 'cancelled', 'expired'].includes(task.status) && (
          <div className="taskProgressPanel">
            <strong>{phaseLabel}</strong>
            {progress.agent && <span>{tr("Planning turn", "规划轮次")} {progress.agent.iteration || 0}</span>}
            {progress.agent?.last_decision_summary && <p>{progress.agent.last_decision_summary}</p>}
            {taskNeedsAgent(task) && <p>{tr("Return to the AI client that created this goal. It must read the latest context and submit the next decision. Automatic continuation depends on that client's runtime and event support.", "回到创建目标的 AI 客户端，读取最新进度并提交下一步决策。能否自动继续取决于该客户端的运行时和事件支持。")}</p>}
          </div>
        )}
        {progress.agent?.completion_evidence && <div className="taskEvidence"><strong>{tr("Completion evidence", "完成证据")}</strong><p>{progress.agent.completion_evidence}</p></div>}
        <div className="automationDetailGrid">
          <div><span>{tr("Created", "创建时间")}</span><strong>{timestamp(task.created_at)}</strong></div>
          <div><span>{tr("Last run", "上次执行")}</span><strong>{timestamp(task.last_run_at)}</strong></div>
          <div><span>{tr("Expires", "到期时间")}</span><strong>{task.expires_at ? timestamp(task.expires_at) : tr("No expiry", "未设置")}</strong></div>
          <div><span>{tr("Check interval", "检查间隔")}</span><strong>{Math.round(task.interval_seconds / 60)} {tr("min", "分钟")}</strong></div>
        </div>
        {task.last_error && <p className="automationLastError">{task.last_error}</p>}
        <div className="taskRunHistory" aria-busy={open && runs === null && !error}>
          <h3>{tr("Recent runs", "最近执行")}</h3>
          {error && <p role="status">{tr("Run history could not be loaded.", "执行记录加载失败。 ")} <button className="ghostButton" onClick={() => setRetry((value) => value + 1)}>{tr("Retry", "重试")}</button></p>}
          {open && runs === null && !error && <p role="status">{tr("Loading results…", "正在加载结果…")}</p>}
          {runs?.length === 0 && <p>{tr("Results appear here when the first run starts.", "第一次执行开始后，结果会显示在这里。")}</p>}
          {runs?.map((run) => (
            <details className="taskRun" key={run.id}>
              <summary>
                <strong>{tr("Run", "执行")} {run.attempt}</strong>
                <span>{run.status === "completed" ? tr("Completed", "已完成") : run.status === "running" ? tr("Running", "运行中") : run.status === "failed" ? tr("Failed", "失败") : run.status === "cancelled" ? tr("Cancelled", "已取消") : run.status}</span>
                <time dateTime={run.started_at}>{timestamp(run.started_at)}</time>
                {run.exit_code !== null && <span>{tr("Exit", "退出码")} {run.exit_code}</span>}
              </summary>
              {run.error && <p className="automationLastError">{run.error}</p>}
              {run.output_summary ? <pre>{run.output_summary.slice(0, 12000)}</pre> : <p>{tr("No output recorded yet.", "暂时没有输出记录。")}</p>}
            </details>
          ))}
        </div>
        <p className="automationDetailNote"><a href="/docs/long-running-work">{tr("Understand task recovery and completion checks", "了解任务恢复与完成验收")} →</a></p>
      </div>
    </details>
  );
}
