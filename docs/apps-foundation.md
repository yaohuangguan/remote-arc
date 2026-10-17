# Native Apps foundation

Remote Arc runs its own connector infrastructure and calls provider APIs directly. There is no Lindy or Composio runtime dependency. The default product model is Remote Arc-owned OAuth clients with per-user consent; end users do not register developer applications. User-owned API credentials are supported for Runway and WhatsApp Business; the remaining 27 connectors use platform-managed OAuth. Enterprise-owned OAuth clients and remote official MCP adapters remain future extensions.

## Implemented surface

The registry now contains 29 native API integrations in eight categories: 27 OAuth connectors and two user-owned API credential connectors. See [Apps expansion and release gates](apps-expansion.md) for exact scope and costs. Each operation has a bounded schema and fixed provider URL. There is no arbitrary HTTP execution tool.

The authenticated App host exposes:
- `GET /api/apps`: provider configuration state, available operations and the current user's connections.
- `POST /api/apps/authorize`: creates an expiring, single-use OAuth request for the selected provider and permissions.
- `GET /api/apps/oauth/:provider/callback`: consumes that user's state, exchanges the code, identifies the account and encrypts its credentials.
- `POST /api/apps/connections`: validates a user-owned API credential, settings, usage consent and daily operation limit.
- `PATCH /api/apps/connections/:id`: changes local connection permissions when the upstream grant supports them.
- `DELETE /api/apps/connections/:id`: immediately removes local capability, cancels pending approvals, and attempts upstream revocation.
- `POST /api/apps/call`: validates a connection, operation, arguments and stable request ID; reads execute and writes first await human approval.
- `GET /api/apps/approvals`, `POST /api/apps/approvals/:id`: display exact requested actions and record the owning user's decision.

Writes require the App origin; POST/PATCH requests also require JSON. Every route authenticates the real session. OAuth state, tokens, action arguments and results are owner-bound. Token storage uses AES-256-GCM with authenticated owner/provider/record context. Refresh leases and connection generations prevent refresh/disconnect races from reactivating a disconnected connection.

The optional MCP tools are `list_apps` and `call_app`. They require incremental `apps:read` and `apps:write` scopes; the existing core tool set and default OAuth scopes are unchanged. The runtime can also be reused by the future Agent, with the same user identity and policy checks.

## Writes and uncertainty

An upstream write grant does not authorize an individual write. The exact normalized request is encrypted and saved for human review. Approval expires after ten minutes and is fenced by the connection generation. Changing permissions, reconnecting, or disconnecting invalidates earlier approvals.

Slack messages show the channel name before approval. Calendar update/delete requests include the current target and entity version. The target is checked again before dispatch; calendar requests also send the reviewed entity tag. A changed target requires a new request. Email sending uses the full reviewed recipients, subject and body, rather than authorizing a mutable draft ID.

A single database compare-and-swap owns execution. Reusing the same request ID returns its previous state/result. A changed payload under that ID is rejected. An uncertain dispatched write is not automatically retried. Approval in the dashboard does not itself execute the provider operation; the original client resumes with the same request ID.

Success currently means **provider acknowledgement**. It is not a claim of independent semantic verification, email delivery, or the correctness of provider content. Provider content remains untrusted data, never permission to act. Real-account acceptance and provider-specific result verification remain release work.

## Deployment and acceptance

The migrations are `0030_apps_ecosystem.sql` and `0031_apps_registry_and_usage.sql`; the second preserves existing connections and dependent action records. Apps remain off unless `ENABLE_APPS=1`; no OAuth credentials or vault key are configured by this change. No production D1 migration or live account connection has been performed.

See [registration and real-account acceptance](apps-oauth-registration.md) for the fifteen platform registrations, 27 OAuth callback URLs and two user-owned API credential connections, least permissions, credential names, provider review requirements, and isolated account tests. Real external writes must use approved test destinations.

Run `pnpm coverage:apps` to enforce 90% coverage per metric for each Apps core module, using actual source, the real SQLite schema and mocked provider protocols. The same runtime cases run in the normal security suite. Full TypeScript coverage keeps the existing repository floors. Browser acceptance covers default read access, optional write consent, permission changes, disconnection, exact approvals, disabled configuration and session expiry in both locales/themes and desktop/mobile sizes.

## Scaling direction

Provider adapters should reuse the shared auth, vault, ownership, approvals, quotas and usage controls. Add versioned action definitions and contract tests rather than copying an entire backend for each app. The current discovery endpoint paginates/searches the catalog and loads action schemas on demand. The 29-app registry has not been load-tested as a hundreds-app catalog.

Separate supported catalog size, actual enabled connections, operation depth, active-user counts and API call volume. Idle connectors should not require a dedicated process or polling loop. Provider review and maintenance remain per-integration work; upstream costs and limits must be tracked separately from hosted-model inference.

Production rollout is explicitly enabled by the combined release configuration, after protected migration/backup and vault provisioning. Missing provider clients remain unconfigured. Per-provider real-account trials follow publication at the owner’s request.
