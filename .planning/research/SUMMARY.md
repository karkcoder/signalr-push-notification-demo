# Project Research Summary

**Project:** push_notification_demo (SignalR + React real-time notification demo)
**Domain:** Real-time in-app notifications, ASP.NET Core SignalR server + React/Vite client, local-only teaching demo
**Researched:** 2026-10-26
**Confidence:** MEDIUM-HIGH

## Executive Summary

This is a small, in-memory, two-process teaching demo: an ASP.NET Core minimal-API host with one typed SignalR hub, and a React/Vite client with a single `HubConnection` per tab. Experts build it with one thin hub for client-initiated calls (broadcast, user, group, join/leave), `IHubContext` for everything server-initiated, and one `ReceiveNotification` event that feeds a single client handler (list, toast, unread count). The server-originated path is `POST /api/tasks` returning 202, a `Channel<T>` queue, and a `BackgroundService` that waits about 10s and pushes to the poster via `Clients.User`. That path only works because of a fake-login `IUserIdProvider` that reads the username from the connect URL query string.

Recommended approach: .NET 10 LTS (8 and 9 lose support on 2026-11-10), `@microsoft/signalr` 10.0.11, React 19.3.1, Vite 8.3.5, `sonner` for toasts, and no state, router, CSS, or auth libraries. Build in dependency order: connect skeleton, then broadcast, then identity and targeting, then the background worker, then reconnect and unread polish, then the README and presentation. Each step ends in something demonstrable with two tabs.

The main risks are all well understood and cheap to prevent if handled in the right phase. They are credentialed CORS misconfiguration, React StrictMode double-mount (duplicate connections and toasts), group membership lost on reconnect, a serial worker loop that makes a second task take 20s, `localStorage` collapsing the two tabs into one user, and `dotnet` not being on PATH on this machine. Nothing was run against a live hub in this research, so server snippets are unexecuted and the first phases should verify them early.

## Key Findings

### Recommended Stack

.NET 10 (SDK 10.0.402 already at `~/.dotnet`, not on PATH) with in-box SignalR and Minimal APIs, scaffolded with `dotnet new web -f net10.0`. Client from `create-vite` `react-ts` with TypeScript pinned at the template's `~6.0.3` (not 7.x) and `oxlint`. Default JSON protocol, camelCase. See STACK.md.

**Core technologies:**
- .NET 10 + SignalR (shared framework): hub, `IHubContext`, `IUserIdProvider` with no extra NuGet packages
- Minimal APIs: one readable `Program.cs`, `POST /api/tasks` returns 202
- `@microsoft/signalr` 10.0.11: official client, major matches server; avoid the `next` (11 preview) tag
- React 19.3.1 + Vite 8.3.5 + `@vitejs/plugin-react` 6.1.2: verified by a scaffold build
- `sonner` 2.0.8: one `<Toaster />`, imperative typed toasts, no CSS import
- `Channel<T>` + `BackgroundService`: the 202-and-leave-the-request lesson

Key choices: absolute hub URL with explicit CORS (`WithOrigins("http://localhost:5173")`, `AllowCredentials`, GET/POST/DELETE, `UseCors` before `MapHub`); fixed ports 5080 (server) and 5173 (client) kept in one constant or `VITE_API_URL`; `Hub<INotificationClient>` typed hub.

### Expected Features

**Must have (table stakes):**
- Connection status (connecting, connected, reconnecting, disconnected) with a manual reconnect button
- Notification list (newest first) plus toast, kind/source styling (broadcast, user, group, task)
- Broadcast, targeted-to-user, and group send with join/leave
- Fake username login via `IUserIdProvider` (clearly labeled not-auth)
- `POST /api/tasks` returning 202, worker waits about 10s, "Task completed" to the poster, with a pending line in the UI
- Automatic reconnect with feedback and group re-join on reconnect
- Unread badge with mark-all-read
- README two-tab walkthrough and presentation script; run in two commands

**Should have (differentiators):**
- Debug panel (connectionId, username, joined groups)
- Typed hub (adopted in the stack)
- Same user in two tabs both receive (free, call it out)
- Simulated-disconnect button, users-online list (v1.x, only if rehearsal demands)

**Defer (v2+):**
- Stateful reconnect or catch-up buffer, real JWT auth, persistence and server read state, backplane or scale-out (one slide only), task progress steps

### Architecture Approach

Two inbound paths (hub invoke over WebSocket, HTTP POST) and one outbound path (`Clients.*` or `IHubContext`), all converging on a single `ReceiveNotification` client event. The server is organized by concept (Hubs, Identity, Models, Tasks) with `Program.cs` holding all wiring. The client keeps `@microsoft/signalr` out of components: `UserProvider` (sessionStorage) feeds `NotificationProvider`, which owns the connection in a `useEffect` keyed on username, and a thin `useNotifications()` hook serves the components.

**Major components:**
1. `NotificationHub` (`Hub<INotificationClient>`): thin, stateless client-to-server entry points; stamps id, time, and sender from `Context.UserIdentifier`
2. `QueryStringUserIdProvider` (singleton): maps `?username=` to the user id, normalized (trim, lowercase)
3. `TaskQueue` + `TaskWorker` + `POST /api/tasks`: channel hand-off, concurrent job processing, per-job try/catch, `IHubContext` push to the poster
4. `NotificationProvider` + `useNotifications()`: connection lifecycle, status, reducer state (list, joined groups), derived unread count, group re-join on reconnect
5. UI components: LoginBox, ConnectionStatus, SendForm, GroupControls, NotificationList, TaskButton

### Critical Pitfalls

1. **Credentialed CORS wrong** (wildcard plus credentials, `UseCors` after `MapHub`, `127.0.0.1` vs `localhost`, Vite drifting to 5174): explicit origin, `UseCors` first, `strictPort: true`, and no `SetIsOriginAllowed(_ => true)`.
2. **StrictMode double-mount** (duplicate connections, handlers, toasts, "stopped during negotiation"): one effect that builds the connection, registers handlers before `start()`, and on cleanup does `off()` and waits for `start()` to settle before `stop()`. Do not remove StrictMode.
3. **Identity via `ConnectionId` or none**: register `IUserIdProvider` as a singleton, normalize names, rebuild the connection on username change, use `sessionStorage` (not `localStorage`) so two tabs can be two users.
4. **Fragile worker**: serial loop makes a second task take 20s, unhandled exceptions stop the host, and `Task.Delay` without `stoppingToken` hangs Ctrl+C. Process jobs concurrently, wrap each in try/catch, pass the token, and capture the username in the job record (never `HttpContext`).
5. **Reconnect gaps**: defaults give up after about 45s, initial `start()` is never retried, and groups are lost on reconnect. Use a custom never-give-up retry policy, a retry loop on initial start, and re-join groups in `onreconnected` (or re-derive them in `OnConnectedAsync`).

Also: client-side stale closures and side effects inside state updaters (keep updaters pure, derive unread), method-name mismatch (typed hub plus shared constants plus log level), and environment (`dotnet` not on PATH).

## Implications for Roadmap

Suggested phases, aligned to the draft in `.planning/notes/signalr-notification-demo-decisions.md`. The ordering is dependency-driven and the researchers agree on it.

### Phase 1: Skeleton, Environment and Connection
**Rationale:** Most "it doesn't work" problems (CORS, ports, SDK, StrictMode) show up here, so isolate them first. Build the connection effect with the `[username]` shape from day one (placeholder username) to avoid a Phase 3 rewrite.
**Delivers:** Server (`AddSignalR`, CORS, empty typed hub, `MapHub`, fixed port 5080), Vite client on 5173 (`strictPort`), `NotificationProvider` with correct connection lifecycle, status badge, initial-start retry loop, README with required SDK/Node versions and PATH note, `global.json`.
**Addresses:** Connection status, CORS and negotiation, run in two commands.
**Avoids:** Pitfalls 1, 2, 9, 11, 14, 16, 19 (and the initial-start part of 7).
**Verify:** Fresh clone shows "Connected"; one server connection per page load under StrictMode; start-client-before-server recovers; Network tab shows 101 upgrade.

### Phase 2: Broadcast, List and Toast
**Rationale:** Smallest end-to-end SignalR path, and it establishes the single `ReceiveNotification` handler and payload shape that every later phase reuses.
**Delivers:** `Notification` model, `INotificationClient`, `SendBroadcast`, SendForm, list (capped at about 50, keyed by server id), `sonner` toast with kind styling, shared event-name constants and TS type.
**Avoids:** Pitfalls 3 (pure updaters, toast outside updater), 8, 15, 17, 18.
**Verify:** Type in tab A, one toast in each tab; no double toasts in dev.

### Phase 3: Identity, Targeted and Groups
**Rationale:** `Clients.User` needs `IUserIdProvider`, and the worker in Phase 4 needs a username. This is the heaviest correctness phase.
**Delivers:** UserProvider (`sessionStorage`), LoginBox, `QueryStringUserIdProvider` (singleton, normalized), `SendToUser`, `JoinGroup`/`LeaveGroup`/`SendToGroup`, group UI, debug panel (connectionId, user, groups), sender derived from `Context.UserIdentifier`, "DEMO ONLY" comments.
**Avoids:** Pitfalls 4, 5, 10, 12.
**Verify:** Two tabs same user both receive; a different user does not; groups reach members only.

### Phase 4: Server-Originated Task
**Rationale:** Depends on identity. This is the demo's differentiating scenario (202, then WebSocket push).
**Delivers:** `TaskQueue` (bounded `Channel`), concurrent `TaskWorker`, `POST /api/tasks` (`X-Username`, 202), TaskButton with a pending line, CORS preflight verified for the custom header.
**Avoids:** Pitfalls 5, 6.
**Verify:** POST returns immediately; completion about 10s later only in the poster's tabs; two rapid POSTs both complete at about 10s each; bad job does not kill the host; Ctrl+C is quick.

### Phase 5: Reconnect and Unread Polish
**Rationale:** The group re-join needs Phase 3; the badge needs Phase 2. Doing both last keeps earlier phases simple.
**Delivers:** Custom never-give-up retry policy, status states, `rejoinGroups` in `onreconnected` (idempotent `JoinGroup`), "you may have missed notifications" banner, manual reconnect button, unread badge derived from data plus mark-all-read.
**Avoids:** Pitfalls 3 (badge), 7, 13.
**Verify:** Restart the server mid-demo and keep it down over a minute; client recovers; group sends work again.

### Phase 6: README Walkthrough and Presentation
**Rationale:** Stated deliverable. Order the demo script to match the code-reading order.
**Delivers:** Numbered two-tab walkthrough with expected results (including reconnect test), presentation script or slides covering limits (no delivery guarantee, spoofable identity, in-memory loss, scale-out/backplane, JWT follow-up), pre-recorded fallback capture, "use `dotnet run`, not `dotnet watch`" note.
**Avoids:** Pitfalls 11, 12, 13 (rehearse with both tabs visible).

### Phase Ordering Rationale

- Dependency chain: connection, then payload and handler, then identity, then worker, then reconnect, then docs. Identity before worker is a hard dependency.
- Phases 1 and 2 could merge into one slice if the roadmap wants fewer phases, but keep Phase 1's checkpoint separate.
- The unread badge could move to Phase 2 if Phase 5 is thin, because it needs only the receive path.
- No separate data or auth phase: both are out of scope.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** moderate. The StrictMode-safe connection effect and the initial-start retry loop are unexecuted in research. A short spike or the first task should prove them before building on top. Also decide `withCredentials`/`AllowCredentials` deliberately.
- **Phase 5:** moderate. Re-derive-in-`OnConnectedAsync` vs client re-join must be chosen. If the stateful-reconnect stretch is considered, group behavior is unverified (LOW) and must be tested first.

Phases with standard patterns (skip research-phase):
- **Phases 2, 3, 4, 6:** Well-documented Microsoft Learn patterns (`Hub<T>`, `IUserIdProvider`, `IHubContext` + `BackgroundService` + `Channel`). Phase 4 only needs the concurrency fix applied.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions read from npm and Microsoft Learn on the research date; client toolchain verified by a real scaffold build. Server code unexecuted. |
| Features | MEDIUM-HIGH | Scope is anchored in PROJECT.md; UX conventions from domain knowledge, no external fetch. |
| Architecture | MEDIUM-HIGH | Server patterns are stable, long-standing APIs; React lifecycle details not re-verified live. |
| Pitfalls | MEDIUM-HIGH | Group/IHubContext/timeouts confirmed in official docs; StrictMode, HMR, and throttling items are community knowledge. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- Contradictions between researchers, to settle in Phase 1/3 planning:
  - Query parameter name: STACK uses `username`, ARCHITECTURE uses `user`. Pick `username` and keep it in one constant on each side.
  - Channel: STACK suggests bounded(100), ARCHITECTURE suggests unbounded. Use bounded (also reads well in the presentation).
  - Worker concurrency: ARCHITECTURE uses `Parallel.ForEachAsync` (max 8), PITFALLS suggests a task per job. Either is fine; just do not run jobs serially.
  - CORS credentials: required by Microsoft docs for SignalR, but PITFALLS suggests `withCredentials: false` and dropping `AllowCredentials` for a fake-login demo. Decide once in Phase 1 and comment why.
  - Notification payload field: `type` (STACK) vs `kind` (FEATURES, PITFALLS). Pick one (`kind` is suggested) and use it in both the C# record and the TS type.
  - Reconnect group handling: client `onreconnected` re-join vs server `OnConnectedAsync` from a store. Pick one rule and teach it.
- `dotnet` is not on PATH; the README and any run scripts must handle `DOTNET_ROOT`/`PATH` or "two commands" fails. (Verified: SDK 10.0.402 is installed at `~/.dotnet`.)
- Nothing was run against a live hub; treat all server snippets as unverified until Phase 1 and 3 smoke tests.
- Stateful reconnect and group survival: LOW confidence, keep out of the base demo.
- .NET 8/9 end of support on 2026-11-10 is time-sensitive; confirm the .NET 10 choice with the team if their machines are locked to 8.

## Sources

### Primary (HIGH confidence)
- npm registry (2026-10-26): `@microsoft/signalr` 10.0.11, React 19.3.1, Vite 8.3.5, `sonner` 2.0.8, `create-vite` 9.3.1
- Local scaffold build (Vite 8, React 19.3.1, signalr, sonner, TS 6.0.x): passed
- Microsoft Learn (ASP.NET Core 10): SignalR JavaScript client, security/CORS, authn-and-authz (`IUserIdProvider`), HubContext, hosted services, groups, configuration
- .NET support policy: .NET 10 LTS to 2028-11-14; 8 and 9 end 2026-11-10
- Project docs: `.planning/PROJECT.md`, `.planning/notes/signalr-notification-demo-decisions.md`

### Secondary (MEDIUM confidence)
- React StrictMode double-effect behavior, Vite proxy `ws: true`, HMR connection leaks, browser WebSocket header limits, `BackgroundServiceExceptionBehavior.StopHost` default, reconnect default delays 0/2/10/30s
- Community reconnect and rejoin-group guides (code-maze)
- General notification-center UX conventions

### Tertiary (LOW confidence)
- `WithStatefulReconnect` group-membership behavior (prerelease docs, unverified)
- Background-tab throttling effects on keep-alive (browser-dependent)

---
*Research completed: 2026-10-26*
*Ready for roadmap: yes*
