export const UI_PREVIEW = import.meta.env.VITE_UI_PREVIEW === "1";

const previewNow = () => new Date().toISOString();
const previewAgo = (milliseconds: number) => new Date(Date.now() - milliseconds).toISOString();

export function installUiPreviewFetchMock(mcpEndpoint: string) {
  if (!UI_PREVIEW || typeof window === "undefined") return;

  const nativeFetch = window.fetch.bind(window);
  const tools = [
    "list_directory",
    "read_file",
    "get_file_info",
    "list_processes",
    "write_file",
    "edit_block",
    "undo_last_change",
    "start_process",
    "process_status",
    "process_output",
    "stop_process",
  ];

  const devices = [
    {
      id: "preview-mac",
      name: "Personal Mac",
      platform: "darwin",
      arch: "arm64",
      hostname: "Sam-Mac",
      created_at: previewAgo(21 * 86400000),
      last_seen: previewAgo(18000),
      status: "online",
      tools,
      available_tools: tools,
      allowed_tools: tools,
      workspace_roots: ["/Users/sam/work"],
      sensitive_paths: ["~/.ssh", "~/.aws", "~/.gnupg"],
      sensitive_allow_paths: [],
      protect_sensitive_paths: true,
      undo_enabled: true,
      policy_enforcement_available: true,
      undo_history_available: true,
      background_agent_available: true,
      background_enabled: true,
      background_service: "launchd",
      background_seen_at: previewAgo(18000),
      automation_permissions: { background_tasks: true, scheduled_tasks: true, adaptive_agent: true, source_agent: true, keep_awake: true },
      keep_awake_available: true,
    },
    {
      id: "preview-win",
      name: "Desktop PC",
      platform: "win32",
      arch: "x64",
      hostname: "SamPC",
      created_at: previewAgo(35 * 86400000),
      last_seen: previewAgo(4 * 3600000),
      status: "offline",
      tools,
      available_tools: tools,
      allowed_tools: ["list_directory", "read_file", "get_file_info", "list_processes"],
      workspace_roots: ["C:\\Users\\Sam\\work"],
      sensitive_paths: [],
      sensitive_allow_paths: [],
      protect_sensitive_paths: true,
      undo_enabled: true,
      policy_enforcement_available: true,
      undo_history_available: true,
      background_agent_available: true,
      background_enabled: false,
      background_service: "schtasks",
      background_seen_at: previewAgo(4 * 3600000),
      automation_permissions: { background_tasks: true, scheduled_tasks: true, adaptive_agent: false, source_agent: false, keep_awake: false },
      keep_awake_available: false,
    },
  ];

  const baseAutomations = [
    {
      id: "preview-goal",
      user_id: "preview-user",
      name: "Stabilize overnight integration tests",
      kind: "goal_loop",
      status: "running",
      device_id: "preview-mac",
      trigger_json: JSON.stringify({ type: "immediate" }),
      action_json: JSON.stringify({ steps: [{ type: "device_command", command: "pnpm test:integration", cwd: "/Users/sam/work/remote-arc" }] }),
      goal_json: JSON.stringify({ type: "command_exit", command: "pnpm test:integration", cwd: "/Users/sam/work/remote-arc", expected_exit_code: 0 }),
      state_json: JSON.stringify({ phase: "step_running" }),
      interval_seconds: 300,
      next_run_at: new Date(Date.now() + 4 * 60000).toISOString(),
      expires_at: new Date(Date.now() + 11 * 3600000).toISOString(),
      max_runs: 0,
      run_count: 3,
      last_run_at: previewAgo(12 * 60000),
      last_error: null,
      created_at: previewAgo(2 * 3600000),
      updated_at: previewAgo(20000),
    },
    {
      id: "preview-ci",
      user_id: "preview-user",
      name: "Merge after CI passes",
      kind: "condition_watch",
      status: "waiting_for_event",
      device_id: "preview-mac",
      trigger_json: JSON.stringify({ type: "webhook", source: "github", event: "workflow_run", match: { "workflow_run.name": "CI", "workflow_run.conclusion": "success" } }),
      action_json: JSON.stringify({ steps: [{ type: "device_command", command: "gh pr merge 52 --merge", cwd: "/Users/sam/work/remote-arc" }] }),
      goal_json: null,
      state_json: JSON.stringify({ phase: "idle" }),
      interval_seconds: 300,
      next_run_at: null,
      expires_at: null,
      max_runs: 1,
      run_count: 0,
      last_run_at: null,
      last_error: null,
      created_at: previewAgo(45 * 60000),
      updated_at: previewAgo(45 * 60000),
    },
    {
      id: "preview-offline",
      user_id: "preview-user",
      name: "Nightly build",
      kind: "schedule_watch",
      status: "waiting_for_device",
      device_id: "preview-win",
      trigger_json: JSON.stringify({ type: "interval", every_seconds: 86400 }),
      action_json: JSON.stringify({ steps: [{ type: "device_command", command: "pnpm build" }] }),
      goal_json: null,
      state_json: JSON.stringify({ phase: "idle" }),
      interval_seconds: 300,
      next_run_at: null,
      expires_at: null,
      max_runs: 0,
      run_count: 5,
      last_run_at: previewAgo(22 * 3600000),
      last_error: "Device offline; the task will resume automatically after reconnect.",
      created_at: previewAgo(6 * 86400000),
      updated_at: previewAgo(20 * 60000),
    },
  ];

  const automations = [...baseAutomations, {
    ...baseAutomations[0]!,
    id: "preview-planned",
    name: "Improve the project until morning",
    kind: "goal_loop",
    status: "waiting_for_event",
    goal_json: JSON.stringify({ type: "agent_goal", controller: "source" }),
    state_json: JSON.stringify({ phase: "needs_reasoning", agent: { iteration: 8, last_decision_summary: "Independent validation passed. Next architectural choice needs source reasoning." }, planned: {
      started_at: previewAgo(55 * 60000), active_phase: "foundation", needs_reasoning: "Tests revealed a new architecture decision. Candidate is preserved; the next chat turn can inspect saved context.",
      plan: { phases: [{ id: "website", objective: "Verify the website" }, { id: "foundation", objective: "Investigate the foundation" }, { id: "next", objective: "Implement the dependent feature" }], time_policy: { max_duration_seconds: 8 * 3600 } },
      outcomes: [{ id: "website", outcome: "completed", spent_seconds: 900, evidence: "Website tests and build passed.", remaining_work: "", checkpoint: "example-green-checkpoint" }],
      green_frontier: { checkpoint: "example-green-checkpoint", at: previewAgo(40 * 60000) }, candidate: { status: "working", path: "/Users/sam/work/project/.remotearc-goals/example/candidate-0" },
      workspace: { path: "/Users/sam/work/project/.remotearc-goals/example/candidate-0" }, checks: [{ name: "typecheck", passed: true, exit_code: 0, evidence: "Example: exit code 0" }, { name: "tests", passed: true, exit_code: 0, evidence: "Example: focused tests passed" }], rejected: [],
    } }),
    next_run_at: new Date(Date.now() + 7 * 3600000).toISOString(),
    updated_at: previewAgo(20000),
  }, {
    ...baseAutomations[0]!,
    id: "preview-source",
    name: "Investigate intermittent test failures",
    kind: "goal_loop",
    status: "waiting_for_event",
    goal_json: JSON.stringify({ type: "agent_goal", controller: "source", objective: "Find the cause and verify the fix.", success_criteria: "The previously failing test passes.", allowed_tools: ["read_file", "start_process"] }),
    state_json: JSON.stringify({ phase: "awaiting_agent", agent: { iteration: 4, last_decision_summary: "Reproduced the failure; inspect the affected module next." } }),
    run_count: 1,
    next_run_at: null,
    updated_at: previewAgo(60000),
  }, {
    ...baseAutomations[0]!,
    id: "preview-completed",
    name: "Verify release build",
    status: "completed",
    goal_json: JSON.stringify({ type: "agent_goal", controller: "hosted" }),
    state_json: JSON.stringify({ phase: "idle", agent: { iteration: 6, completion_evidence: "Typecheck and integration tests passed. The release build exited with code 0." } }),
    run_count: 1,
    next_run_at: null,
    updated_at: previewAgo(10 * 60000),
  }];

  const json = (value: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(raw, location.origin);

    if (
      url.origin !== location.origin ||
      (!url.pathname.startsWith("/api/") && url.pathname !== "/auth/logout")
    ) {
      return nativeFetch(input, init);
    }

    const method = (
      init?.method ||
      (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET")
    ).toUpperCase();

    if (method !== "GET") {
      return json(
        { error: "PR Preview is read-only. This action is not connected to production." },
        403,
      );
    }

    if (url.pathname === "/api/me") {
      return json({
        user: {
          id: "preview-user",
          email: "preview@remotearc.app",
          name: "Preview User",
          avatarUrl: null,
          role: "admin",
          isAdmin: true,
        },
      });
    }

    if (url.pathname === "/api/status") {
      return json({
        googleConfigured: true,
        mcpEndpoint,
        devices,
        totalDevices: devices.length,
        onlineDevices: 1,
        recentActivity: [
          {
            id: "preview-a1",
            device_id: "preview-mac",
            event_type: "mcp.tool_call",
            tool_name: "read_file",
            success: 1,
            created_at: previewAgo(4 * 60000),
          },
          {
            id: "preview-a2",
            device_id: "preview-mac",
            event_type: "device.policy_updated",
            tool_name: null,
            success: 1,
            created_at: previewAgo(48 * 60000),
          },
          {
            id: "preview-a3",
            device_id: "preview-win",
            event_type: "mcp.tool_call",
            tool_name: "list_processes",
            success: 1,
            created_at: previewAgo(2 * 3600000),
          },
        ],
        usage: {
          month: "2026-09",
          used: 1732,
          limit: 10000,
          remaining: 8268,
          unlimited: false,
        },
      });
    }

    if (url.pathname === "/api/security") {
      return json({
        mcpPaused: false,
        grants: [
          {
            clientId: "preview-chatgpt",
            clientName: "ChatGPT",
            scopes: ["devices:read", "computer:read", "computer:write"],
            authorizedAt: previewAgo(7 * 86400000),
            lastTokenIssuedAt: previewAgo(12 * 60000),
            accessExpiresAt: new Date(Date.now() + 48 * 60000).toISOString(),
            refreshExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
            tokenRows: 2,
            status: "active",
          },
          {
            clientId: "preview-claude",
            clientName: "Claude",
            scopes: ["devices:read", "computer:read"],
            authorizedAt: previewAgo(2 * 86400000),
            lastTokenIssuedAt: previewAgo(55 * 60000),
            accessExpiresAt: new Date(Date.now() + 5 * 60000).toISOString(),
            refreshExpiresAt: new Date(Date.now() + 28 * 86400000).toISOString(),
            tokenRows: 1,
            status: "active",
          },
        ],
      });
    }

    if (url.pathname === "/api/monitor") {
      return json({
        status: "operational",
        checkedAt: previewNow(),
        worker: {
          status: "operational",
          errors15m: 0,
          errors1h: 1,
          errors24h: 2,
        },
        dependencies: {
          d1: { status: "operational" },
          durableObjects: { status: "operational" },
        },
        account: {
          users: 128,
          devices: 231,
          activeTokens: 54,
        },
        alerts: {
          emailConfigured: true,
          destination: "alerts@example.com",
          cooldownMinutes: 10,
          recent: [],
        },
        incidents: [
          {
            id: "preview-incident",
            status_code: 502,
            path: "/mcp",
            message: "Example recovered upstream error",
            created_at: previewAgo(6 * 3600000),
          },
        ],
      });
    }

    if (url.pathname === "/api/devices") return json(devices);
    if (url.pathname === "/api/automations") return json({ automations });
    const taskId = url.pathname.match(/^\/api\/automations\/([^/]+)$/)?.[1];
    if (taskId) {
      const automation = automations.find((item) => item.id === taskId);
      if (!automation) return json({ error: "not_found" }, 404);
      return json({ automation, runs: automation.run_count ? [{
        id: taskId + "-run", attempt: automation.run_count,
        status: automation.status === "completed" ? "completed" : "running",
        exit_code: automation.status === "completed" ? 0 : null,
        output_summary: automation.status === "completed" ? "Typecheck: passed\nIntegration tests: passed\nRelease build: exit 0" : "Latest observation: tests reproduced; task remains in progress.",
        error: null, started_at: automation.last_run_at || automation.created_at,
      }] : [] });
    }
    return json({ ok: true });
  }) as typeof window.fetch;
}
