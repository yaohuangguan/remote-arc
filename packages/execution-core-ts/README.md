# TypeScript Execution Core compatibility implementation

The primary Go Execution Core is in `packages/execution-core`. This module is
retained as `@remotearc/execution-core-ts` for the explicit `remotelink --ts`
runtime, migration/Undo compatibility and controlled benchmarks. It is not the
default device execution engine from 0.6.0.

Run its existing integration tests with
`pnpm --filter @remotearc/execution-core-ts test:integration`.
