import { getGoalContext, submitGoalDecision } from "./source-goals.js";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getDevicesForUser } from "./device.js";
import type { OAuthIdentity } from "./auth.js";
import { callDevice } from "./device-call.js";
import { consumeToolCall } from "./usage.js";
import {
  cancelAutomation,
  createAutomation,
  getAutomation,
  listAutomationRuns,
  listAutomations,
  pauseAutomation,
  resumeAutomation,
} from "./automations.js";

type Env = {
  DB: D1Database;
  REGISTRY: DurableObjectNamespace;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  MONTHLY_TOOL_CALL_LIMIT?: string;
  REVIEWER_DEMO_DEVICE_ID?: string;
};

type Scope =
  | "devices:read"
  | "computer:read"
  | "computer:write"
  | "browser:read"
  | "automation:read"
  | "automation:write"
  | "agent:write";

const hasScope = (identity: OAuthIdentity, scope: Scope) =>
  identity.scope.split(/\s+/).includes(scope);

const consume = async (env: Env, identity: OAuthIdentity) =>
  consumeToolCall(env, identity.userId);

const oauthSchemes = (scope: Scope) => [
  {
    type: "oauth2",
    scopes: [scope],
  },
];

const oauthToolMeta = (scope: Scope) => ({
  securitySchemes: oauthSchemes(scope),
});

const authRequired = (env: Env, scope: Scope) => {
  const challenge =
    `Bearer resource_metadata="${env.PUBLIC_ORIGIN}/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Sign in to Remote Arc to continue", scope="${scope}"`;

  return {
    content: [
      {
        type: "text" as const,
        text: `Authentication required. Remote Arc needs the ${scope} scope.`,
      },
    ],
    _meta: {
      "mcp/www_authenticate": [challenge],
    },
    isError: true,
  };
};

const textResult = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text:
        typeof value === "string"
          ? value
          : JSON.stringify(value, null, 2),
    },
  ],
});

/**
 * OpenAI's plugin auth contract currently expects securitySchemes at the
 * root of each tool returned by tools/list. The MCP SDK version used by this
 * project only preserves arbitrary auth metadata in _meta, so promote it into
 * the root response while retaining the SDK's normal tool registration and
 * call dispatch.
 */
function installOpenAiToolListAuthMetadata(server: McpServer) {
  const internal = server as unknown as {
    _registeredTools: Record<string, any>;
    toolInputSchemaJson(name: string): Record<string, unknown> | undefined;
    server: {
      setRequestHandler(
        method: string,
        handler: () => unknown,
      ): void;
    };
  };

  internal.server.setRequestHandler("tools/list", () => ({
    tools: Object.entries(internal._registeredTools)
      .filter(([, tool]) => tool.enabled)
      .map(([name, tool]) => {
        const definition: Record<string, unknown> = {
          name,
          title: tool.title,
          description: tool.description,
          inputSchema:
            internal.toolInputSchemaJson(name) ?? {
              type: "object",
              properties: {},
            },
          annotations: tool.annotations,
          icons: tool.icons,
          execution: tool.execution,
          _meta: tool._meta,
        };

        if (tool.outputSchemaJson) {
          definition.outputSchema = tool.outputSchemaJson;
        }

        const schemes = tool._meta?.securitySchemes;
        if (schemes) {
          definition.securitySchemes = schemes;
        }

        return definition;
      }),
  }));
}

export function createRemoteLinkMcp(
  env: Env,
  identity: OAuthIdentity | null,
) {
  return createMcpHandler(() => {
    const server = new McpServer(
      { name: "remotearc", version: "0.4.0" },
      { capabilities: { tools: {} } },
    );

    server.registerTool(
      "list_devices",
      {
        title: "List Remote Arc devices",
        description:
          "List computers linked to this Remote Arc account and show whether each device is online.",
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("devices:read"),
      },
      async () => {
        if (!identity || !hasScope(identity, "devices:read")) {
          return authRequired(env, "devices:read");
        }
        await consume(env, identity);
        return textResult(await getDevicesForUser(env, identity.userId));
      },
    );

    server.registerTool(
      "device_tools",
      {
        title: "List tools on a device",
        description:
          "Show the local MCP tools currently available on one linked device.",
        inputSchema: z.object({
          device_id: z.string(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("devices:read"),
      },
      async ({ device_id }) => {
        if (!identity || !hasScope(identity, "devices:read")) {
          return authRequired(env, "devices:read");
        }
        await consume(env, identity);
        const devices = await getDevicesForUser(env, identity.userId);
        const device = devices.find((item) => item.id === device_id);
        if (!device) throw new Error("device not found");
        return textResult(device.tools || []);
      },
    );

    server.registerTool(
      "browser_list_tabs",
      {
        title: "List explicitly shared browser tabs",
        description:
          "List the browser tabs the user explicitly shared with Remote Arc. Use the returned tabId when more than one tab is shared.",
        inputSchema: z.object({
          device_id: z.string(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("browser:read"),
      },
      async ({ device_id }) => {
        if (!identity || !hasScope(identity, "browser:read")) {
          return authRequired(env, "browser:read");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "browser_list_tabs", {}),
        );
      },
    );

    server.registerTool(
      "browser_get_current_tab",
      {
        title: "Get the currently shared browser tab",
        description:
          "Return metadata for one explicitly shared browser tab. Pass tab_id when multiple tabs are shared.",
        inputSchema: z.object({
          device_id: z.string(),
          tab_id: z.number().int().optional(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("browser:read"),
      },
      async ({ device_id, tab_id }) => {
        if (!identity || !hasScope(identity, "browser:read")) {
          return authRequired(env, "browser:read");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "browser_get_current_tab", {
            ...(tab_id !== undefined ? { tab_id } : {}),
          }),
        );
      },
    );

    server.registerTool(
      "browser_read_page",
      {
        title: "Read the shared browser page",
        description:
          "Read a simplified, read-only snapshot of the explicitly shared tab, including text, headings, and interactive element labels. Does not return raw HTML or form values.",
        inputSchema: z.object({
          device_id: z.string(),
          tab_id: z.number().int().optional(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("browser:read"),
      },
      async ({ device_id, tab_id }) => {
        if (!identity || !hasScope(identity, "browser:read")) {
          return authRequired(env, "browser:read");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "browser_read_page", {
            ...(tab_id !== undefined ? { tab_id } : {}),
          }),
        );
      },
    );

    server.registerTool(
      "browser_get_selected_text",
      {
        title: "Read selected text in the shared browser tab",
        description:
          "Return only the text currently selected by the user in the explicitly shared tab.",
        inputSchema: z.object({
          device_id: z.string(),
          tab_id: z.number().int().optional(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("browser:read"),
      },
      async ({ device_id, tab_id }) => {
        if (!identity || !hasScope(identity, "browser:read")) {
          return authRequired(env, "browser:read");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "browser_get_selected_text", {
            ...(tab_id !== undefined ? { tab_id } : {}),
          }),
        );
      },
    );

    server.registerTool(
      "browser_extract_links",
      {
        title: "Extract links from the shared browser tab",
        description:
          "Return visible links from the explicitly shared tab without navigating or clicking them.",
        inputSchema: z.object({
          device_id: z.string(),
          tab_id: z.number().int().optional(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("browser:read"),
      },
      async ({ device_id, tab_id }) => {
        if (!identity || !hasScope(identity, "browser:read")) {
          return authRequired(env, "browser:read");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "browser_extract_links", {
            ...(tab_id !== undefined ? { tab_id } : {}),
          }),
        );
      },
    );

    server.registerTool(
      "browser_extract_table",
      {
        title: "Extract a table from the shared browser tab",
        description:
          "Return rows from one visible table in the explicitly shared tab without modifying the page.",
        inputSchema: z.object({
          device_id: z.string(),
          tab_id: z.number().int().optional(),
          table_index: z.number().int().min(0).default(0),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("browser:read"),
      },
      async ({ device_id, tab_id, table_index }) => {
        if (!identity || !hasScope(identity, "browser:read")) {
          return authRequired(env, "browser:read");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "browser_extract_table", {
            ...(tab_id !== undefined ? { tab_id } : {}),
            table_index,
          }),
        );
      },
    );

    server.registerTool(
      "list_directory",
      {
        title: "List directory on a remote computer",
        description: "List files and directories on a linked computer.",
        inputSchema: z.object({
          device_id: z.string(),
          path: z.string(),
          depth: z.number().int().min(1).max(10).default(2),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("computer:read"),
      },
      async ({ device_id, path, depth }) => {
        if (!identity || !hasScope(identity, "computer:read")) {
          return authRequired(env, "computer:read");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "list_directory", {
            path,
            depth,
          }),
        );
      },
    );

    server.registerTool(
      "read_file",
      {
        title: "Read a file on a remote computer",
        description: "Read a local file from a linked computer.",
        inputSchema: z.object({
          device_id: z.string(),
          path: z.string(),
          offset: z.number().int().optional(),
          length: z.number().int().positive().optional(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("computer:read"),
      },
      async ({ device_id, path, offset, length }) => {
        if (!identity || !hasScope(identity, "computer:read")) {
          return authRequired(env, "computer:read");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "read_file", {
            path,
            ...(offset !== undefined ? { offset } : {}),
            ...(length !== undefined ? { length } : {}),
          }),
        );
      },
    );

    server.registerTool(
      "get_file_info",
      {
        title: "Get remote file info",
        description: "Get metadata for a file or directory on a linked computer.",
        inputSchema: z.object({
          device_id: z.string(),
          path: z.string(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("computer:read"),
      },
      async ({ device_id, path }) => {
        if (!identity || !hasScope(identity, "computer:read")) {
          return authRequired(env, "computer:read");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "get_file_info", { path }),
        );
      },
    );

    server.registerTool(
      "list_processes",
      {
        title: "List processes on a remote computer",
        description: "List processes running on a linked computer.",
        inputSchema: z.object({
          device_id: z.string(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("computer:read"),
      },
      async ({ device_id }) => {
        if (!identity || !hasScope(identity, "computer:read")) {
          return authRequired(env, "computer:read");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "list_processes", {}),
        );
      },
    );

    server.registerTool(
      "start_process",
      {
        title: "Run a command on a remote computer",
        description:
          "Run a terminal command on a linked computer when the start_process skill is enabled for that device. The local Remote Arc Safety Guard blocks a narrow set of catastrophic system commands.",
        inputSchema: z.object({
          device_id: z.string(),
          command: z.string(),
          timeout_ms: z.number().int().positive().default(5000),
          cwd: z.string().optional(),
          background: z.boolean().default(false),
        }),
        annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
        _meta: oauthToolMeta("computer:write"),
      },
      async ({ device_id, command, timeout_ms, cwd, background }) => {
        if (!identity || !hasScope(identity, "computer:write")) {
          return authRequired(env, "computer:write");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "start_process", {
            command,
            timeout_ms,
            ...(cwd ? { cwd } : {}),
            background,
          }),
        );
      },
    );

    server.registerTool(
      "process_status",
      {
        title: "Get background process status",
        description:
          "Get the status of a Remote Arc managed background process on a linked computer.",
        inputSchema: z.object({
          device_id: z.string(),
          process_id: z.string(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("computer:write"),
      },
      async ({ device_id, process_id }) => {
        if (!identity || !hasScope(identity, "computer:write")) {
          return authRequired(env, "computer:write");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "process_status", {
            process_id,
          }),
        );
      },
    );

    server.registerTool(
      "process_output",
      {
        title: "Read background process output",
        description:
          "Read captured stdout and stderr from a Remote Arc managed background process.",
        inputSchema: z.object({
          device_id: z.string(),
          process_id: z.string(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("computer:write"),
      },
      async ({ device_id, process_id }) => {
        if (!identity || !hasScope(identity, "computer:write")) {
          return authRequired(env, "computer:write");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "process_output", {
            process_id,
          }),
        );
      },
    );

    server.registerTool(
      "stop_process",
      {
        title: "Stop a background process",
        description:
          "Stop a Remote Arc managed background process and its child process tree.",
        inputSchema: z.object({
          device_id: z.string(),
          process_id: z.string(),
        }),
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: true },
        _meta: oauthToolMeta("computer:write"),
      },
      async ({ device_id, process_id }) => {
        if (!identity || !hasScope(identity, "computer:write")) {
          return authRequired(env, "computer:write");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "stop_process", {
            process_id,
          }),
        );
      },
    );

    server.registerTool(
      "write_file",
      {
        title: "Write a file on a remote computer",
        description:
          "Write or append text on a linked computer when the write_file skill is enabled. Supported CLI versions create a local-only undo snapshot before the change.",
        inputSchema: z.object({
          device_id: z.string(),
          path: z.string(),
          content: z.string(),
          mode: z.enum(["rewrite", "append"]).default("rewrite"),
        }),
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: true },
        _meta: oauthToolMeta("computer:write"),
      },
      async ({ device_id, path, content, mode }) => {
        if (!identity || !hasScope(identity, "computer:write")) {
          return authRequired(env, "computer:write");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "write_file", {
            path,
            content,
            mode,
          }),
        );
      },
    );

    server.registerTool(
      "edit_block",
      {
        title: "Edit text on a remote computer",
        description:
          "Apply a targeted search-and-replace edit to a file on a linked computer. Supported CLI versions create a local-only undo snapshot before the change.",
        inputSchema: z.object({
          device_id: z.string(),
          file_path: z.string(),
          old_string: z.string(),
          new_string: z.string(),
          expected_replacements: z.number().int().positive().default(1),
        }),
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: true },
        _meta: oauthToolMeta("computer:write"),
      },
      async ({
        device_id,
        file_path,
        old_string,
        new_string,
        expected_replacements,
      }) => {
        if (!identity || !hasScope(identity, "computer:write")) {
          return authRequired(env, "computer:write");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "edit_block", {
            file_path,
            old_string,
            new_string,
            expected_replacements,
          }),
        );
      },
    );

    server.registerTool(
      "undo_last_change",
      {
        title: "Undo the last Remote Arc file change",
        description:
          "Restore the most recent reversible write_file or edit_block change on a linked computer. The snapshot is stored only on that device, not in Remote Arc Cloud.",
        inputSchema: z.object({
          device_id: z.string(),
        }),
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
        _meta: oauthToolMeta("computer:write"),
      },
      async ({ device_id }) => {
        if (!identity || !hasScope(identity, "computer:write")) {
          return authRequired(env, "computer:write");
        }
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "undo_last_change", {}),
        );
      },
    );


    const automationMatchValue = z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
    ]);

    server.registerTool(
      "create_automation",
      {
        title: "Create a persistent Remote Arc automation",
        description:
          "Save user-requested ongoing or scheduled work as a durable task; the user can ask in chat and need not fill a Dashboard form. Use ordinary tools for immediate one-off operations. Supports long commands, webhook watches, interval schedules and fixed-plan goal loops; use create_agent_goal when each result may require a different next action.",
        inputSchema: z.object({
          name: z.string().min(1).max(120),
          kind: z.enum([
            "long_task",
            "condition_watch",
            "schedule_watch",
            "goal_loop",
          ]),
          keep_awake: z.boolean().default(false),
          device_id: z.string().optional(),
          command: z.string().max(4000).optional(),
          cwd: z.string().max(500).optional(),
          steps: z
            .array(
              z.object({
                command: z.string().min(1).max(4000),
                cwd: z.string().max(500).optional(),
              }),
            )
            .min(1)
            .max(8)
            .optional(),
          goal: z
            .object({
              command: z.string().min(1).max(4000),
              cwd: z.string().max(500).optional(),
              expected_exit_code: z.number().int().min(0).max(255).default(0),
            })
            .optional(),
          github_merge: z
            .object({
              owner: z.string().min(1).max(100),
              repo: z.string().min(1).max(100),
              pull_number: z.number().int().min(1),
              installation_id: z.string().regex(/^\d+$/).optional(),
              merge_method: z.enum(["merge", "squash", "rebase"]).default("merge"),
              expected_head_sha: z.string().regex(/^[a-f0-9]{7,64}$/i).optional(),
            })
            .optional(),
          condition: z
            .object({
              source: z.enum(["github", "generic"]).default("generic"),
              event: z.string().max(160).optional(),
              match: z
                .record(z.string(), automationMatchValue)
                .optional(),
            })
            .optional(),
          schedule: z
            .object({
              at: z.string().optional(),
              every_seconds: z
                .number()
                .int()
                .min(60)
                .max(2592000)
                .optional(),
              start_at: z.string().optional(),
            })
            .optional(),
          interval_seconds: z
            .number()
            .int()
            .min(60)
            .max(2592000)
            .default(300),
          max_runs: z.number().int().min(0).max(10000).optional(),
          expires_at: z.string().nullable().optional(),
          recovery: z
            .enum(["restart", "fail"])
            .default("restart"),
        }),
        annotations: {
          readOnlyHint: false,
          openWorldHint: true,
          destructiveHint: true,
        },
        _meta: oauthToolMeta("automation:write"),
      },
      async (input) => {
        if (!identity || !hasScope(identity, "automation:write")) {
          return authRequired(env, "automation:write");
        }
        await consume(env, identity);
        const created = await createAutomation(env, identity.userId, input);
        return textResult({
          automation: created.automation
            ? {
                id: created.automation.id,
                name: created.automation.name,
                kind: created.automation.kind,
                status: created.automation.status,
                device_id: created.automation.device_id,
                next_run_at: created.automation.next_run_at,
                expires_at: created.automation.expires_at,
                max_runs: created.automation.max_runs,
              }
            : null,
          webhook: created.webhook
            ? {
                url: created.webhook.url,
                note:
                  "Treat this webhook URL as a secret bearer capability. It is returned only when the condition watch is created.",
              }
            : null,
        });
      },
    );


    server.registerTool(
      "create_agent_goal",
      {
        title: "Create a self-directed durable Agent Goal",
        description:
          "Save a user-requested ongoing adaptive goal from chat; no Dashboard form is required. Choose the controller explicitly: source AI uses get_goal_context and submit_goal_decision and needs a continuing host runtime or task events; hosted planner is a separate option (legacy default), not a silent model fallback. Completion needs evidence and configured verification. Device policy, budgets and agent:write scope apply.",
        inputSchema: z.object({
          name: z.string().min(1).max(120),
          keep_awake: z.boolean().default(false),
          device_id: z.string(),
          objective: z.string().min(1).max(6000),
          success_criteria: z.string().min(1).max(4000),
          workspace: z.string().max(500).optional(),
          verify_command: z.string().max(4000).optional(),
          verify_cwd: z.string().max(500).optional(),
          allowed_tools: z
            .array(
              z.enum([
                "list_directory",
                "read_file",
                "get_file_info",
                "write_file",
                "edit_block",
                "start_process",
              ]),
            )
            .min(1)
            .max(6),
          controller: z.enum(["hosted", "source"]).default("hosted"),
          max_iterations: z.number().int().min(1).max(2000).default(30),
          schedule: z.object({
            at: z.string().optional(), every_seconds: z.number().int().min(60).max(86400).optional(),
            start_at: z.string().optional(),
          }).optional(),
          max_runs: z.number().int().min(0).max(10000).optional(),
          interval_seconds: z.number().int().min(60).max(3600).default(60),
          expires_at: z.string().nullable().optional(),
        }),
        annotations: {
          readOnlyHint: false,
          openWorldHint: true,
          destructiveHint: true,
        },
        _meta: {
          securitySchemes: [
            {
              type: "oauth2",
              scopes: ["automation:write", "agent:write"],
            },
          ],
        },
      },
      async (input) => {
        if (
          !identity ||
          !hasScope(identity, "automation:write") ||
          !hasScope(identity, "agent:write")
        ) {
          return authRequired(env, "agent:write");
        }
        await consume(env, identity);
        const created = await createAutomation(env, identity.userId, {
          name: input.name,
          keep_awake: input.keep_awake,
          kind: "agent_goal",
          device_id: input.device_id,
          interval_seconds: input.interval_seconds,
          expires_at: input.expires_at,
          schedule: input.schedule,
          max_runs: input.max_runs,
          agent_goal: {
            controller: input.controller,
            controller_client_id: input.controller === "source" ? identity.clientId : undefined,
            objective: input.objective,
            success_criteria: input.success_criteria,
            workspace: input.workspace,
            verify_command: input.verify_command,
            verify_cwd: input.verify_cwd,
            allowed_tools: input.allowed_tools,
            max_iterations: input.max_iterations,
          },
        });
        return textResult({
          automation: created.automation
            ? {
                id: created.automation.id,
                name: created.automation.name,
                kind: "agent_goal",
                controller: input.controller,
                stored_kind: created.automation.kind,
                status: created.automation.status,
                device_id: created.automation.device_id,
                next_run_at: created.automation.next_run_at,
                expires_at: created.automation.expires_at,
              }
            : null,
          note:
            input.controller === "source"
              ? "Use get_goal_context and submit_goal_decision to continue this durable goal. The source host needs a persistent goal runtime or a verified event subscription. Remote Arc does not silently switch to a hosted planner."
              : "The explicitly selected hosted planner continues with bounded observations and compact memory. This may be a different model from the creating chat.",
        });
      },
    );

    server.registerTool(
      "list_automations",
      {
        title: "List persistent Remote Arc automations",
        description:
          "List durable Remote Arc tasks and watches for this account without reading raw command output.",
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
          destructiveHint: false,
        },
        _meta: oauthToolMeta("automation:read"),
      },
      async () => {
        if (!identity || !hasScope(identity, "automation:read")) {
          return authRequired(env, "automation:read");
        }
        await consume(env, identity);
        const rows = await listAutomations(env, identity.userId);
        return textResult(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            kind: row.kind,
            status: row.status,
            device_id: row.device_id,
            run_count: row.run_count,
            max_runs: row.max_runs,
            next_run_at: row.next_run_at,
            expires_at: row.expires_at,
            last_error: row.last_error,
            updated_at: row.updated_at,
          })),
        );
      },
    );

    server.registerTool(
      "get_automation",
      {
        title: "Get a Remote Arc automation",
        description:
          "Inspect one durable Remote Arc automation, its frozen plan, trigger, goal condition and recent run metadata.",
        inputSchema: z.object({
          automation_id: z.string(),
        }),
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
          destructiveHint: false,
        },
        _meta: oauthToolMeta("automation:read"),
      },
      async ({ automation_id }) => {
        if (!identity || !hasScope(identity, "automation:read")) {
          return authRequired(env, "automation:read");
        }
        await consume(env, identity);
        const row = await getAutomation(env, identity.userId, automation_id);
        if (!row) throw new Error("automation not found");
        const runs = await listAutomationRuns(
          env,
          identity.userId,
          automation_id,
        );
        const parse = (value: string | null) => {
          if (!value) return null;
          try {
            return JSON.parse(value);
          } catch {
            return null;
          }
        };
        return textResult({
          automation: {
            id: row.id,
            name: row.name,
            kind: row.kind,
            status: row.status,
            device_id: row.device_id,
            trigger: parse(row.trigger_json),
            plan: parse(row.action_json),
            goal: parse(row.goal_json),
            revision: row.revision,
            runtime: parse(row.state_json),
            run_count: row.run_count,
            max_runs: row.max_runs,
            next_run_at: row.next_run_at,
            expires_at: row.expires_at,
            last_run_at: row.last_run_at,
            last_error: row.last_error,
            created_at: row.created_at,
            updated_at: row.updated_at,
          },
          runs: runs.map((run) => ({
            id: run.id,
            attempt: run.attempt,
            status: run.status,
            process_id: run.process_id,
            exit_code: run.exit_code,
            error: run.error,
            output_summary: run.output_summary,
            started_at: run.started_at,
            finished_at: run.finished_at,
          })),
        });
      },
    );

    server.registerTool("get_goal_context", {
      title: "Read durable Agent Goal context",
      description: "Read the objective, revision, latest observation, factual working memory, completion evidence and ordered progress journal. Use after a pause or a new conversation to continue without replaying uncertain actions.",
      inputSchema: z.object({ automation_id: z.string(), after_sequence: z.number().int().min(0).default(0) }),
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      _meta: oauthToolMeta("automation:read"),
    }, async ({ automation_id, after_sequence }) => {
      if (!identity || !hasScope(identity, "automation:read")) return authRequired(env, "automation:read");
      await consume(env, identity);
      return textResult(await getGoalContext(env.DB, identity.userId, automation_id, after_sequence));
    });

    server.registerTool("submit_goal_decision", {
      title: "Submit the next source Agent Goal decision",
      description: "Submit one bounded next action for a source-controlled goal using the current context revision and a unique idempotency key. Reuse the same key and payload on network retry. After a revision conflict, read context again. A complete decision requires concrete evidence and configured verification must pass.",
      inputSchema: z.object({
        automation_id: z.string(), expected_revision: z.number().int().min(0),
        idempotency_key: z.string().min(1).max(120),
        decision: z.enum(["tool", "complete", "pause"]),
        tool: z.enum(["none", "list_directory", "read_file", "get_file_info", "write_file", "edit_block", "start_process"]),
        arguments_json: z.string().max(250000).default("{}"),
        decision_summary: z.string().min(1).max(1200),
        memory: z.string().max(8000).default(""), completion_evidence: z.string().max(3000).default(""),
      }),
      annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true, idempotentHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["automation:write", "agent:write"] }] },
    }, async (input) => {
      if (!identity || !hasScope(identity, "automation:write") || !hasScope(identity, "agent:write")) return authRequired(env, "agent:write");
      await consume(env, identity);
      return textResult(await submitGoalDecision(env.DB, identity, input.automation_id,
        input.expected_revision, input.idempotency_key, input));
    });

    server.registerTool(
      "manage_automation",
      {
        title: "Pause, resume, or cancel an automation",
        description:
          "Manage a durable Remote Arc automation. Unattended tasks recover automatically from reconnect/process-handle loss according to their recovery policy; a later device-policy change stops the task instead of waiting for approval. Cancel also attempts to stop the currently managed process.",
        inputSchema: z.object({
          automation_id: z.string(),
          action: z.enum(["pause", "resume", "cancel"]),
        }),
        annotations: {
          readOnlyHint: false,
          openWorldHint: false,
          destructiveHint: true,
        },
        _meta: oauthToolMeta("automation:write"),
      },
      async ({ automation_id, action }) => {
        if (!identity || !hasScope(identity, "automation:write")) {
          return authRequired(env, "automation:write");
        }
        await consume(env, identity);
        const row =
          action === "pause"
            ? await pauseAutomation(env, identity.userId, automation_id)
            : action === "resume"
              ? await resumeAutomation(env, identity.userId, automation_id)
              : await cancelAutomation(env, identity.userId, automation_id);
        return textResult(
          row
            ? {
                id: row.id,
                name: row.name,
                status: row.status,
                next_run_at: row.next_run_at,
                last_error: row.last_error,
                updated_at: row.updated_at,
              }
            : null,
        );
      },
    );

    installOpenAiToolListAuthMetadata(server);
    return server;
  });
}
