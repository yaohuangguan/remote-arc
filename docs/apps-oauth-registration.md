# Apps: developer registration and end-user authorization

Status: OAuth implementation merged; production platform clients still require operator registration and configuration. Check live `/api/apps/status` for current readiness. A code release and an OAuth configuration flag do not establish real-account acceptance.

## Two separate responsibilities

Remote Arc registers one developer application per identity platform, configures its callback URLs, and stores its client credentials on the server. This identifies **Remote Arc** on the provider's consent screen. A developer registration grants access to no user's mailbox, calendar, repositories, or workspace.

Each end user signs in to Remote Arc, chooses an App, and authorizes their **own account** on the provider's site. The resulting connection belongs to that Remote Arc user. For Remote Arc-managed OAuth integrations, users do not register developer applications, enter client credentials, or share passwords with Remote Arc. Two API-credential connectors instead use credentials from the user’s own API account/project; X now uses Remote Arc-managed OAuth and platform-project API billing. See [the expanded catalog and release gates](apps-expansion.md).

The product flow is: Apps → choose an integration → choose permissions → provider consent → return to Apps with the connected account and status. Write permission is an explicit choice; approval of an individual action remains separate from granting OAuth permissions. Reconnection is required when a provider revokes or expires the grant.

## Product model and scaling

Remote Arc owns and operates the connector platform. Lindy and Composio are product references, not runtime dependencies, OAuth brokers, or credential custodians for this implementation.

The default model is **Remote Arc-managed developer applications**: Remote Arc registers its own platform clients once and each user authorizes their own account. Enterprise-owned OAuth clients are a separate future option, not the current end-user setup flow and not implemented by this global-client configuration.

For a larger catalog, reuse authentication, encrypted credential storage, refresh, user isolation, approvals, rate limiting, and usage accounting. Give each integration its own versioned definition and bounded actions. Discover actions on demand instead of exposing hundreds of schemas to the model at once. Keep unused integrations idle rather than running a polling service per listed app.

Publishing an integration requires real executable actions and acceptance checks. An icon or catalog entry alone does not establish support. Provider review, API changes, credential rotation, troubleshooting, and paid upstream services remain costs even when OAuth registration itself has no fee. An enterprise-owned client does not automatically move token storage out of Remote Arc or eliminate provider approval requirements.

API quotas and charging rules must be verified per provider and environment before activation. Google Workspace has announced changes to API daily thresholds and scaled usage; do not assume Gmail or Calendar API usage remains unlimited or universally free. Slack's commercially distributed integrations require the appropriate Marketplace distribution path; template/BYO apps are not a general substitute for that review.

References: [Google Workspace API scaling](https://developers.google.com/workspace/tools-safety), [Slack commercial app distribution and rate limits](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/).

## Prepared registration configuration

Generate a configuration pack directly from the runtime provider catalog and callback function:

```sh
pnpm --filter @remotearc/relay exec tsx scripts/apps-registration.ts --origin https://mcp.remotearc.app
```

This command makes no network requests and reads no secrets. It prints registration fields, a Slack manifest, scopes, callback URLs, and server secret **names**. It does not register applications, deploy anything, or enable Apps.

Use the actual HTTPS App origin of the environment being registered. Production currently uses `https://mcp.remotearc.app`; do not use the marketing domain or a PR preview URL. Register separate development/staging applications where practical and keep credentials, token keys, user connections, and databases isolated. A staging endpoint must be deployed and its login/session flow verified before its callback URLs are offered to users.

| Platform | Connector callbacks at the current production App origin |
| --- | --- |
| GitHub | `https://mcp.remotearc.app/api/apps/oauth/github/callback` |
| Slack | `https://mcp.remotearc.app/api/apps/oauth/slack/callback` |
| Google | `https://mcp.remotearc.app/api/apps/oauth/gmail/callback`, `https://mcp.remotearc.app/api/apps/oauth/google_calendar/callback` |
| Microsoft | `https://mcp.remotearc.app/api/apps/oauth/outlook/callback`, `https://mcp.remotearc.app/api/apps/oauth/microsoft_calendar/callback` |

The original four platform registrations cover six initial connectors. The current generated pack covers fifteen identity-platform registrations for 27 OAuth connectors, plus two user-owned API credential connectors. The table above documents the original callbacks; the generated pack is the complete current callback list. The pack declares the full supported scope set so it can support both read and write users. The actual authorization URL requests only the user's selected permissions.

## GitHub

Create an organization-owned OAuth App in [Remote-Arc organization application settings](https://github.com/organizations/Remote-Arc/settings/applications). Use the generated name, homepage, and exact callback. Keep expiring user access tokens enabled and device flow disabled. Store its client ID and secret as `APP_GITHUB_CLIENT_ID` and `APP_GITHUB_CLIENT_SECRET`.

The current direct adapter uses authorization-code OAuth with S256 PKCE, `read:user`, `repo`, and `offline_access`. GitHub's OAuth `repo` scope is broad and includes upstream write access; a Remote Arc read-only connection still rejects all write operations locally. Display this distinction at consent rather than claiming the provider token is read-only. A future GitHub App adapter can provide repository selection and finer provider permissions; it must have its own implementation and acceptance tests.

Organization policy or SSO can require approval from the user's organization administrator even after personal consent. Report that state to the user; do not ask them for another account's token.

Reference: [creating an OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app), [authorizing OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

## Slack

At [Slack's app dashboard](https://api.slack.com/apps), choose Create New App → From a manifest and import the generated `slack.manifest` object. Choose the development workspace as the app owner; it is not a shared workspace connection for all Remote Arc users.

The adapter acts using a **user token**. Configure User Token Scopes, not Bot Token Scopes: `channels:read`, `channels:history`, `search:read`, with `chat:write` available for users who enable writes. The initial scope set covers public channels and message search; it does not claim private-channel or DM support. Enable token rotation. Add the exact generated redirect URL, and configure distribution for external workspaces before public onboarding.

Store Basic Information → App Credentials as `APP_SLACK_CLIENT_ID` and `APP_SLACK_CLIENT_SECRET`. Do not put a developer's `xoxp-` or `xoxb-` token into these fields. Workspace administrators may need to approve installation.

Reference: [manifest schema](https://docs.slack.dev/reference/app-manifest/), [OAuth installation](https://docs.slack.dev/authentication/installing-with-oauth/), [token rotation](https://docs.slack.dev/authentication/using-token-rotation/).

## Google: Gmail and Google Calendar

In [Google Cloud](https://console.cloud.google.com/auth/overview), select a project for Remote Arc Apps and enable the Gmail API and Google Calendar API. Configure the brand, authorized domain, support contact, homepage, privacy policy, and terms using the real public product details. Create a Web application OAuth client and register both exact Google callbacks from the pack.

Use a dedicated Apps client. Do not silently reuse the existing Google login client: login and mailbox/calendar grants have separate purposes and revocation behavior.

The audience must support external users for a public product. Start in Testing with explicitly listed testers. Declare the generated scopes under Data Access. Gmail `gmail.readonly` and `gmail.modify` are restricted scopes; public launch needs the applicable verification and, depending on data handling and exceptions, a security assessment. Testing-mode refresh tokens for these scopes normally expire after seven days. Calendar verification requirements also depend on the selected scopes. Do not present testing-mode access as production-ready for arbitrary users.

Store the new client's credentials as `APP_GOOGLE_CLIENT_ID` and `APP_GOOGLE_CLIENT_SECRET`. The two connectors still get separate per-user connections and selected permissions, even though they share the developer client.

Reference: [web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), [refresh-token lifetime](https://developers.google.com/identity/protocols/oauth2).

## Microsoft: Outlook mail and Outlook Calendar

Create a registration in [Microsoft Entra](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade). Choose accounts in any organizational directory **and personal Microsoft accounts**, matching the adapter's `common` authority. Register both callbacks as **Web** redirects. Do not enable implicit grant or public-client flows.

Configure delegated Microsoft Graph permissions, not application permissions: `User.Read`, `Mail.Read`, `Calendars.Read`, plus `Mail.ReadWrite`, `Mail.Send`, and `Calendars.ReadWrite` for supported writes. The OAuth request includes `offline_access` for refresh tokens. An enterprise tenant can require its administrator's consent under its own policies.

Create a client secret, record its expiry in the operator's secret manager, and use its **Value**, not its Secret ID, for `APP_MICROSOFT_CLIENT_SECRET`. Store the Application (client) ID as `APP_MICROSOFT_CLIENT_ID`. The shared platform client does not share one user's mailbox or calendar with other users.

Reference: [register an application](https://learn.microsoft.com/en-us/graph/auth-register-app-v2), [authorization-code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).

## Server configuration and activation

All configured platform client ID/secret pairs and the token vault key are server-side configuration. Never commit them, put them in browser variables, send them through an AI prompt, or ask end users to supply them. Enter credentials through the deployment platform's secret mechanism; the client IDs can also be stored there for consistent operations.

`APP_TOKEN_KEY` must be base64 encoding of 32 cryptographically random bytes. Generate it in the deployment environment and save it securely without printing it into chat or a build log. Existing encrypted connection and approval records depend on it; changing it without a migration invalidates those records. Separate environments require separate keys.

`ENABLE_APPS=1` enables the Apps runtime, which is already deployed. A provider still reports `ready: false` and cannot authorize until its required credentials and platform settings exist. Registering an OAuth client alone does not verify or activate a usable connection. Apply credentials through the protected deployment workflow without modifying or rotating `APP_TOKEN_KEY`.

## Real-account acceptance

1. Connect a test user's own account for each of the six connectors, then connect a second Remote Arc user and confirm each can see only their own connections and results.
2. Test consent denial, missing permissions, provider/admin restrictions, expired/revoked tokens, refresh-token rotation, disconnect, and reconnection. Verify the UI shows the actual connection state and no token appears in the browser, logs, MCP responses, or model context.
3. Perform a read against a dedicated test repository/channel/mailbox/calendar and compare the result with the provider UI.
4. Prepare a write, confirm no write occurred before approval, inspect the exact destination and payload, approve, and verify the provider result. Use an explicitly approved test channel and email recipient. Repeat the same request ID and confirm no duplicate action.
5. Revoke or change the connection before approving a pending action, test concurrent submissions, and confirm stale approvals cannot execute. Simulate a write timeout and confirm it is not automatically repeated.
6. Verify both themes and mobile layouts, reconnect links, API/MCP scope upgrades, and regression of existing devices, MCP tools, and Routines.

Protocol mocks and SQLite tests provide development coverage. They do not replace these real-account checks.

## How this differs from Composio

[Composio managed auth](https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app) supplies developer OAuth applications for supported integrations. Its customers can skip those registrations, while every end user still grants consent for their own account. Composio stores and refreshes those connected-account credentials. Using a customer's own OAuth client is also supported for branding, scopes, and quotas.

This implementation uses Remote Arc's own direct adapters and credentials. The product follows a comparable user-authorization experience while retaining its own authentication, execution, approvals, and cost controls across Connect and Arc Agent. Neither Lindy nor Composio is part of the runtime or deployment architecture.


## Read-only production readiness preflight

Use the registry-derived operator check before and after configuring each identity platform:

```sh
pnpm --filter @remotearc/relay apps:preflight
pnpm --filter @remotearc/relay apps:preflight --json
pnpm --filter @remotearc/relay apps:preflight --require-p0
```

This tool queries only the **public metadata** endpoint. It does not access Cloudflare secrets, create provider OAuth applications, authenticate any user, modify D1, or trigger provider API costs. It shows group-level Client ID/Secret **names** and exact callback URLs; ready means configured, not tested.

Prioritize GitHub, Google, Slack, Microsoft and Notion. After registration, confirm provider API enablement, external consent/review eligibility, token rotation, and end-to-end operations with a specifically authorized test account. Mark a provider live-verified only after it successfully reads, and where permitted writes to, a dedicated test resource. Provider review may take longer than this engineering work.
