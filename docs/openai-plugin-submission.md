# Remote Arc — OpenAI Public Plugin Submission Pack

Last updated: 2026-10-05

## Submission type

- Type: **With MCP**
- MCP URL type: **Universal**
- Production MCP URL: `https://mcp.remotearc.app/mcp`
- Website: `https://remotearc.app`
- Support: `https://remotearc.app/support`
- Privacy: `https://remotearc.app/privacy`
- Terms: `https://remotearc.app/terms`
- Developer identity: **Verified** individual identity
- Suggested category: Developer Tools / Productivity

## Listing copy

### Plugin name

Remote Arc

### Short description

Access your computer remotely with ChatGPT and Codex on Windows, macOS, and Linux.

### Long description

Remote Arc gives ChatGPT, Codex, and compatible MCP clients secure, user-authorized access to computers you explicitly pair.

Install the lightweight Remote Arc agent on a Windows, macOS, or Linux computer, approve the pairing in your browser, then install the Remote Arc plugin and connect your account with OAuth. Remote Arc can list your paired devices, inspect directories and files, read process information, and—when you explicitly enable write-capable tools for a device—run terminal commands or modify files.

Each paired computer has an independent revocable credential and per-device tool policy. The hosted Remote Arc relay routes authorized MCP requests between your AI client and your computer. It is designed not to persist file contents, command arguments, OAuth tokens, or device credentials in audit records; operational audit metadata may include the tool name, selected device, success state, and time.

Use Remote Arc only with computers, files, accounts, and services you own or are authorized to administer.

## Starter prompts

1. Show me my connected computers and tell me which ones are online.
2. List the top-level files in my project folder on my desktop.
3. Read package.json from my desktop and summarize the available scripts.
4. Show me the processes currently running on my desktop.
5. Run the tests on my desktop and summarize any failures.

## Tool annotations and justifications

| Tool | readOnlyHint | openWorldHint | destructiveHint | Submission justification |
| --- | --- | --- | --- | --- |
| `list_devices` | true | false | false | Reads account-scoped paired-device metadata and online state. It does not alter a device or public internet state. |
| `device_tools` | true | false | false | Reads the enabled/available tool list for one device owned by the authenticated user. |
| `browser_list_tabs` | true | false | false | Lists metadata for explicitly shared browser tabs without navigating or modifying them. |
| `browser_get_current_tab` | true | false | false | Reads metadata for an explicitly shared browser tab without changing it. |
| `browser_read_page` | true | false | false | Reads a simplified snapshot of an explicitly shared page without page interaction. |
| `browser_get_selected_text` | true | false | false | Reads only the text currently selected in an explicitly shared tab. |
| `browser_extract_links` | true | false | false | Extracts visible links from an explicitly shared page without following them. |
| `browser_extract_table` | true | false | false | Extracts rows from a visible table in an explicitly shared page without changing it. |
| `browser_click` | false | true | true | Clicks one element from a fresh shared-tab snapshot only after the user enables interaction for that tab; the click may navigate, submit, or trigger an external action. |
| `browser_fill` | false | true | false | Fills a non-sensitive control from a fresh shared-tab snapshot only after per-tab interaction opt-in; recognized password, OTP, payment-card, and file fields stay blocked. |
| `list_directory` | true | false | false | Retrieves a directory listing from a private paired computer without modifying filesystem state. |
| `read_file` | true | false | false | Retrieves file content from a private paired computer without modifying the file. |
| `read_binary_file` | true | false | false | Reads a bounded binary chunk from an authorized paired device without modifying it. |
| `create_file_resource` | false | false | false | Creates a temporary revision-pinned download capability for an authorized private file; does not modify the underlying file. |
| `revoke_file_resource` | false | false | false | Revokes an account-owned temporary file capability; does not delete the file. |
| `get_file_info` | true | false | false | Retrieves file/directory metadata only. |
| `list_processes` | true | false | false | Retrieves running-process information from a private paired computer without changing processes. |
| `start_process` | false | true | true | Executes an arbitrary terminal command on a paired computer. A command may modify local state and may access or change public internet services (for example, pushing code or calling an external API). Commands can cause irreversible effects. |
| `process_status` | true | false | false | Reads status for a Remote Arc-managed background process without changing that process. |
| `process_output` | true | false | false | Reads captured stdout/stderr for a Remote Arc-managed background process without changing it. |
| `stop_process` | false | false | true | Stops a Remote Arc-managed background process and its child process tree. This changes local process state and can interrupt work. |
| `write_file` | false | false | true | Writes or appends content to a file on the user's private paired computer. Rewrite mode can overwrite existing user data. |
| `edit_block` | false | false | true | Performs targeted search-and-replace in a file on the user's private paired computer and therefore changes/overwrites user data. |
| `undo_last_change` | false | false | false | Restores the newest reversible Remote Arc file change from a device-local snapshot. It mutates local state but is a bounded recovery action that refuses conflicting restores. |
| `create_automation` | false | true | true | Saves an authorized command or cloud-action contract for future execution; commands can modify local or external state. |
| `create_agent_goal` | false | true | true | Saves an authorized objective, executor, tools and limits; future approved actions can modify local or external state. |
| `list_automations` | true | false | false | Reads only the authenticated account's saved task records. |
| `get_automation` | true | false | false | Reads an account-owned task and its bounded recent run history. |
| `get_goal_context` | true | false | false | Reads an account-owned goal, factual memory, observations, revision and bounded journal; it does not retrieve the original chat. |
| `submit_goal_decision` | false | true | true | Persists an authorized revision-checked next decision which can cause device or external changes; matching idempotency keys prevent duplicate acceptance. |
| `manage_automation` | false | false | true | Pauses, resumes or cancels account-owned work; cancellation can interrupt its managed process. |

Production tools/list was independently checked on 2026-10-05 and exposed 31 hosted MCP tools. The reviewer fixture intentionally advertises eight representative device tools for deterministic review: directory/file reads, file metadata, process listing, a safe command allowlist, sandboxed write/edit, and undo. Browser reads and production managed-process controls remain declared and annotated but are not required in the five representative positive tests.

Operational service metering and audit metadata are described in the Privacy Policy. The hints above describe the user-facing capability and external effect of each tool.

## Positive review tests

The reviewer fixture is an isolated deterministic workspace. It now exposes representative read, command, write, edit, and undo capabilities without contacting a real user computer. Every write is restricted to `/review-demo`, and reviewer login resets the mutable fixture state.

### Positive 1 — List devices

**Prompt:** Show me my connected computers and tell me which ones are online.

**Expected behavior:** Call `list_devices`.

**Expected result:** Return `Review Desktop`, platform Windows, with online status.

### Positive 2 — Inspect the demo project

**Prompt:** On Review Desktop, list /review-demo, then read /review-demo/package.json and tell me what npm test runs.

**Expected behavior:** Call `list_devices`, `list_directory`, and `read_file`.

**Expected result:** The directory contains `package.json`, `src`, and `README.md`; `npm test` resolves to `vitest run`.

### Positive 3 — Run tests

**Prompt:** Run npm test on Review Desktop and summarize the result.

**Expected behavior:** Call `list_devices` and `start_process`.

**Expected result:** Deterministic output reports 2 passing suites and 8 passing tests.

### Positive 4 — Write, verify, and undo

**Prompt:** On Review Desktop, write "review fixture write works" to /review-demo/reviewer-note.txt, read it back to verify the contents, then undo that Remote Arc file change.

**Expected behavior:** Call `write_file`, `read_file`, and `undo_last_change` on the isolated fixture.

**Expected result:** The written content reads back exactly, then undo restores the prior state. No real user filesystem is touched.

### Positive 5 — Edit, verify, and undo

**Prompt:** On Review Desktop, update /review-demo/README.md by replacing "deterministic fixture data" with "isolated deterministic fixture data", read the file to verify the edit, then undo the change.

**Expected behavior:** Call `edit_block`, `read_file`, and `undo_last_change`.

**Expected result:** Exactly one replacement is made, the verification read contains the updated phrase, and undo restores the original README.

## Negative review tests

These cases test activation boundaries: Remote Arc should not trigger when the user's request can be completed without access to a paired computer.

### Negative 1 — General knowledge

**Prompt:** Explain the difference between TCP and UDP.

**Expected behavior:** Answer normally without invoking Remote Arc.

**Why:** No paired-computer data or action is required.

### Negative 2 — Content already in chat

**Prompt:** Summarize this sentence: Remote work can reduce commuting time and give people more flexibility.

**Expected behavior:** Summarize the supplied text directly without invoking Remote Arc.

**Why:** All required content is already present in the conversation.

### Negative 3 — Standalone coding question

**Prompt:** Write a Python function that removes duplicate values from a list while preserving order.

**Expected behavior:** Provide the code directly without invoking Remote Arc.

**Why:** The request does not require a local repository, file, process, or terminal.

## Reviewer authentication

Remote Arc supports a reviewer-only login option on the OAuth sign-in page when reviewer credentials are configured.

- Reviewer email: `openai-reviewer@remotearc.app`
- Reviewer password: configure through the protected Cloudflare secret `REVIEWER_PASSWORD_SHA256`
- MFA: none
- SMS/email confirmation: none
- Private network: not required
- Review device: `Review Desktop` (deterministic isolated fixture)
- Normal users continue to sign in with Google.

The reviewer fixture is isolated from real user devices. It exposes deterministic read, safe-command, sandboxed write/edit, and undo behavior under /review-demo; reviewer login resets mutable fixture state.

## Domain verification

The server implements:

`https://mcp.remotearc.app/.well-known/openai-apps-challenge`

The route returns HTTP 404 until `OPENAI_APPS_CHALLENGE` is configured. When the Submission Portal generates a token:

1. Store the exact token in Cloudflare secret `OPENAI_APPS_CHALLENGE`.
2. Confirm the endpoint returns only the raw token as `text/plain`.
3. Select **Verify Domain** in the portal.

Do not wrap the token in JSON.

## Privacy / Terms review notes

The public Privacy Policy explicitly discloses:

- Google account identity and session/auth metadata.
- Paired device identifiers, names, platform metadata, credential hashes, and connection timestamps.
- Authorized MCP tool requests.
- File contents, directory listings, process output, and command results may transit the hosted relay and be returned to the selected AI client to fulfill a user request.
- Operational audit metadata may include tool name, device, success state, and time.
- Audit records are designed not to contain file contents, command arguments, OAuth tokens, or raw device credentials.
- AI platforms such as ChatGPT/Codex separately process requests/results under their own user settings, terms, and privacy policy.
- Cloudflare and Google OAuth are infrastructure/authentication subprocessors.

The Terms explicitly require authorization over every controlled computer/account/service and warn that commands can change local or network-accessible systems.

## Initial release notes

Initial public submission of Remote Arc.

Remote Arc provides an OAuth-protected Universal Remote MCP endpoint that connects ChatGPT and Codex to Windows, macOS, and Linux computers explicitly paired by the user. This initial version includes device discovery, per-device tool visibility, directory/file reads, file metadata, process inspection, terminal command execution, managed background-process status/output/stop controls, file writes, targeted text edits, and device-local undo of the newest supported Remote Arc file change.

For review, use the dedicated reviewer account and the isolated Review Desktop fixture. The fixture provides deterministic read/test outputs, a narrow safe-command allowlist, and sandboxed write/edit/undo behavior restricted to /review-demo. It never connects the reviewer to a real user computer.

## Portal checklist

- [ ] Developer Identity status is **Verified**, not Pending.
- [ ] Submit from the same OpenAI organization/project where identity was verified.
- [ ] Confirm Apps Management write permission.
- [ ] Create plugin → **With MCP**.
- [ ] MCP URL type → **Universal**.
- [ ] MCP URL → `https://mcp.remotearc.app/mcp`.
- [ ] Configure reviewer credentials.
- [ ] Add domain challenge token to `OPENAI_APPS_CHALLENGE`.
- [ ] Verify domain.
- [ ] Scan Tools.
- [ ] Confirm all 19 production tools and annotation values.
- [ ] Add annotation justifications from this document.
- [ ] Add listing copy and production URLs.
- [ ] Add starter prompts.
- [ ] Add 5 positive + 3 negative tests.
- [ ] Select only regions where Remote Arc support/legal terms are ready.
- [ ] Add initial release notes.
- [ ] Review policy attestations.
- [ ] Submit for Review.
- [ ] After approval, manually select **Publish**.


## Client-catalog and durable-task acceptance

The production server catalog and the client-installed Plugin catalog must be checked independently. A server listing of 31 tools does not prove that a particular chat has imported all 31. On 2026-10-05 the inspected chat had only nine Remote Arc device tools, lacked task-reading/decision tools, and its imported `start_process` schema omitted `cwd`, despite the live server including it.

Before accepting task handoff in a real client, verify that it can call `get_automation`, `get_goal_context` and, when authorized to continue a source goal, `submit_goal_decision`; verify its terminal schema accepts `cwd`. Use the same account and appropriate OAuth scopes. A missing tool must produce an explicit capability error, not an inferred local checkpoint path or an attempt to bypass the path policy with another device.

Create an actual goal task and observe a run start and factual completion evidence. Test the deployed Cloudflare scheduled handler and Cron configuration, not just manual task ticks. A copied ID alone neither transfers full conversation context nor wakes a stopped AI runtime. The five legacy automation names remain API compatibility details; Dashboard v2 separates goal/command intent from executor, trigger, plan and limits.
