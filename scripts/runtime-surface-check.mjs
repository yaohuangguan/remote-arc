import fs from "node:fs";

const relaySource = fs.readFileSync(new URL("../apps/relay/src/mcp.ts", import.meta.url), "utf8");
const submission = JSON.parse(fs.readFileSync(new URL("../chatgpt-app-submission.json", import.meta.url), "utf8"));
const plugin = JSON.parse(fs.readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));

const registered = new Set(
  [...relaySource.matchAll(/server\.registerTool\(\s*[\r\n\t ]*["']([^"']+)["']/g)].map((match) => match[1]),
);

const expected = [
  "list_devices", "device_tools",
  "browser_list_tabs", "browser_get_current_tab", "browser_read_page",
  "browser_get_selected_text", "browser_extract_links", "browser_extract_table",
  "browser_click", "browser_fill",
  "list_directory", "read_file", "read_binary_file", "create_file_resource",
  "revoke_file_resource", "get_file_info", "list_processes", "start_process",
  "process_status", "process_output", "stop_process", "write_file", "edit_block",
  "undo_last_change", "create_automation", "create_agent_goal", "list_automations",
  "get_automation", "get_goal_context", "submit_goal_decision", "manage_automation",
];

const missingRelay = expected.filter((name) => !registered.has(name));
const submissionTools = new Set(Object.keys(submission.tools ?? {}));
const missingSubmission = expected.filter((name) => !submissionTools.has(name));
const extraSubmission = [...submissionTools].filter((name) => !expected.includes(name));

if (missingRelay.length || missingSubmission.length || extraSubmission.length) {
  console.error("Remote Arc runtime surface drift detected.");
  if (missingRelay.length) console.error("Missing from Relay:", missingRelay.join(", "));
  if (missingSubmission.length) console.error("Missing from submission:", missingSubmission.join(", "));
  if (extraSubmission.length) console.error("Unexpected submission tools:", extraSubmission.join(", "));
  process.exit(1);
}

if (expected.length !== 31) {
  console.error(`Expected runtime surface count changed: ${expected.length}`);
  process.exit(1);
}

const description = [
  plugin.description,
  plugin.extensions?.["com.openai"]?.interface?.shortDescription,
  plugin.extensions?.["com.openai"]?.interface?.longDescription,
].filter(Boolean).join(" ");

if (!/persistent/i.test(description) || !/agent runtime/i.test(description)) {
  console.error("Plugin positioning must identify Remote Arc as a persistent agent runtime.");
  process.exit(1);
}

console.log(`Remote Arc runtime surface OK: ${expected.length} public MCP tools.`);
