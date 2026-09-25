# Tests

Tests are colocated with the code they cover so each service can run independently:

- Core API unit tests: `backend/core-api/src/**/*.test.ts`
- Core API database integration tests: `backend/core-api/src/db/*.integration.test.ts`
- Trippy service tests: `backend/trippy-service/tests/`
- Frontend unit tests: `frontend/src/lib/*.test.js`
- Shared contract fixtures: `packages/contracts/fixtures/`

From the repository root, run the CI test and build checks with:

```sh
pnpm contracts:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm --dir frontend test
pnpm build
```

Database-backed tests require the test database described in the root README.
