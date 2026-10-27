<!-- GSD:project-start source:PROJECT.md -->

## Project

**SignalR Notification Demo**

A demo of real-time in-app notifications built with ASP.NET Core SignalR and a React client. It is made for the author's team to learn from, and it shows three ways notifications get triggered: broadcast to everyone, targeted to a user or group, and server-originated (a POST that finishes work in the background and notifies the poster 10 seconds later).

**Core Value:** A teammate can open two browser tabs and watch every notification type arrive live, and understand from the code why it works.

### Constraints

- **Tech stack**: C# / ASP.NET Core (.NET 8+) with SignalR, React (Vite) with `@microsoft/signalr` — stated by the author
- **Simplicity**: fake username login, in-memory state, one repo with `server/` and `client/` — keeps the demo readable
- **Delivery**: must run locally in two commands plus two tabs — it is shown live

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| .NET SDK / `net10.0` | SDK 10.0.402 (already installed at `~/.dotnet`, runtime 10.0.13); patch line 10.0.14 | Server runtime | .NET 10 is the current LTS (supported to 2028-11-14). .NET 8 and 9 both leave support on 2026-11-10, two weeks from today, so a new project must not target them. The brief says ".NET 8+", and 10 satisfies that. | HIGH |
| ASP.NET Core SignalR (shared framework) | Ships in `Microsoft.AspNetCore.App` 10.0.x | Hub, `IHubContext`, `IUserIdProvider` | No NuGet package is needed on the server. `services.AddSignalR()` and `MapHub<T>()` are in the web SDK. Do not add `Microsoft.AspNetCore.SignalR.*` packages. | HIGH |
| ASP.NET Core Minimal APIs | in-box (net10.0) | `POST /api/tasks` -> 202, plus the hub mapping | One `Program.cs` the team can read top to bottom. Controllers would add ceremony that hides the SignalR lesson. | HIGH |
| `@microsoft/signalr` | 10.0.11 (npm `latest`) | JS/TS client | The official client. Its major matches the server's, and the `latest` tag is 10.x. The `next` tag is the 11.0.0 preview and must be avoided. | HIGH |
| React + React DOM | 19.3.1 | UI | Current stable, and what `create-vite` 9.3.1 scaffolds. | HIGH |
| Vite | 8.3.5 | Dev server and build | Current stable. Needs Node 20.19+ or 22.12+ (local Node is 22.23.2, so it is fine). Dev server defaults to port 5173. | HIGH |
| `@vitejs/plugin-react` | 6.1.2 | React transform and Fast Refresh | Required by the Vite 8 template. Its peer is `vite ^8`. | HIGH |
| TypeScript | `~6.0.3` (as pinned by the template) | Types | Use the template's pin. npm `latest` is 7.0.2 (the new native compiler). The Vite template has not moved to it, so staying on 6.0.x avoids toolchain surprises in a demo. | MEDIUM |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sonner` | 2.0.8 | Toast notifications | Always. Mount one `<Toaster />` and call `toast()` from the `connection.on(...)` handlers. See toast choice below. |
| `oxlint` | ^1.88.0 (template default) | Linting | Comes with the Vite 9.3.1 template (`npm run lint`). Keep it and add nothing else. |
| `@types/react`, `@types/react-dom` | ^19.3.0 | Types | Template defaults. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `dotnet run` (or `dotnet watch`) | Start the server | `~/.dotnet` is not on `PATH` on this machine. Either export `DOTNET_ROOT=$HOME/.dotnet` and `PATH=$PATH:$HOME/.dotnet`, or call `~/.dotnet/dotnet`. Document this in the README. |
| `npm run dev` | Start the client | Port 5173. |
| `npm create vite@latest client -- --template react-ts` | Scaffold | Run from the repo root so the folder is `client/`. |
| `dotnet new web -o server -f net10.0` | Scaffold | Gives an empty minimal-API host, which is the right starting point (not `webapi`, which adds OpenAPI you do not need). |

## Key Implementation Choices (the questions asked)

### Toast library: `sonner` 2.0.8

- It needs one `<Toaster />` and imperative `toast.success/info/message(...)`, with no provider and no CSS import. It built cleanly with Vite 8 and React 19.3.1 in a verification scaffold.
- Peer deps are `react >=16` and `react-dom >=16`. It has no runtime dependencies.
- It stacks and dedupes toasts and supports `richColors`, `description` and `action`. Those fit "broadcast / targeted / task completed" as three visually distinct types.
- Alternatives are in the table below. `react-hot-toast` 2.6.1 is equally valid and a coin flip. `sonner` wins on its out-of-the-box look and typed variants, which matters in a live presentation.

### Client connection (`@microsoft/signalr`)

- A cross-origin hub needs an **absolute URL**. A relative `/hubs/...` only works when the client and server share an origin.
- Per Microsoft Learn, handlers should be registered before `start()`. `withAutomaticReconnect()` does **not** retry the *initial* `start()` failure, so wrap `start()` in a retry loop. This is a good teaching moment, because a teammate who starts the client before the server will hit it.
- `onreconnecting`, `onreconnected` and `onclose` map one-to-one onto the "Reconnecting / Connected / Disconnected" status badge in the requirements.
- A reconnect produces a **new connectionId**. Group membership is lost on reconnect, so re-join groups in `onreconnected` (or have the hub re-add groups in `OnConnectedAsync`). Make this a deliberate walkthrough point.
- Do not use the 11.0 preview `withAuthenticationRefresh` or stateful reconnect. Both are out of scope.
- Hold the `HubConnection` outside React render (a module singleton, or a ref created once). Under `<StrictMode>` in dev, effects run twice. A naive `useEffect(() => { connection.start() ... })` gives "Failed to start the connection: The connection was stopped during negotiation" or duplicate handlers. Clean up with `connection.off(...)` and `stop()` in the effect cleanup, or guard on `connection.state`. (MEDIUM: well-known pattern, not run in this research.)

### CORS

- SignalR **requires** all three of: specific origins, `GET/POST/DELETE`, and `AllowCredentials()`.
- `AllowAnyOrigin()` combined with `AllowCredentials()` is rejected by ASP.NET Core and is insecure. Do not "make it work" that way.
- Browsers treat `http://localhost:5173` and `http://127.0.0.1:5173` as different origins. Tell people to open exactly `localhost:5173`, or list both origins.
- `AllowAnyHeader()` also covers the preflight for the custom `X-Username` header and `Content-Type: application/json` on the `POST /api/tasks` call.
- CORS does not apply to WebSockets (they have their own origin check). That is fine for a localhost demo. Mention it in one README line and do not build on it.
- Alternative: a Vite dev-server proxy removes the need for CORS entirely. Do **not** use it here, because the requirements call out CORS as something the team should see. List it as an "if you hit CORS problems" fallback only.

### Fake login: `IUserIdProvider`

- By default SignalR maps `Clients.User(x)` to the `ClaimTypes.NameIdentifier` claim. With no authentication there is no claim, so `Clients.User(...)` reaches nobody. A custom provider is mandatory for this demo.
- Register it as a **singleton**: `builder.Services.AddSingleton<IUserIdProvider, QueryStringUserIdProvider>();`
- Read the fake username from the connection's query string. `GetUserId` runs once per connection:
- The JS client keeps the query string from `withUrl(...)` on both the negotiate request and the WebSocket upgrade, so `?username=` is available when the provider runs.
- Normalise the username (trim and lower-case). `Clients.User("Alice")` and `"alice"` are different users, and one inconsistency makes a live demo silently fail.
- Return `null` (not an empty string) for anonymous connections.
- Microsoft's own warning applies: the id must be **unique per user**, or messages reach the wrong person. Here the username is the identity, so the point is made.
- Label this `// DEMO ONLY: trusting a client-supplied name is not authentication` in the code. The follow-up in `.planning/research/questions.md` (JWT) is where `accessTokenFactory` and the `access_token` query parameter come in. The fake-login seam (`IUserIdProvider`) stays the same when that happens.
- The `POST /api/tasks` endpoint needs the same identity. Send it as an `X-Username` header or in the JSON body, and have the client use the same stored name. Do **not** try to read the SignalR connection from the HTTP request.

### Background work: `BackgroundService` + `Channel<T>`

- Define `record TaskJob(string TaskId, string Username);`.
- Register one `TaskQueue` singleton wrapping `Channel.CreateBounded<TaskJob>(100)` (docs use `FullMode = Wait`). Expose `EnqueueAsync` and `ReadAllAsync`.
- `POST /api/tasks` does `await queue.EnqueueAsync(job)` then `return Results.Accepted($"/api/tasks/{id}", new { id })`. This is the "202 + leave the request" lesson.
- `TaskWorker : BackgroundService`, registered with `AddHostedService<TaskWorker>()`. It injects `IHubContext<NotificationHub>` (or `IHubContext<NotificationHub, INotificationClient>`) directly. `IHubContext` is a singleton, so **no `IServiceScopeFactory` is needed**. Only mention scopes if a scoped service is ever added.
- `await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken)`, then `Clients.User(job.Username).SendAsync("ReceiveNotification", ...)`. Always pass `stoppingToken`, so Ctrl+C shuts down promptly.
- **Concurrency trap:** one worker loop that awaits a 10s delay per job serialises the work, so a second POST made within 10s completes at 20s. Fix it by starting each job without awaiting it inside the read loop, or by running a few reader loops. Do not make the loop sequential in a demo that invites people to click the button repeatedly.
- Wrap each job in `try/catch` and log, so one failure does not kill the worker. `ExecuteAsync` must not throw uncaught.
- `IHubContext` has no `Caller`, `Others`, or `ConnectionId`. Reaching "the posting user" is only possible because of `IUserIdProvider`, hence "targeted before server-originated" in the phase order.
- Use `IHubContext` for outbound-only sending from the endpoint or worker. You cannot invoke hub methods through it.

### Hub shape

- Prefer `Hub<INotificationClient>` plus `IHubContext<NotificationHub, INotificationClient>`. This is documented best practice, gives compile-time method names on the server, and shows the "contract" the client must match. If the team finds the interface in the way, plain `SendAsync("ReceiveNotification", ...)` is acceptable. Pick one and be consistent. (MEDIUM: a style call.)
- Hub methods: `Broadcast(...)`, `SendToUser(...)`, `JoinGroup(...)`, `LeaveGroup(...)`, `SendToGroup(...)`.
- Default JSON protocol, camelCase on both server and client. No MessagePack, since it adds a package and obscures the wire for a learning demo.
- Keep one payload shape, for example `{ id, type: "broadcast"|"user"|"group"|"task", title, message, from, sentAt }`. Use `type` to choose the toast variant and the list icon.

## Installation

# Server (from repo root). SignalR is in the shared framework; no extra packages.

# set a fixed port in server/Properties/launchSettings.json, e.g. http://localhost:5080

# Client

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| .NET 10 (LTS) | .NET 8 | Only if the team's machines or CI are locked to the 8.x SDK. Support ends 2026-11-10, and the code in this demo is identical. |
| .NET 10 (LTS) | .NET 9 or 11 RC | Never for this. .NET 9 (STS) ends support on the same date as 8. .NET 11 is still in release-candidate state. |
| `sonner` | `react-hot-toast` 2.6.1 | If you want the smallest API and no concern about look. Also fine. |
| `sonner` | `react-toastify` 11.1.0 | If you need progress-bar toasts, a notification centre, or more per-toast configuration. It needs a CSS import and has more concepts to explain. |
| Query-string `username` | `accessTokenFactory` returning the name | If you want the demo to look like the later JWT upgrade. It sends `access_token` in the query string. It is more indirect, so it is not the default for teaching. |
| Absolute URL + CORS | Vite dev proxy (`server.proxy` with `ws: true`) | If the team's environment blocks cross-origin localhost calls. It hides the CORS lesson. |
| `Channel<T>` + `BackgroundService` | Hangfire, Quartz, or `Task.Run` in the endpoint | Hangfire and Quartz are for durable or scheduled jobs, which is out of scope (no database). `Task.Run` in the request is the anti-pattern the demo is meant to teach against. |
| Plain React state | Redux, Zustand, TanStack Query | Only if the demo grows features. It does not need them. |
| `Hub<T>` typed hub | Untyped `Hub` + `SendAsync` strings | Fine if the interface feels like too much indirection for the team. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@microsoft/signalr` `11.0.0-preview.*` (npm tag `next`) | A preview of an unreleased major, and it is not matched by the server. | `10.0.11` |
| The old `@aspnet/signalr` package | Deprecated predecessor, no longer maintained. Many older tutorials still use it. | `@microsoft/signalr` |
| ASP.NET Core 2.x `app.UseSignalR(...)`, `Microsoft.AspNetCore.SignalR` NuGet, or the old `Startup.cs` pattern | Legacy from before 3.0. Present in many blog posts. | `builder.Services.AddSignalR()` + `app.MapHub<T>()` in `Program.cs` |
| `AllowAnyOrigin()` together with `AllowCredentials()` | Rejected by ASP.NET Core and insecure. | `WithOrigins("http://localhost:5173")` |
| `Task.Run(...)` or `await Task.Delay(10_000)` inside the POST handler | Holds the request and defeats the lesson. A fire-and-forget task has no shutdown handling. | `Channel<T>` + `BackgroundService` |
| `Clients.Caller` / `Clients.Client(connectionId)` for "notify the poster" | `IHubContext` has no caller. A connectionId is lost on every reconnect and differs per tab. | `Clients.User(username)` via `IUserIdProvider` |
| Starting the connection in a `useEffect` with no cleanup or guard | `StrictMode` runs effects twice in dev, giving double handlers and start/stop races. | Singleton connection or ref, plus `off()`/`stop()` in cleanup |
| A real auth stack, ASP.NET Identity, or JWT | Explicitly out of scope. | Fake username + `IUserIdProvider` |
| EF Core, SQLite, or Redis backplane | Explicitly out of scope (in-memory only). A backplane is only needed for multiple server instances. | In-memory state |
| MessagePack protocol | An extra package that makes the wire unreadable in DevTools. | Default JSON |
| Browser Web Push, service workers, VAPID | Out of scope. This is in-app only. | SignalR + toast |
| TypeScript 7.x native compiler (npm `latest`) | The Vite template pins `~6.0.3`, so 7.x is off the tested path. | Template's TypeScript |
| `next-themes`, a UI kit, Tailwind, or similar | Adds setup noise to a demo whose subject is SignalR. Sonner is already styled. | Hand-written minimal CSS |

## Stack Patterns by Variant

- Set `<TargetFramework>net8.0</TargetFramework>`. Everything above compiles unchanged.
- Because 8.0 support ends 2026-11-10, prefer installing 10 if at all possible.
- Add the LAN origin to `WithOrigins(...)`, bind Kestrel to `0.0.0.0`, and make the hub URL configurable through `VITE_API_URL`.
- Use `https://` only if you also trust the dev cert on the other machines, otherwise stay on HTTP for the demo.
- Use the Vite proxy (`/hubs` and `/api` with `ws: true`) and a relative URL as an emergency fallback.
- Keep `IUserIdProvider`. Swap the query string for `accessTokenFactory` plus `AddJwtBearer` with an `OnMessageReceived` handler that reads `access_token`, and let the default `NameIdentifier` mapping or a claim-based provider supply the id.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `vite@8.3.5` | Node `^20.19.0 \|\| >=22.12.0` | Local Node 22.23.2 satisfies this. |
| `@vitejs/plugin-react@6.1.2` | `vite@^8` | Peer dependency. |
| `react@19.3.1` | `sonner@2.0.8` | Peer is `react >=16`. |
| `@microsoft/signalr@10.0.11` | `net10.0` server | Major numbers match. 8.0.x and 9.0.x client lines also exist and speak the same protocol, but there is no reason to mix. |
| `@microsoft/signalr@10.0.11` | Vite 8 / Rolldown bundling | Verified: a scaffold with `signalr`, `sonner`, React 19.3.1 and TS 6.0.x passed `tsc -b && vite build` in this research. |
| `create-vite@9.3.1` template `react-ts` | `typescript ~6.0.3`, `oxlint` | `npm run lint` is `oxlint`, not ESLint. |
| .NET 10 SDK | `Microsoft.AspNetCore.App` 10.0.x | ASP.NET Core 10 change: SignalR endpoints are marked as API endpoints, so cookie auth returns 401/403 instead of redirecting. Irrelevant here (no auth) but relevant to the JWT follow-up. |

## Open Items for Phase Planning

- `dotnet` is not on `PATH` in the local shell (the SDK lives in `~/.dotnet`). The README and run scripts need to handle that, or the "two commands" promise fails on a clean machine.
- Choose the fixed ports (suggested 5080 for the server and 5173 for the client) in phase 1 and keep them in one place on each side.
- The `StrictMode` handling pattern in the React hook was not exercised here. Treat it as the first thing to test in phase 1.
- Nothing was run against a live hub in this research. The server code above follows Microsoft Learn but is unexecuted.

## Sources

- npm registry (queried 2026-10-26): `@microsoft/signalr` 10.0.11 (dist-tags: latest 10.0.11, next 11.0.0-preview.7), `react`/`react-dom` 19.3.1, `vite` 8.3.5, `@vitejs/plugin-react` 6.1.2, `sonner` 2.0.8, `react-hot-toast` 2.6.1, `react-toastify` 11.1.0, `typescript` 7.0.2, `create-vite` 9.3.1. HIGH.
- Template contents of `create-vite@9.3.1` (`template-react-ts/package.json`). HIGH.
- Local verification build (Vite 8.3.5, React 19.3.1, `@microsoft/signalr` 10.0.11, `sonner` 2.0.8, TS 6.0.x): passed. HIGH.
- https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core: .NET 10 LTS (10.0.14, support to 2028-11-14), 8 and 9 end 2026-11-10, 11 in RC. HIGH.
- https://learn.microsoft.com/en-us/aspnet/core/signalr/javascript-client?view=aspnetcore-10.0: `withUrl`, `withAutomaticReconnect` defaults (0/2/10/30s), callbacks, no retry on initial start failure, absolute URL for CORS, handlers before `start()`. HIGH.
- https://learn.microsoft.com/en-us/aspnet/core/signalr/security?view=aspnetcore-10.0: required CORS policy (specific origins, GET/POST/DELETE, credentials), WebSocket origin note. HIGH.
- https://learn.microsoft.com/en-us/aspnet/core/signalr/authn-and-authz?view=aspnetcore-10.0: `IUserIdProvider`, singleton registration, uniqueness warning. HIGH.
- https://learn.microsoft.com/en-us/aspnet/core/signalr/hubcontext?view=aspnetcore-10.0: `IHubContext<T>` and `IHubContext<T, TClient>`, no Caller/ConnectionId outside the hub. HIGH.
- https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services?view=aspnetcore-10.0: `BackgroundService`, `Channel.CreateBounded`, `AddHostedService`, queued work pattern. HIGH.
- https://learn.microsoft.com/en-us/aspnet/core/release-notes/aspnetcore-10.0: no new SignalR features in 10. HIGH.
- https://vite.dev/guide/: Node requirement, `react-ts` template, port 5173. HIGH.
- Reading `connection.GetHttpContext()?.Request.Query[...]` inside `IUserIdProvider`, the camelCase default JSON, the `StrictMode` double-effect problem, and the sequential-worker trap come from API knowledge and reasoning, not from a fetched page. MEDIUM. Verify in phases 1, 3 and 4.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
