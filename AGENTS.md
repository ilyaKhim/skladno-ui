# GoDeck monorepo

- Frontend application code belongs in `frontend/` (Next.js, React). Backend API code belongs in `backend/` (Java 26, Spring Boot).
- Run frontend commands from the repository root with `pnpm dev`, `pnpm build`, `pnpm typecheck`; root scripts delegate to the frontend workspace.
- Keep authentication behavior on the server. Use the real HTTP authentication endpoints and do not store credentials in browser storage.
- Do not commit `backend/target`, `.tools`, `.env` files, passwords or private keys.
- Changes to authentication require backend integration tests and the local HTTP smoke test. Local infrastructure: `pnpm infra:up`.
- v0 edits should remain in `frontend/`. Merge product changes in GitLab; GitHub main is synchronized automatically.

## Engineering discipline: ub-mode

- The main agent and project sub-agents use the installed `$ub-mode` skill for implementation, refactoring, and code review. Read its full `SKILL.md` before applying it; analysts use its domain/boundary and minimal-scope principles without leaving their read-only role.
- Source: https://github.com/unclebob/ub-mode, pinned to `3da62bf3fcfd2034de41f30d920d2739e566171f`. Keep one upstream copy, not separate rule copies in each role. See `.codex/agents/README.md` for installation and scope.
- Prefer the smallest verifiable change, behavior-focused tests, explicit domain types, and removal of unnecessary complexity. Refactor in small steps; do not redesign unrelated working code or add abstractions merely to improve a metric.
- The user's current task and project safety rules take precedence over the skill's workflow defaults. It does not authorize commit/push/MR/deploy, direct pushes to `main`, extra agents, or deletion of worktrees. Keep existing approval and ownership rules. When the user forbids running tests, do not run them for TDD or a quality gate; report the verification gap.
- Crapper, Dryer, and Mutator are installed locally; pinned revisions and usage boundaries are in `.codex/agents/README.md`. Installation is not permission to change CI or run broad mutation/cleanup campaigns. Default Crapper and Mutator runs can execute tests or install coverage dependencies: use only explicitly approved scope/commands, and respect any test prohibition. Report gates not run; never claim a numeric score without a tool result.
- Keep the action/reason log in concise progress updates and the final handoff. Do not create persistent per-task log files unless requested. If the skill is unavailable, say so and continue with the existing project rules rather than claiming it was applied.

## Project sub-agents

- Project-scoped roles are defined in `.codex/agents/`: `analyst`, `frontend_developer`, `backend_developer`, and `reviewer`. See `.codex/agents/README.md` for responsibilities and invocation examples.
- When the user requests team delegation, use the analyst to establish scope and contracts, assign non-overlapping implementation work, then request an independent reviewer after implementation. The main agent coordinates integration and final verification; do not launch the whole team for a simple question.
- Analyst and reviewer are instructed not to edit files; these instructions do not create separate filesystem permissions. All roles remain subject to the parent session's permissions and applicable instructions.
- Assign one owner to shared files and serialize full builds/E2E runs. Preserve user and parallel-agent changes. Do not infer permission for commit/push/MR/deploy from a role assignment.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
