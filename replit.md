# Classroom Link

A minimal real-time sentence link from `/teacher` to `/student`.

## Run & Operate

- `pnpm --filter @workspace/classroom-link run dev` — run the single Express server with React and Socket.IO
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `PORT`; `BASE_PATH` defaults to `/`. No database or secrets are required.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- Keep this product to the real-time link only unless the user requests more. No database, logins, or message history.
- One Express HTTP server serves both React pages and Socket.IO. Do not split the app into separate frontend/backend servers.
- State is intentionally in memory and resets when the server restarts.

## Product

The teacher sends a sentence; connected students see the latest sentence instantly without refreshing. Connecting or reconnecting retrieves the current in-memory sentence.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
