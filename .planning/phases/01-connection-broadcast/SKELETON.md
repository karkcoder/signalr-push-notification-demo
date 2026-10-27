# Walking Skeleton — SignalR Notification Demo

**Phase:** 1
**Generated:** 2026-10-26

## Capability Proven End-to-End

> A teammate opens http://localhost:5173 in two browser tabs, sees both pills go to "Connected", types a message in one tab, and sees exactly one toast and one newest-first list row appear in both tabs (the sender's included), delivered by the server's SignalR hub.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Server framework | ASP.NET Core empty web host from `dotnet new web -f net10.0`; everything wired in one `server/Program.cs`; no controllers, no OpenAPI | .NET 10 is the LTS (8 and 9 lose support 2026-11-10). One readable file answers "how is this connected". |
| Real-time transport | SignalR typed hub `Hub<INotificationClient>`; default JSON protocol (camelCase); no MessagePack; no extra NuGet packages | The C# method name on `INotificationClient` is the wire event name, so the compiler guards the contract. JSON stays readable in DevTools. |
| Client framework | React 19.3 + Vite 8 + TypeScript `~6.0.3` from `create-vite@9.3.1` `react-ts`; `@microsoft/signalr` 10.0.11; `sonner` 2.0.8; hand-written CSS | Majors match the server. No UI kit, Tailwind, router or state library (project stack rules). |
| Data layer | None. Notification list is client state only (`useReducer`, newest first, capped at 50, de-duplicated by id). The server holds no notification state | In-memory by project decision; no persistence, no catch-up buffer. |
| Identity / auth | None in Phase 1. Anyone who can reach port 5080 can broadcast; the default run binds loopback only. Phase 2 adds a fake username through `IUserIdProvider` reading the `username` query parameter | Fake login is a project decision; JWT is a separate follow-up. |
| Cross-origin | Absolute hub URL; CORS with explicit origins `http://localhost:5173` and `http://127.0.0.1:5173`, methods GET/POST/DELETE, any header, credentials allowed; `UseCors` before `MapHub` | Verified in research: wildcard origin plus credentials makes the server refuse to start; an unlisted `127.0.0.1` origin looks like "server not running". |
| Ports and run | Server `http://localhost:5080` (single `http` profile in `launchSettings.json`, `launchBrowser` false); client `http://localhost:5173` with `strictPort`. Run: `dotnet run --project server` and `npm --prefix client run dev` | "Two commands" promise; fail loudly instead of drifting to another port. |
| Wire contract | Hub path `/hubs/notifications`; server-to-client event `ReceiveNotification`; client-to-server method `SendBroadcast`; payload `{ id, kind, message, sentAt }`; client type `AppNotification` (not `Notification`, a DOM global) | Later phases extend this additively (Phase 2 adds `from`). |
| Connection lifecycle | One hook, `useNotificationHub(hubUrl)`, called once from `App`. Defers `start()` one macrotask, waits for `start()` to settle before `stop()`, retries the initial start every 2 s with an abortable sleep, guards every state write with `disposed`. Effect deps are `[hubUrl]` | Verified under StrictMode: one server connection per page load, no console error. Phase 2 only changes the URL it is given. |
| Directory layout | `server/` (`Program.cs`, `Hubs/`, `Models/`, `Properties/`) and `client/` (`src/` with `config.ts`, `types.ts`, `notifications.ts`, `useNotificationHub.ts`, `App.tsx`, `index.css`); root `README.md` and `.gitignore` | One repo, two folders, as the project constraints state. |

## Stack Touched in Phase 1

- [ ] Project scaffold (framework init, build, lint): `dotnet new web`, `create-vite`, `dotnet build`, `npm run build`, `npm run lint`. Test runner: none, by project decision.
- [ ] Routing: one real route, the hub endpoint `/hubs/notifications` (negotiate plus WebSocket).
- [ ] Data: no database by decision; instead one real server-to-client push (`Clients.All`) and one real client-to-server invoke (`SendBroadcast`).
- [ ] UI: connection status pill, send form, newest-first list, toast, all wired to the hub.
- [ ] Run command: documented two-command local run in `README.md`.

## Out of Scope (Deferred to Later Slices)

- Username, login, send to a user or group, debug panel (Phase 2)
- Task button, `POST /api/tasks`, background worker (Phase 3)
- Never-give-up reconnect policy, group re-join, unread badge, manual reconnect button (Phase 4)
- Two-tab README walkthrough and presentation script (Phase 5)
- Browser Web Push, mobile push, JWT, persistence, stateful reconnect, scale-out backplane, automated tests (project Out of Scope)

## Subsequent Slice Plan

- Phase 2: pick a fake username per tab; send to one user or a group; debug panel
- Phase 3: `POST /api/tasks` returns 202; a background worker notifies the poster about 10 s later
- Phase 4: survive a server restart with groups restored; unread badge; manual reconnect
- Phase 5: README two-tab walkthrough and presentation script
