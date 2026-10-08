# Go Execution Core

This module is part of the **Remote Arc monorepo**. It is not independently published or licensed as a separate open-source project.

It owns the Go device runtime's filesystem and process execution, policy/path enforcement, shared tool protocol, local Undo snapshots, and atomic writes. The Agent in `apps/device` depends on it through a local Go module replacement.

## Compatibility constraints

- Keep the `~/.remotearc` configuration and Undo snapshot paths unchanged, including `REMOTEARC_HOME` handling.
- Preserve the existing JSON tool definitions, safety guards, wire protocol, execution log behavior, and file/Undo formats.
- Run `pnpm device:contract --check` and `pnpm test:device` at repository root. The latter runs Go Core formatting, vet and race tests, Agent tests, TS/Go compatibility, MCP smoke, and recovery tests.
- Keep the TS fallback during real-device regression and benchmark comparison. Do not promote this extraction on its own as a production release.

The initial extraction intentionally moves shared configuration, protocol and policy packages with the core to avoid changing runtime semantics. Any future decoupling of device pairing/configuration must be a separate, explicitly tested change.
