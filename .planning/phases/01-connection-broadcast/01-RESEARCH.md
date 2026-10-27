# Phase 1: Connection & Broadcast - Research

**Researched:** 2026-10-26
**Domain:** ASP.NET Core SignalR (.NET 10) server + React 19 / Vite 8 client, walking skeleton (connect, status, broadcast, list, toast)
**Confidence:** HIGH for everything marked verified (it was run against a live hub in headless Chromium this session); MEDIUM for browsers other than Chromium and for fresh-machine behavior

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase (the user chose to continue without `/gsd-discuss-phase`). The locked decisions below are copied verbatim from `.planning/REQUIREMENTS.md` section "Decisions Carried From Research" (read this session, lines 67-73). The Phase 1 UI contract `.planning/phases/01-connection-broadcast/01-UI-SPEC.md` has status `approved` and is treated as binding for UI choices.

### Locked Decisions
- Notification payload field is `kind`; the connection query parameter is `username`
- Task channel is bounded
- The sender sees their own broadcast toast (single handler)
- CORS uses an explicit origin with credentials
- The client re-joins groups on reconnect

(Only the first, third and fourth bind Phase 1. The "bounded task channel" and "re-joins groups" decisions belong to Phases 3 and 4.)

### Claude's Discretion
Everything not listed above, notably: how the connection effect is made StrictMode-safe, the initial-start retry mechanism, port numbers, file layout, whether to list the `127.0.0.1` origin, the README run commands.

### Deferred Ideas (OUT OF SCOPE)
From REQUIREMENTS.md "Out of Scope" and the Phase 1 UI-SPEC scope line: username/login, user and group send, debug panel (Phase 2); task button (Phase 3); unread badge, manual reconnect button (Phase 4); browser Web Push, mobile push, JWT, persistence, stateful reconnect, scale-out backplane, automated tests. "Do not build placeholders for them." (UI-SPEC line 15)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONN-01 | Fresh clone runs with two commands and shows "Connected" in the client | Verified run commands (`dotnet run --project server`, `npm --prefix client run dev`), fixed ports 5080/5173, launchSettings edit, PATH fallback (Verification Log V1, V10) |
| CONN-02 | User sees live connection status (connecting, connected, reconnecting, disconnected) | All four states observed in order against a real server kill/restart, with timings (V5) |
| CONN-03 | Client keeps retrying if the server starts after the client | Initial-start retry loop verified: attempts every 2.0 s, Connected 3.1 s after server launch, no page reload (V4) |
| CONN-04 | README states the .NET 10 / Node versions and the PATH note | Exact versions, PATH commands, empty-environment fallback verified (V10); README content list in Code Examples |
| BCST-01 | User can send a message that every open tab receives | Hub `SendBroadcast` -> `Clients.All`, two tabs verified (V6) |
| BCST-02 | Each notification appears as a toast and in a newest-first list | Single handler, reducer dedupe by id, sonner id de-dupe, 50 cap all verified (V6, V7) |
| BCST-03 | Notifications show a kind label (broadcast, user, group, task) | Payload `kind`; label map from UI-SPEC; server stamps `kind` |
</phase_requirements>

## Summary

Phase 1 is a walking skeleton and every item the project research flagged as unexecuted has now been executed. I scaffolded the real server (`dotnet new web -f net10.0`, typed `Hub<INotificationClient>`, CORS, `SendBroadcast`) and the real client (`create-vite` react-ts, `@microsoft/signalr` 10.0.11, `sonner` 2.0.8) in the scratchpad, ran the hub on `http://localhost:5080` and Vite on `5173`, and drove them with headless Chromium 156 via Playwright. The StrictMode-safe effect, the initial-start retry loop, credentialed CORS and sonner id de-duplication all work, with two findings that **change the project research's snippets**: (1) the ARCHITECTURE/PITFALLS effect cleanups are not clean (a naive `stop()` produces a red console error; "wait for `start()` to settle" leaves a transient extra server connection), and the only variant that gives exactly one connection and zero console errors under StrictMode is "defer `start()` by one macrotask AND wait for `start()` to settle before `stop()`"; (2) the PITFALLS claim that `UseCors` after `MapHub` breaks is not reproducible in a minimal-hosting pipeline (Microsoft's docs still say call it before; keep that order).

The retry loop must be written by hand because `withAutomaticReconnect()` does not retry initial start failures (Microsoft Learn, quoted below). While the server is down the library prints two red `Error:` console lines per attempt (plus the browser's own `ERR_CONNECTION_REFUSED`); that noise is expected and cannot be suppressed with a `catch`, so the README should say so.

Verification is not complete in two ways the planner must carry forward: only Chromium was run (Firefox/Safari are `[ASSUMED]`), and a fresh-clone run on a machine other than this one was not possible (Environment Availability).

**Primary recommendation:** Build the client around the exact `useNotificationHub` hook in Code Examples (defer + settle + abort-able retry sleep + `disposed` guards + toast in the handler with `id: n.id`), build the server from the exact `Program.cs`/hub in Code Examples (both `localhost` and `127.0.0.1` origins, `AllowCredentials`, `UseCors` before `MapHub`, server-side message validation), edit `launchSettings.json` (port 5080, `launchBrowser: false`, single `http` profile), and make the first plan a connect-only checkpoint before any broadcast UI.

## Verification Log (what I actually ran vs. what is unverified)

All runs: Chromium Headless Shell 156.0.8078.4 (Playwright 1248), .NET SDK 10.0.402, Node v22.23.2, `@microsoft/signalr` 10.0.11, `sonner` 2.0.8, React 19.3.1, Vite 8.3.5, React `StrictMode` on (the `create-vite` `main.tsx` default). Scaffold lives at `/tmp/claude-1000/-home-firestorm-source-push-notification-demo/cfdd6c65-ac18-445f-be05-3142694b1278/scratchpad/spike/` (server/, client/); Playwright scripts at `.../scratchpad/tools/t1.mjs` to `t9.mjs`. Nothing was written into the project repo except this file.

| # | Item | Result | Evidence |
|---|------|--------|----------|
| V1 | `dotnet build` of typed hub + CORS + `SendBroadcast` | 0 warnings, 0 errors | build output |
| V2 | `npm run build` (`tsc -b && vite build`) and `npm run lint` (oxlint) on the client | pass, lint exit 0 | outputs |
| V3 | **StrictMode-safe connection effect** (3 cleanup strategies compared, page load against live hub, server `OnConnectedAsync`/`OnDisconnectedAsync` log) | see table below | t1, t6 |
| V4 | **Initial-start retry loop** (client loaded with server DOWN, then server launched) | Status stayed `Connecting…` with hint `Can't reach the server yet. Retrying every 2 seconds.`; negotiate attempts at t=0.4, 2.4, 4.4, 6.4 s (one per 2 s, no doubling); became `Connected` 3.1 s after server process launch; `window.__marker` proved no page reload; send button disabled while down | t2, t8 |
| V5 | Status lifecycle with default `withAutomaticReconnect()` | Server killed: `Reconnecting…` immediately; server back after ~5 s: `Connected` at +12.1 s (the retry at 0/2/10 s delays hits the 12 s mark); server down 55 s: `Disconnected` at +42.2 s with hint `Connection lost. Reload the page to reconnect.`; restarting the server afterwards does NOT recover (still `Disconnected` 8 s later) | t5 |
| V6 | **Broadcast, two tabs** | Typing in A + Enter: A = 1 toast + 1 row, B = 1 toast + 1 row; input cleared; second message from B appears first in A's list (newest first); row text `broadcast 9:25:17 PM hello from A`; toast text `broadcast\nhello from A` | t3, t8 |
| V7 | **sonner toast `id` de-duplication** | Delivering the same notification (`id: "dup-1"`) 3 times to the real handler: toasts +1, rows +1 (not +3). After the 5 s toast expired, re-delivering the same id shows the toast again but the list still ignores it (reducer dedupe). A burst of 6 distinct ids: 9 toast elements in the DOM, 3 with `data-visible="true"` (`visibleToasts={3}` works). 60 deliveries: list capped at 50, newest first | t3 |
| V8 | **CORS with credentials** (8 trials, table below) | Control works; `127.0.0.1` origin fails unless listed; no `AllowCredentials` fails with default client; wildcard+credentials crashes server startup | t4, t9 |
| V9 | Reloads and Fast Refresh | 3 reloads = 3 connects + 3 disconnects (old page closes), 1 live connection at end. Editing `App.tsx` and the hook file under Vite HMR: 0 new server connections, page not reloaded, one toast per broadcast after the edit | t6, t7 |
| V10 | Run commands and PATH | `dotnet run --project server` from the repo-equivalent root picks up `launchSettings.json` and listens on `http://localhost:5080` (binds `127.0.0.1` and `[::1]` only). `npm --prefix client run dev` works from the root. `env -i HOME=$HOME PATH=/usr/bin:/bin ~/.dotnet/dotnet run --no-build --project server` works with no `PATH`/`DOTNET_ROOT`. A second `dotnet run` fails with `Failed to bind to address http://127.0.0.1:5080: address already in use`. A second `vite` exits with an error (strictPort) instead of moving to 5174. | t-shell |
| V11 | Server-side validation | A 300-char message sent past the input's `maxLength` made `invoke` reject with the string `An unexpected error occurred invoking 'SendBroadcast' on the server. HubException: Message is longer than 280 characters.` | t8 |

**Cleanup strategy comparison (V3, StrictMode page load, server log counts; "console err" = red `console.error` lines):**

| Variant | Server `CONNECTED` / `DISCONNECTED` for one page load | Console errors | Verdict |
|---------|------|------|------|
| `naive`: cleanup calls `conn.stop()` immediately (ARCHITECTURE Pattern 4 shape) | 1 / 0 | **1 red error**: `Failed to start the connection: Error: The connection was stopped during negotiation.` (logged by the library itself, a `catch` cannot hide it) | Works, noisy |
| `settle`: cleanup does `loop.then(() => conn.stop())` (PITFALLS Pitfall 2 shape) | **2 / 1** (a transient first connection that connects then disconnects) | none | Works, but "one server connection per page load" is false in dev |
| `defer`: `setTimeout(start, 0)`, cleared in cleanup, no settle-wait | 1 / 0 | none | Clean for the StrictMode double-run; mid-negotiation unmount would still call `stop()` mid-start |
| **`final` = defer + settle** (use this) | **1 / 0** per page load; 2 tabs = 2 live connections | none | Use |

**CORS trials (V8, server log + browser console):**

| Trial | Result |
|-------|--------|
| `WithOrigins("http://localhost:5173")` + `AllowAnyHeader` + GET/POST/DELETE + `AllowCredentials`, open `http://localhost:5173` | `Connected`, 1 SignalR WebSocket |
| same policy, page opened at `http://127.0.0.1:5173` | `Connecting…` forever (looks like "server not up"), console: `Access to fetch at 'http://localhost:5080/hubs/notifications/negotiate?negotiateVersion=1' from origin 'http://127.0.0.1:5173' has been blocked by CORS policy` |
| same policy with `WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")` | both origins `Connected` (V8b, t9) |
| no `AllowCredentials`, client default `withCredentials: true` | CORS error, never connects |
| no `AllowCredentials`, client `withCredentials: false` | `Connected` |
| full policy + client `withCredentials: false` | `Connected` |
| methods GET,POST only (no DELETE) | `Connected` (DELETE is only for long-polling cleanup; keep it anyway, per Microsoft) |
| `UseCors` placed AFTER `MapHub` (no explicit `UseRouting`) | `Connected` (does not break in minimal hosting) |
| `AllowAnyOrigin()` + `AllowCredentials()` | Server **fails to start**: `System.InvalidOperationException: The CORS protocol does not allow specifying a wildcard (any) origin and credentials at the same time. Configure the CORS policy by listing individual origins if credentials needs to be supported.` |
| Preflight (curl) from allowed origin with `x-signalr-user-agent` etc. | `204`, `Access-Control-Allow-Credentials: true`, `Access-Control-Allow-Origin: http://localhost:5173`, `Access-Control-Allow-Methods: GET,POST,DELETE` |

**Not verified (carry as risks):**
- Firefox, Safari, Edge: only Chromium 156 was run. `[ASSUMED]` the same behavior.
- A genuinely fresh clone on a clean machine (NuGet/npm cold cache, no `~/.dotnet`). Only this machine was available.
- Behavior on a machine whose only SDK is .NET 8: I could not install a second SDK. The exact .NET SDK error text for a missing SDK is `[ASSUMED]`.
- Phase 2-4 server snippets from the project research (`IUserIdProvider`, `BackgroundService`, groups) were not run; they are out of Phase 1 scope.
- Background-tab throttling, and a `LogLevel`-quiet console (the library errors while the server is down are expected, see Pitfall 3).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Connection lifecycle, status states, initial-start retry | Browser / Client | — | `@microsoft/signalr` runs in the browser; the server cannot retry a connection that never reached it |
| Notification list state (newest first, cap 50, de-dupe by id) | Browser / Client | — | Pure client state; no persistence by decision |
| Toast display | Browser / Client | — | `sonner` imperative call from the single receive handler |
| Stamping `id`, `kind`, `sentAt` and validating the message | API / Backend | — | Client is untrusted; server assigns identity of the notification and re-validates length (V11) |
| Fan-out to every tab (`Clients.All`) | API / Backend | — | Hub concern, in-process, no backplane |
| CORS (explicit origin + credentials) | API / Backend | — | Negotiate is a cross-origin fetch the server must allow; WebSockets are not covered by CORS (Microsoft Learn) |
| Serving the SPA | CDN / Static (Vite dev server) | — | Dev only; `localhost:5173`; no SSR, no proxy (requirements want CORS visible) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| .NET SDK / `net10.0` | SDK 10.0.402 (installed at `~/.dotnet`, not on PATH) | Server runtime | .NET 10 LTS; installed and used this session [VERIFIED: `dotnet --version` -> `10.0.402`] |
| ASP.NET Core SignalR (shared framework) | in `Microsoft.AspNetCore.App` 10.0.x | Hub, typed client | No NuGet package needed; `dotnet build` succeeded with none [VERIFIED: server.csproj has no PackageReference] |
| `@microsoft/signalr` | 10.0.11 | JS client | npm `latest`, published 2026-08-04 [VERIFIED: npm registry; `npm view @microsoft/signalr version` -> 10.0.11; install command is in Microsoft Learn] |
| React / React DOM | 19.3.1 | UI | `create-vite` 9.3.1 template dep `^19.3.1` [VERIFIED: client/package.json] |
| Vite | 8.3.5 | Dev server | `npm view vite version` -> 8.3.5; ran as the dev server [VERIFIED: npm registry + run] |
| `@vitejs/plugin-react` | ^6.1.2 (template) | Fast Refresh | Template dep [VERIFIED: client/package.json] |
| TypeScript | ~6.0.3 (template pin) | Types | Template pin; `tsc -b` passes [VERIFIED: build] |
| `sonner` | 2.0.8 | Toasts | `npm view sonner version` -> 2.0.8; renders styled with no CSS import (screenshot) [VERIFIED: npm registry + run] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `oxlint` | ^1.88.0 (template) | Lint | Template `npm run lint`; exit 0 on the spike [VERIFIED: run] |
| `@types/react`, `@types/react-dom`, `@types/node` | template (`^19.3.0`, `^19.3.0`, `^24.19.2`) | Types | Template defaults; do not add others |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written retry loop | `withAutomaticReconnect` only | Does not retry initial start (Microsoft Learn); required to hand-write |
| Direct CORS | Vite proxy with `ws: true` | Hides the CORS lesson; the requirements want CORS visible. Emergency fallback only |
| `AllowCredentials` | client `withCredentials: false` and drop `AllowCredentials` | Verified to work (V8) but contradicts the locked decision "CORS uses an explicit origin with credentials". Do not switch |

**Installation (matches what was run):**
```bash
# server (from repo root)
export DOTNET_ROOT="$HOME/.dotnet" PATH="$PATH:$HOME/.dotnet"   # this machine only
dotnet new web -o server -f net10.0
# client
npm create vite@latest client -- --template react-ts --no-interactive
cd client && npm install && npm install @microsoft/signalr@10.0.11 sonner@2.0.8
```
Note: `create-vite` accepted `--no-interactive` [VERIFIED: ran]. `dotnet new web` generates `launchSettings.json` with two profiles (`http` on a random port `5274`, `https`), `"launchBrowser": true` [VERIFIED: read the generated file]. Edit it (see Code Examples).

## Package Legitimacy Audit

`gsd-tools query package-legitimacy check --ecosystem npm ...` output (run this session), plus `npm view <pkg> scripts.postinstall` (empty for `@microsoft/signalr` and `sonner`).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@microsoft/signalr` | npm | latest published 2026-08-04 (package multi-year, in Microsoft Learn install docs) | 1,407,325/wk | github.com/dotnet/aspnetcore | OK | Approved |
| `sonner` | npm | latest published 2026-08-09 | 44,291,392/wk | github.com/emilkowalski/sonner | OK | Approved |
| `typescript` | npm | latest published 2026-07-08 | 216,298,978/wk | github.com/microsoft/TypeScript | OK | Approved (pin `~6.0.3` from template, not npm `latest` 7.x) |
| `react`, `react-dom` | npm | latest published 2026-10-14 | 144,724,734 / 136,351,976 per wk | github.com/react/react | SUS (`too-new`) | Flagged, see note |
| `vite` | npm | latest published 2026-10-21 | 143,941,871/wk | github.com/vitejs/vite | SUS (`too-new`) | Flagged, see note |
| `@vitejs/plugin-react` | npm | latest published 2026-10-05 | 65,666,309/wk | github.com/vitejs/vite-plugin-react | SUS (`too-new`) | Flagged, see note |
| `oxlint` | npm | latest published 2026-10-19 | 10,336,945/wk | github.com/oxc-project/oxc | SUS (`too-new`) | Flagged, see note |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `oxlint` — `react` `[WARNING: flagged as suspicious — verify before using.]`, `react-dom` `[WARNING: flagged as suspicious — verify before using.]`, `vite` `[WARNING: flagged as suspicious — verify before using.]`, `@vitejs/plugin-react` `[WARNING: flagged as suspicious — verify before using.]`, `oxlint` `[WARNING: flagged as suspicious — verify before using.]`.

**Researcher note on the SUS flags:** the only reason given is `too-new`, i.e. the *latest version* was published within the last few weeks; each package has 10M to 145M weekly downloads and a real source repo. They are not chosen by this project: they come from the `create-vite@9.3.1` `react-ts` template (client/package.json read this session). I judge these false positives. The protocol still requires the planner to add a `checkpoint:human-verify` before install; recommend **one** combined checkpoint on the scaffold task ("confirm the template-installed react/react-dom/vite/@vitejs/plugin-react/oxlint versions match client/package.json from `create-vite@9.3.1`, then proceed") rather than five. `@types/node`, `@types/react`, `@types/react-dom` came from the same template and were not run through the seam.

## Architecture Patterns

### System Architecture Diagram

```
 Presenter opens http://localhost:5173 in tab A and tab B
        |
        v
 [Vite dev server :5173]  --serves-->  React SPA (StrictMode)
                                              |
   useNotificationHub effect (per tab)        |
   mount -> (cleanup) -> mount                |  only the 2nd run's setTimeout(0) fires
        |                                     v
        |                    startLoop: conn.start()  ---fail--->  sleep 2s (abortable) --retry--+
        |                         |  ok                                                          |
        |                         v                                                              |
        |              status = connected  <-------------------------------------------------+---+
        |                         |
        |     HTTP POST /hubs/notifications/negotiate  (cross-origin fetch: preflight + credentials)
        |                         |            ^
        |                         v            | CORS policy "client": explicit origins, GET/POST/DELETE,
        |            WebSocket upgrade (101)   | AnyHeader, AllowCredentials  (UseCors before MapHub)
        |                         |
        |                         v
        |   [ASP.NET Core :5080]  NotificationHub : Hub<INotificationClient>
        |      OnConnectedAsync (log) ...
        |
 form submit -> conn.invoke("SendBroadcast", text) ---> hub: trim/validate (<=280) -> Notification.Create("broadcast", text)
                                                              |  Clients.All.ReceiveNotification(n)
                                                              v   (fan-out, every open tab, sender included)
                              conn.on("ReceiveNotification") in EACH tab
                                  |-> dispatch(n)   (pure reducer: ignore repeated id, prepend, cap 50)
                                  |-> toast(label, { id: n.id, description: n.message })  (same id replaces)

 onreconnecting -> "reconnecting"   onreconnected -> "connected"   onclose -> "disconnected" (after ~42 s of failed retries)
```

### Recommended Project Structure
```
push_notification_demo/
├── README.md                 # CONN-04: versions, PATH note, two run commands (Phase 5 expands it)
├── .gitignore                # NEW: server bin/obj, client node_modules/dist (dotnet new web emits no .gitignore)
├── server/
│   ├── server.csproj         # net10.0, no PackageReference
│   ├── Program.cs            # all wiring on one screen
│   ├── Properties/launchSettings.json   # one "http" profile, port 5080, launchBrowser false
│   ├── Hubs/INotificationClient.cs
│   ├── Hubs/NotificationHub.cs
│   └── Models/Notification.cs
└── client/
    ├── package.json, vite.config.ts     # server: { port: 5173, strictPort: true }
    └── src/
        ├── main.tsx          # keep <StrictMode>
        ├── App.tsx           # status pill, form, list, <Toaster/>
        ├── config.ts         # HUB_URL, RETRY_MS, MAX_LIST (one place)
        ├── types.ts          # AppNotification, ConnectionStatus, EVT_RECEIVE, HUB_SEND_BROADCAST
        ├── useNotificationHub.ts
        └── index.css         # tokens from UI-SPEC
```
`dotnet new gitignore` produces a file containing `[Bb]in/`, `[Oo]bj/` and `node_modules/` [VERIFIED: generated in scratchpad]. The `create-vite` template adds `client/.gitignore` itself.

### Pattern 1: StrictMode-safe connection effect (verified)
**What:** One effect, empty deps (Phase 2 changes them, see below), builds the connection, registers handlers before `start()`, defers `start()` by one macrotask, retries forever until the first success, and on cleanup sets `disposed`, aborts the retry sleep, clears the timer, `off()`s the handler and waits for `start()` to settle before `stop()`.
**When to use:** The only place the connection is created. Components never import `@microsoft/signalr`.
**Why both tricks:** defer removes the StrictMode throwaway connection and the "stopped during negotiation" error; settle-before-stop covers a real unmount or Fast Refresh arriving mid-negotiation. Full code in Code Examples. [VERIFIED: ran, table above]

**Phase 2 compatibility:** make the hook take `hubUrl: string` and use `[hubUrl]` as the dependency array. Phase 1 passes the constant `HUB_URL`; Phase 2 passes the same URL with `?username=` appended. That avoids the rewrite ARCHITECTURE warned about without building a username placeholder (UI-SPEC forbids placeholders). `[ASSUMED]` not run; trivial change.

### Pattern 2: Single receive path, pure reducer, side effect in the handler
`dispatch(n)` for state, `toast(...)` in the handler body. The reducer drops a repeated `id` and caps at 50; it never toasts (StrictMode double-invokes reducers). The sender gets no local insert: its own broadcast arrives through the same handler (locked decision, and V6 confirms exactly 1 toast + 1 row in the sender tab).

### Pattern 3: Typed hub, server-stamped payload
`Hub<INotificationClient>` with `Task ReceiveNotification(Notification n)`; the hub stamps `Id` (GUID "N" format), `Kind`, `SentAt` (UTC). The default JSON protocol camelCases to `{ id, kind, message, sentAt }`, which is what the client rendered in V6 [VERIFIED: list row used `n.kind`, `n.sentAt`, `n.message`]. Phase 1 payload deliberately has no `from` (UI-SPEC A7); Phase 2 adds it (additive).

### Anti-Patterns to Avoid
- **Calling `conn.stop()` directly in the effect cleanup:** produces the red "stopped during negotiation" console error under StrictMode (V3 `naive`).
- **`startPromise.finally(() => conn.stop())` alone:** no console error but a transient extra server connection per page load (V3 `settle`).
- **`toast()` or counters inside a reducer/`setState` updater:** StrictMode double-invokes updaters.
- **Naming the client type `Notification`:** collides with the DOM global (Web Notifications API) in a demo that is explicitly not web push. Use `AppNotification` (the server record may stay `Notification`).
- **Trusting `maxLength` on the input:** a client can invoke the hub directly; validate on the server (V11).
- **Relative hub URL:** client and server are different origins; the URL must be absolute (Microsoft Learn, quoted below).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Toast stacking, de-dupe, auto-dismiss, a11y live region | Custom toast component | `sonner` `toast(title, { id, description, duration })` + one `<Toaster />` | De-dupe by `id`, `visibleToasts` cap, live region verified (V7) |
| Reconnect after a drop | Custom reconnect timers | `withAutomaticReconnect()` + `onreconnecting/onreconnected/onclose` | Gives the four states for free (V5). Only the *initial* start needs a custom loop |
| CORS | Manual `Access-Control-*` headers / middleware | `AddCors` + `UseCors` | Preflight handled correctly (curl in V8) |
| Fan-out to all tabs | A connection registry | `Clients.All` | SignalR already tracks connections; no dictionary |
| De-dupe/ordering of the list | Index keys or timestamps | Server-stamped GUID `id` + reducer check | Stable React keys and duplicate-delivery guard |
| Retry-sleep cancellation | `setTimeout` that cleanup cannot cancel | The 6-line abortable `sleep(ms, signal)` in Code Examples | Otherwise cleanup waits up to `RETRY_MS` and a late retry runs after unmount |

**Key insight:** the only hand-written logic in this phase is the connect/retry/cleanup effect, because that is exactly what the library leaves to the app. Everything else is a library call.

## Common Pitfalls

### Pitfall 1: Cleanup `stop()` races the first `start()` under StrictMode
**What goes wrong:** red `Failed to start the connection: Error: The connection was stopped during negotiation.` or a transient second server connection.
**Why it happens:** StrictMode mounts, cleans up and re-mounts synchronously; `start()` and `stop()` are async and overlap.
**How to avoid:** defer `start()` with `setTimeout(…, 0)` cleared in cleanup, and `loop.then(() => conn.stop())` in cleanup. Do not remove StrictMode.
**Warning signs:** server log shows two `CONNECTED` per page load; console error on load. Check with the server's `OnConnectedAsync` log line (verified approach).

### Pitfall 2: Page opened at `127.0.0.1:5173` looks like "server not running"
**What goes wrong:** the page stays on `Connecting…` with the hint "Can't reach the server yet. Retrying every 2 seconds." forever, although the server is up (CORS rejects the `127.0.0.1` origin; V8).
**How to avoid:** list both `http://localhost:5173` and `http://127.0.0.1:5173` in `WithOrigins` (verified, V8b) and tell the README reader to use `localhost`. Both are explicit origins, so the locked decision holds.
**Warning signs:** console message `blocked by CORS policy` plus status stuck on Connecting.

### Pitfall 3: Expected red console errors while the server is down
**What goes wrong:** with `LogLevel.Information` the library emits two `Error:` lines per 2 s attempt (`Failed to complete negotiation with the server: TypeError: Failed to fetch` and `Failed to start the connection: …`) and the browser adds `net::ERR_CONNECTION_REFUSED`; V4 counted 10 error lines in 8 s. The PITFALLS checklist item "browser console is clean" cannot hold during that state.
**How to avoid:** accept and document it in the README ("red errors while the server is down are expected"). A `catch` does not hide them (they are logged inside the library). Do not raise the log level to hide them: `Information` is what shows `WebSocket connected` and `Using HubProtocol 'json'` to the audience.

### Pitfall 4: Default `withAutomaticReconnect()` gives up at about 42 s and a restarted server then does nothing
**What goes wrong:** V5: `Disconnected` at +42.2 s; starting the server afterwards does not reconnect. Also a 5 s outage only shows `Connected` at +12 s because retries are at 0, 2, 10, 30 s.
**How to avoid in Phase 1:** nothing; this is the specified Phase 1 behavior (hint says "Reload the page to reconnect"). Phase 4 (RSLN-01/04) replaces it with a never-give-up policy. Do not pre-build it.

### Pitfall 5: Scaffold defaults break "two commands"
**What goes wrong:** `dotnet new web` sets a random port (`5274`), `launchBrowser: true`, and an `https` profile; `dotnet run` uses the first profile.
**How to avoid:** replace `launchSettings.json` with a single `http` profile, `applicationUrl: http://localhost:5080`, `launchBrowser: false` (Code Examples). Keep the port in `config.ts` and the CORS origins in one array each.

### Pitfall 6: A tightly pinned `global.json` gives a cryptic error
**What goes wrong:** with `{"sdk":{"version":"10.0.999","rollForward":"latestFeature"}}` and only 10.0.402 installed, `dotnet --version` printed `The command could not be loaded, possibly because: * You intended to execute a .NET application: The application '--version' does not exist or is not a managed .dll or .exe.` [VERIFIED: ran]. A `10.0.100` + `latestFeature` pin resolved to `10.0.402` and was fine.
**How to avoid:** either omit `global.json` and rely on the README version line (planner's call; missing-SDK error text is `[ASSUMED]`), or pin `10.0.100` with `latestFeature` and state ".NET 10 SDK required" in the README.

### Pitfall 7: `UseCors` ordering folklore
The PITFALLS file lists "`UseCors` after `MapHub`" as a failure. I could not reproduce it (V8): in minimal hosting with no explicit `UseRouting` the app still connected. Microsoft's docs state "The UseCors method must be called before calling the MapHub method" and their sample includes an explicit `UseRouting()`. Keep `UseCors` before `MapHub` and do not claim it is the cause of CORS failures; the real causes seen were origin mismatch and missing credentials.

### Pitfall 8: Input `maxLength` is not validation
V11: a programmatic 300-char value reached the hub. The hub must trim and reject empty/over-280 messages with `HubException`. Its text reaches the client inside the `invoke` rejection (see V11 string), but the UI-SPEC error copy says "The connection dropped", which is wrong for a validation rejection. This is rare (the input caps at 280) so keep the UI-SPEC copy; flag it to the planner.

## Code Examples

All code below was compiled and run in the spike (V1-V11) unless a comment says otherwise.

### server/Program.cs
```csharp
// Source: spike (verified); CORS policy per Microsoft Learn "Security considerations in ASP.NET Core SignalR"
using NotificationDemo.Hubs;

// Explicit origins only. localhost AND 127.0.0.1 are different origins to a browser (verified).
string[] ClientOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSignalR();
builder.Services.AddCors(o => o.AddPolicy("client", p => p
    .WithOrigins(ClientOrigins)
    .AllowAnyHeader()
    .WithMethods("GET", "POST", "DELETE")   // DELETE is for long-polling cleanup; Microsoft requires all three
    .AllowCredentials()));                   // JS client defaults to withCredentials: true; without this negotiate fails (verified)

var app = builder.Build();
app.UseCors("client");                       // before MapHub, as Microsoft documents
app.MapHub<NotificationHub>("/hubs/notifications");
app.Run();
```

### server/Hubs/NotificationHub.cs, INotificationClient.cs, Models/Notification.cs
```csharp
using Microsoft.AspNetCore.SignalR;
using NotificationDemo.Models;
namespace NotificationDemo.Hubs;

// JS client subscribes with connection.on("ReceiveNotification", ...)
public interface INotificationClient
{
    Task ReceiveNotification(Notification notification);
}

public class NotificationHub(ILogger<NotificationHub> log) : Hub<INotificationClient>
{
    public const int MaxMessageLength = 280;

    public override Task OnConnectedAsync()
    {
        log.LogInformation("CONNECTED {ConnectionId}", Context.ConnectionId);   // proves one connection per tab load
        return base.OnConnectedAsync();
    }
    public override Task OnDisconnectedAsync(Exception? ex)
    {
        log.LogInformation("DISCONNECTED {ConnectionId}", Context.ConnectionId);
        return base.OnDisconnectedAsync(ex);
    }

    // Client-callable. Clients can bypass the form, so the server re-validates.
    public Task SendBroadcast(string message)
    {
        message = (message ?? "").Trim();
        if (message.Length == 0) throw new HubException("Message is empty.");
        if (message.Length > MaxMessageLength) throw new HubException($"Message is longer than {MaxMessageLength} characters.");
        return Clients.All.ReceiveNotification(Notification.Create("broadcast", message));
    }
}

namespace NotificationDemo.Models
{
    // Wire JSON (default protocol, camelCase): { id, kind, message, sentAt }
    public record Notification(string Id, string Kind, string Message, DateTimeOffset SentAt)
    {
        public static Notification Create(string kind, string message) =>
            new(Guid.NewGuid().ToString("N"), kind, message, DateTimeOffset.UtcNow);
    }
}
```
(Put `Notification` in its own file; shown together for brevity. The spike compiled it as separate files.)

### server/Properties/launchSettings.json
```json
{
  "$schema": "https://json.schemastore.org/launchsettings.json",
  "profiles": {
    "http": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": false,
      "applicationUrl": "http://localhost:5080",
      "environmentVariables": { "ASPNETCORE_ENVIRONMENT": "Development" }
    }
  }
}
```

### client/vite.config.ts
```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },   // fail loudly instead of drifting to 5174 (verified: 2nd vite exits with an error)
})
```

### client/src/config.ts and types.ts
```ts
// config.ts. Hub URL must be ABSOLUTE: client (5173) and server (5080) are different origins.
export const HUB_URL: string = import.meta.env.VITE_HUB_URL ?? "http://localhost:5080/hubs/notifications";
export const RETRY_MS = 2000;   // UI-SPEC A4
export const MAX_LIST = 50;     // UI-SPEC A5

// types.ts
export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";
// Not named "Notification": that is a DOM global (Web Notifications API).
export type AppNotification = { id: string; kind: string; message: string; sentAt: string };
// Must match INotificationClient.ReceiveNotification and NotificationHub.SendBroadcast.
export const EVT_RECEIVE = "ReceiveNotification";
export const HUB_SEND_BROADCAST = "SendBroadcast";
```
`erasableSyntaxOnly` and `verbatimModuleSyntax` are on in the template's `tsconfig.app.json` [VERIFIED: read the file], so use `import type` for types and no enums/parameter properties.

### client/src/useNotificationHub.ts (the verified hook)
```ts
// Source: spike variant "final" (defer + settle), verified under StrictMode in Chromium 156.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import type { HubConnection } from "@microsoft/signalr";
import { toast } from "sonner";
import { HUB_URL, MAX_LIST, RETRY_MS } from "./config";
import { EVT_RECEIVE, HUB_SEND_BROADCAST } from "./types";
import type { AppNotification, ConnectionStatus } from "./types";

function reducer(list: AppNotification[], n: AppNotification): AppNotification[] {
  // PURE: no toast and no counters in here (StrictMode double-invokes reducers).
  if (list.some((x) => x.id === n.id)) return list; // ignore a repeated id
  return [n, ...list].slice(0, MAX_LIST);           // newest first, capped
}

// Resolves after ms, or immediately when aborted (cleanup never waits out a retry delay).
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

// Title shown in toast and badge. Label set from UI-SPEC; unknown kind -> raw kind, missing -> "Notification".
const KIND_LABEL = (k: string) =>
  ({ broadcast: "Broadcast", user: "User", group: "Group", task: "Task" } as Record<string, string>)[k] ?? (k || "Notification");

export function useNotificationHub() {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [retrying, setRetrying] = useState(false); // initial start() failing: server not up yet
  const [list, dispatch] = useReducer(reducer, []);
  const connRef = useRef<HubConnection | null>(null);

  useEffect(() => {
    let disposed = false;
    const ac = new AbortController();
    let loop: Promise<void> = Promise.resolve();

    const conn = new HubConnectionBuilder()
      .withUrl(HUB_URL)          // absolute; withCredentials defaults true, so the server needs AllowCredentials
      .withAutomaticReconnect()  // does NOT retry the initial start(); startLoop does
      .configureLogging(LogLevel.Information)
      .build();

    const onNotification = (n: AppNotification) => {
      if (disposed) return;
      dispatch(n);
      toast(KIND_LABEL(n.kind), { id: n.id, description: n.message, duration: 5000 }); // same id => replace, not stack
    };
    conn.on(EVT_RECEIVE, onNotification);                // handlers BEFORE start()
    conn.onreconnecting(() => { if (!disposed) setStatus("reconnecting"); });
    conn.onreconnected(() => { if (!disposed) setStatus("connected"); });
    conn.onclose(() => { if (!disposed) setStatus("disconnected"); });
    connRef.current = conn;

    const startLoop = async () => {
      setStatus("connecting");
      while (!disposed) {
        try {
          await conn.start();                            // after a failed start() the state returns to Disconnected, so retrying the SAME object is valid (verified)
          if (!disposed) { setRetrying(false); setStatus("connected"); }
          return;
        } catch {
          if (disposed) return;                          // cancelled by cleanup: stay silent
          setRetrying(true);
          await sleep(RETRY_MS, ac.signal);
        }
      }
    };

    // StrictMode: mount -> cleanup -> mount happens synchronously. Deferring start() by one macrotask means the
    // first run's timer is cleared before any network call, so only ONE negotiation happens.
    const timer = window.setTimeout(() => { loop = startLoop(); }, 0);

    return () => {
      disposed = true;
      ac.abort();
      window.clearTimeout(timer);
      conn.off(EVT_RECEIVE, onNotification);
      if (connRef.current === conn) connRef.current = null;
      void loop.then(() => conn.stop());   // never stop() mid-negotiation
    };
  }, []);                                  // Phase 2: change to [hubUrl] with hubUrl as a hook parameter

  const send = useCallback(async (message: string) => {
    const c = connRef.current;
    if (!c || c.state !== HubConnectionState.Connected) throw new Error("not connected");
    await c.invoke(HUB_SEND_BROADCAST, message);
  }, []);

  return { status, retrying, list, send };
}
```
Status/hint mapping to the UI-SPEC copy (verified strings): `connecting && retrying` -> `Can't reach the server yet. Retrying every 2 seconds.`; `reconnecting` -> `Connection dropped. Trying to reconnect.`; `disconnected` -> `Connection lost. Reload the page to reconnect.`; otherwise empty hint but keep the 24 px line.

### Toaster and list (UI-SPEC bindings)
`<Toaster position="top-right" visibleToasts={3} closeButton />` mounted once in `App.tsx`; list rows `key={n.id}`; `<time dateTime={n.sentAt}>`; message as plain text children (never `dangerouslySetInnerHTML`). The sonner toast element selector for any future checks is `[data-sonner-toast]`, visible ones carry `data-visible="true"` [VERIFIED: DOM in V7].

### README content for CONN-04 (what the verification supports)
- Versions: .NET SDK 10 (tested 10.0.402), Node 20.19+ or 22.12+ (Vite 8 requirement per STACK.md; tested 22.23.2), npm 10.9.8.
- If `dotnet` is not on PATH: `export DOTNET_ROOT="$HOME/.dotnet"; export PATH="$PATH:$DOTNET_ROOT"` or call `~/.dotnet/dotnet run --project server` (works with an empty environment, V10).
- One-time: `npm --prefix client install`. Then, from the repo root, one command per terminal: `dotnet run --project server` (port 5080) and `npm --prefix client run dev` (port 5173). Open `http://localhost:5173`.
- Notes: red console errors while the server is down are expected (Pitfall 3); use `dotnet run` not `dotnet watch` (project research); open a new tab, not "Duplicate tab" (Phase 2).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@aspnet/signalr`, `app.UseSignalR`, `Startup.cs` | `@microsoft/signalr`, `AddSignalR()` + `MapHub<T>()` in `Program.cs` | ASP.NET Core 3.0 | Matches this plan |
| `withAutomaticReconnect()` assumed to cover initial connect | Handle initial `start()` failure manually | documented (Microsoft Learn, 10.0) | The retry loop is required |
| Wildcard origin + credentials | Explicit origins; wildcard+credentials throws at startup | ASP.NET Core CORS | Verified message in V8 |

**Deprecated/outdated:** the project research Pattern 4 / Pitfall 2 effect snippets (superseded by the verified hook above); the claim that `UseCors` after `MapHub` fails (not reproducible here).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Firefox, Safari and Edge behave the same as Chromium 156 for the hook, CORS and sonner | Verification Log | Teammates on other browsers see duplicate connections/errors; low-medium. Add a manual two-browser check at UAT |
| A2 | On a machine with only a .NET 8 SDK, `dotnet run` fails with a clear "SDK does not support targeting .NET 10.0" error (NETSDK1045) | Pitfall 6 | README may need extra wording; low |
| A3 | `NuGet`/`npm` cold-cache fresh clone works without extra steps | CONN-01 | "Two commands" may need a first-run note; medium. Cannot be tested on this machine |
| A4 | Changing the effect deps to `[hubUrl]` in Phase 2 preserves StrictMode safety without rework | Pattern 1 | Phase 2 plan must re-run the V3 check; low |
| A5 | The 5 template packages flagged `too-new` by the legitimacy seam are false positives | Package Legitimacy Audit | Mitigated by the planner's checkpoint; low |
| A6 | Port 5080 and 5173 are free on teammates' machines | Environment | Server fails with `address already in use` (verified message) / Vite exits (strictPort); README should name the ports |

## Open Questions (RESOLVED)

1. **Add the `127.0.0.1` origin, or tell people to use `localhost` only?**
   - Known: both work when listed (V8b); unlisted `127.0.0.1` looks like "server not running".
   - RESOLVED: list both origins (decided in the Phase 1 plan; README still says open `localhost:5173`).
   - Recommendation: list both (it is in the code above) and still say "open `localhost:5173`" in the README. Planner/user may prefer a single origin for teaching purity; that is a discretion call, not a blocker.
2. **`global.json` or no `global.json`?** (Pitfall 6) RESOLVED: omit it; README states ".NET 10 SDK" (decided in the Phase 1 plan). Recommendation: omit it and rely on the README line, unless the team wants a hard pin.
3. **Provider vs hook-in-`App`?** RESOLVED: hook stays in `App` for Phase 1, taking `hubUrl` (decided in the Phase 1 plan). ARCHITECTURE proposed a `NotificationProvider` context. The verified hook is called once from `App`; lifting it into a context later (Phase 2 debug panel, Phase 4 badge) is mechanical. Recommendation: keep the hook in `App` for Phase 1 (fewer concepts for the walking skeleton).
4. **Server-validation error copy:** RESOLVED: distinct copy for a server rejection, `connection dropped` kept for real drops (01-02 Task 2). UI-SPEC's send-error text says "The connection dropped", wrong for a `HubException` rejection (rare). Keep as is or distinguish by error text; low priority.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| .NET SDK | server | yes, but NOT on PATH | 10.0.402 at `~/.dotnet` | `export DOTNET_ROOT=$HOME/.dotnet PATH=$PATH:$HOME/.dotnet`, or `~/.dotnet/dotnet run --project server` (works with empty env, V10) |
| Node | client | yes | v22.23.2 | none needed |
| npm | client | yes | 10.9.8 (registry reachable) | none needed |
| Ports 5080, 5173 | run | free at research time (and freed after every test run) | — | change `applicationUrl`, `HUB_URL`, `ClientOrigins`, `vite.config.ts` together |
| Browser for UAT | manual verification | Firefox 158.0.1 installed system-wide; headless Chromium was installed only in the scratchpad (`.../scratchpad/pw-browsers`) | — | UAT in Firefox/Chrome by hand (A1) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `dotnet` on PATH (README note).

## Security Domain

`security_enforcement` is enabled (absent/true); ASVS level 1 per `.planning/config.json` (`security_asvs_level: 1`). `workflow.nyquist_validation` is `false`, so no Validation Architecture section is included; REQUIREMENTS.md also excludes automated tests. See "Manual UAT checks" below instead.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no login until Phase 2, and it is a fake name by design) | n/a in Phase 1 |
| V3 Session Management | no | n/a |
| V4 Access Control | partial | Anyone who can reach the port can broadcast; mitigate by loopback binding (`localhost:5080` bound only to `127.0.0.1` and `[::1]`, V10) and document as a demo limit |
| V5 Input Validation | yes | Server-side trim/empty/max-280 check with `HubException`; client `maxLength={280}` is UX only (V11) |
| V6 Cryptography | no | HTTP on localhost by decision |
| V13/V14 API & Config | yes | Explicit CORS origins; never `AllowAnyOrigin` + `AllowCredentials` (server refuses to start, V8) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via broadcast text delivered to every tab | Tampering / Elevation | Render as React text children and sonner `description`; never `dangerouslySetInnerHTML` (UI-SPEC line 158) |
| Cross-origin hub access from an untrusted site | Spoofing | `WithOrigins(explicit)`; note CORS does not protect the WebSocket (Microsoft Learn: "The protections provided by CORS don't apply to WebSockets"), acceptable for localhost, say so in one README line |
| Oversized or empty messages | DoS / Tampering | Server-side 280 limit; SignalR's default 32 KB message buffer (Microsoft Learn, Buffer management) |
| Unbounded client list growth | DoS | Reducer cap of 50 (V7) |
| Logging user text | Information disclosure / log injection | The hub logs connection ids only, not message bodies |
| Anyone can broadcast (no auth) | Spoofing | Accepted, demo scope; loopback bind; state in presentation (Phase 5) |

### Manual UAT checks for the success criteria (not automated tests)
1. From a clean terminal: server command then client command; page shows `Connected`.
2. Start the client first, wait 10 s (status `Connecting…` + hint), then start the server; `Connected` without refresh.
3. Two tabs: send from A; exactly one toast and one list row in A and B; send from B; newest first.
4. Server log shows exactly one `CONNECTED` per tab load (StrictMode on).
5. Kill the server: `Reconnecting…`, then `Disconnected` at about 42 s with the reload hint.
6. Repeat 1-3 in a second browser (covers A1).

## Sources

### Primary (HIGH confidence)
- Live runs this session (Verification Log): .NET 10.0.402 server, Vite 8.3.5 client, headless Chromium 156.
- Microsoft Learn, SignalR JavaScript client (fetched 2026-10-26; page `updated_at: 2026-10-13`): https://learn.microsoft.com/en-us/aspnet/core/signalr/javascript-client?view=aspnetcore-10.0 — quotes: "`withAutomaticReconnect` doesn't configure the `HubConnection` to retry initial start failures, so start failures need to be handled manually"; "Without any parameters, WithAutomaticReconnect configures the client to wait 0, 2, 10, and 30 seconds respectively before trying each reconnect attempt. After four failed attempts, it stops trying to reconnect."; "A **best practice** is to call the start method on the `HubConnection` after `on`."; "For cross domain requests, the client code ***must*** use an absolute URL rather than a relative URL."; "The UseCors method must be called before calling the MapHub method."
- Microsoft Learn, SignalR security (fetched 2026-10-26; `updated_at: 2026-10-15`): https://learn.microsoft.com/en-us/aspnet/core/signalr/security?view=aspnetcore-10.0 — quotes: "Allow the specific expected origins. Allowing any origin is possible but is **not** secure or recommended."; "HTTP methods `GET`, `POST`, and `DELETE` must be allowed."; "Credentials must be allowed in order for cookie-based sticky sessions to work correctly. They must be enabled even when authentication isn't used."; "The protections provided by CORS don't apply to WebSockets."; "By default, SignalR limits these buffers to 32 KB."
- npm registry via `npm view` (2026-10-26): signalr 10.0.11 (dist-tags latest 10.0.11, next 11.0.0-preview.7), sonner 2.0.8, react 19.3.1, vite 8.3.5, create-vite 9.3.1.
- `.planning/` files read this session: REQUIREMENTS.md, STATE.md, ROADMAP.md, 01-UI-SPEC.md, research/SUMMARY.md, STACK.md, ARCHITECTURE.md, PITFALLS.md, `.claude/CLAUDE.md`.
- `node_modules/@microsoft/signalr/dist/esm/HubConnection.js` (read): a failed `start()` sets the state back to `Disconnected` (so retrying the same object is valid); `stop()` awaits and swallows the pending start promise.

### Secondary (MEDIUM confidence)
- Sonner docs https://sonner.emilkowal.ski/toast: lists `id` (string), `duration` (default 4000), `description` options but does not document the same-id replace semantics. That behavior is established by my own run (V7), not by the docs.

### Tertiary (LOW confidence)
- None relied upon. Items in the Assumptions Log are `[ASSUMED]`.

## Project Constraints (from CLAUDE.md)

Extracted from `./.claude/CLAUDE.md` (read this session):
- Tech stack: C# / ASP.NET Core (.NET 8+) with SignalR, React (Vite) with `@microsoft/signalr`; this plan uses .NET 10 (satisfies ".NET 8+").
- Simplicity: fake username login (Phase 2), in-memory state, one repo with `server/` and `client/`.
- Delivery: runs locally in two commands plus two tabs.
- Stack "What NOT to use": no UI kit, Tailwind, `next-themes`, MessagePack, TypeScript 7.x, `@aspnet/signalr`, `app.UseSignalR`, `AllowAnyOrigin()` with `AllowCredentials()`, preview `@microsoft/signalr` 11.x, starting a connection in an effect without cleanup.
- Default JSON protocol, camelCase. Typed hub preferred. Hold the connection out of render.
- Register `IUserIdProvider` as singleton (Phase 2); one `Program.cs` readable top to bottom.
- GSD workflow enforcement: file-changing work goes through a GSD command (plan then `/gsd-execute-phase`); no direct repo edits outside a GSD workflow.
- Requirements exclude automated tests; do not add test infrastructure.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed from the registry and by building/running them together
- Architecture / connection effect: HIGH — executed under StrictMode with server-side connection counts
- CORS: HIGH for Chromium (8 trials), MEDIUM across browsers (A1)
- Pitfalls: HIGH for those reproduced (1-5, 8), MEDIUM for Pitfall 6's missing-SDK wording (A2)
- Fresh-machine run: LOW-MEDIUM — not testable here (A3)

**Research date:** 2026-10-26
**Valid until:** 2026-11-25 for the stack (30 days); re-check npm versions if planning slips, since react/vite/oxlint released within the last three weeks
