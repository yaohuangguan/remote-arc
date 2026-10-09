# Passwordless email sign-in

Remote Arc offers Google OAuth and passwordless email sign-in on the **same D1 user/session model**. Device pairings, MCP grants and account entitlements remain attached to the existing user ID.

## Prerequisites

1. Verify `remotearc.app` in Resend (including its SPF/DKIM records) and confirm that the domain status is **Verified**, not Pending.
2. Create a Resend API key with sending permission for this application. Store it in the Cloudflare Worker as the **secret** `RESEND_API_KEY`. Do not put it in Git, screenshots or chat.
3. Generate an independent, random 32+ byte secret and store it in the same Worker as `EMAIL_AUTH_SECRET`. This key signs the OTP hashes; do not rotate it during outstanding 10-minute sign-in flows.
4. Optionally set `EMAIL_FROM` to a verified sender at `remotearc.app`. The default is `Remote Arc <login@remotearc.app>`.
5. Apply D1 migration `0024_email_login.sql` to the production `remote-link-auth` database **before** enabling email sign-in.

From `apps/relay`, with a Cloudflare account already authenticated:

```sh
pnpm exec wrangler d1 migrations apply remote-link-auth --remote
pnpm exec wrangler secret put RESEND_API_KEY
pnpm exec wrangler secret put EMAIL_AUTH_SECRET
pnpm exec wrangler secret list
```

Pass secret values interactively; do not append them to shell history. Confirm the deployment workflow actually applied the migration, since the current GitHub Actions deploy can continue when its Cloudflare token lacks D1 migration permissions.

## Flow and security

- `GET /auth/login`: Google and, when both secrets are configured, email.
- `POST /auth/email/request`: same-origin form, IP throttling (3 requests/minute), per-address cooldown (60 seconds) and cap (5 send attempts/24-hour window).
- A six-digit code is generated cryptographically, stored only as an HMAC-SHA256 digest and expires after 10 minutes. An OTP permits no more than five wrong attempts.
- `POST /auth/email/verify`: atomically consumes the code before issuing the existing 30-day secure HttpOnly session cookie.
- New users get a reserved `email:<uuid>` placeholder in `google_sub` for compatibility with the legacy NOT NULL schema. Verified Google login to the same email replaces that placeholder and keeps the same user ID. A future schema migration can normalize this into a nullable Google identity.
- Existing Google users signing in by email receive the existing user ID, not a duplicate account. Dedicated reviewer demo accounts are excluded from email OTP.
- Invalid return URLs are rejected back to the app origin, and OTPs never appear in links, query strings or logs.
- Resend only delivers email; it never creates sessions or manages device/MCP permissions.
- On mail provider failure, the challenge is invalidated and a 503 error is returned.

Before enabling this publicly, confirm at least one **real Resend delivery** and login from a new browser. Local tests mock mail delivery and do not prove DNS verification, delivery or inbox placement. If automated abuse increases, add Turnstile at the request form and a stricter daily sender budget.

## Validation

```sh
pnpm --filter @remotearc/relay typecheck
pnpm --filter @remotearc/relay test:security
pnpm --filter @remotearc/ui typecheck
pnpm --filter @remotearc/ui build
```
