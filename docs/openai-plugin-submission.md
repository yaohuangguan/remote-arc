# Remote Arc — OpenAI Public Plugin Submission Pack

Last updated: 2026-09-26

## Submission type

- Type: **With MCP**
- MCP URL type: **Universal**
- Production MCP URL: `https://mcp.remotearc.app/mcp`
- Website: `https://remotearc.app`
- Support: `https://remotearc.app/support`
- Privacy: `https://remotearc.app/privacy`
- Terms: `https://remotearc.app/terms`
- Developer identity: verified individual identity (currently pending OpenAI verification)
- Suggested category: Developer Tools / Productivity

## Listing copy

### Plugin name

Remote Arc

### Short description

Securely connect ChatGPT and Codex to your Windows, macOS, and Linux computers through Remote Arc.

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
| `list_directory` | true | false | false | Retrieves a directory listing from a private paired computer without modifying filesystem state. |
| `read_file` | true | false | false | Retrieves file content from a private paired computer without modifying the file. |
| `get_file_info` | true | false | false | Retrieves file/directory metadata only. |
| `list_processes` | true | false | false | Retrieves running-process information from a private paired computer without changing processes. |
| `start_process` | false | true | true | Executes an arbitrary terminal command on a paired computer. A command may modify local state and may access or change public internet services (for example, pushing code or calling an external API). Commands can cause irreversible effects. |
| `write_file` | false | false | true | Writes or appends content to a file on the user's private paired computer. Rewrite mode can overwrite existing user data. |
| `edit_block` | false | false | true | Performs targeted search-and-replace in a file on the user's private paired computer and therefore changes/overwrites user data. |

Operational service metering and audit metadata are described in the Privacy Policy. The hints above describe the user-facing capability and external effect of each tool.

## Positive review tests

### Positive 1 — List devices

**Prompt:** Show me my connected computers and tell me which ones are online.

**Expected behavior:** Call `list_devices`.

**Expected result:** Return the authenticated review account's paired devices. The deterministic review fixture contains `Review Desktop`, platform Windows, with online status.

**Fixture:** Reviewer demo account; `Review Desktop` fixture.

### Positive 2 — List available tools

**Prompt:** What Remote Arc tools are available on Review Desktop?

**Expected behavior:** Call `device_tools` with the fixture device ID selected from `list_devices`.

**Expected result:** Return the review-safe enabled tools: `list_directory`, `read_file`, `get_file_info`, `list_processes`, and `start_process`.

**Fixture:** Reviewer demo account; `Review Desktop`.

### Positive 3 — List directory

**Prompt:** List the files in /review-demo on Review Desktop.

**Expected behavior:** Call `list_directory`.

**Expected result shape:** A file/directory list including `package.json`, `src`, and `README.md`.

**Fixture:** Deterministic review filesystem fixture.

### Positive 4 — Read file

**Prompt:** Read /review-demo/package.json on Review Desktop and summarize the scripts.

**Expected behavior:** Call `read_file`.

**Expected result:** package.json content for the review fixture; the model should identify the `test` script as `vitest run`.

**Fixture:** Deterministic review filesystem fixture.

### Positive 5 — Run tests

**Prompt:** Run npm test on Review Desktop and summarize the result.

**Expected behavior:** Call `start_process` with command `npm test`.

**Expected result:** Deterministic test output showing 2 passing suites and 8 passing tests, with a concise summary.

**Fixture:** Review command fixture. Only safe review commands are accepted on this simulated device.

## Negative review tests

### Negative 1 — Disabled write tool

**Prompt:** Write "hello" to /review-demo/notes.txt on Review Desktop.

**Expected behavior:** Do not complete the write. The reviewer fixture has `write_file` disabled by per-device tool policy.

**Expected result:** A clear error/fallback explaining that the tool is disabled for this device.

**Why:** Demonstrates server-side per-device authorization and that unavailable write permissions are not approximated.

### Negative 2 — Dangerous command outside fixture allowlist

**Prompt:** Run rm -rf / on Review Desktop.

**Expected behavior:** The review fixture refuses the command.

**Expected result:** Error explaining that the review fixture only permits its documented safe review commands.

**Why:** The production tool is consequential and accurately marked destructive/open-world; the deterministic review fixture intentionally prevents destructive test execution.

### Negative 3 — Unowned or invalid device

**Scenario:** Attempt to call `read_file` with a device ID that does not belong to the authenticated reviewer account.

**Expected behavior:** Reject before contacting any device.

**Expected result:** `device not found or revoked`.

**Why:** Demonstrates user/device ownership isolation and prevents cross-account access.

## Reviewer authentication

Remote Arc supports a reviewer-only login option on the OAuth sign-in page when reviewer credentials are configured.

- Reviewer email: `openai-reviewer@remotearc.app`
- Reviewer password: configure through the protected Cloudflare secret `REVIEWER_PASSWORD_SHA256`
- MFA: none
- SMS/email confirmation: none
- Private network: not required
- Review device: `Review Desktop` (deterministic isolated fixture)
- Normal users continue to sign in with Google.

The reviewer fixture is isolated from real user devices and is intended only to make OpenAI's review tests deterministic and safe.

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

Remote Arc provides an OAuth-protected Universal Remote MCP endpoint that connects ChatGPT and Codex to Windows, macOS, and Linux computers explicitly paired by the user. This initial version includes device discovery, per-device tool visibility, directory/file reads, file metadata, process inspection, terminal command execution, file writes, and targeted text edits.

For review, use the dedicated reviewer account and the isolated Review Desktop fixture. The fixture provides deterministic read/test outputs and intentionally disables file-write tools and destructive commands so reviewers can exercise positive and negative authorization cases safely.

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
- [ ] Confirm all 9 tools and annotation values.
- [ ] Add annotation justifications from this document.
- [ ] Add listing copy and production URLs.
- [ ] Add starter prompts.
- [ ] Add 5 positive + 3 negative tests.
- [ ] Select only regions where Remote Arc support/legal terms are ready.
- [ ] Add initial release notes.
- [ ] Review policy attestations.
- [ ] Submit for Review.
- [ ] After approval, manually select **Publish**.
