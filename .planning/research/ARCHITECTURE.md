# Architecture Research

**Domain:** Real-time in-app notifications (ASP.NET Core SignalR server + React/Vite client), learning demo
**Researched:** 2026-10-26
**Confidence:** HIGH for server-side SignalR/Channel/BackgroundService structure (stable, long-standing .NET APIs); MEDIUM for React-side provider details (React 18/19 StrictMode behavior and the `@microsoft/signalr` lifecycle are well known but not re-verified against live docs in this pass)

## Standard Architecture

### System Overview

```
 BROWSER TAB (one HubConnection per tab)                 ASP.NET Core process (single, in-memory)
┌───────────────────────────────────────┐          ┌──────────────────────────────────────────────────┐
│  UserProvider (fake login, per tab)   │          │  Pipeline: UseCors -> MapHub / MapPost            │
│        │ username                     │          │                                                  │
│        v                              │  WS      │  ┌────────────────────┐   ┌───────────────────┐  │
│  NotificationProvider                 │<========>│  │ NotificationHub    │   │ QueryStringUser   │  │
│   - builds HubConnection(username)    │ /hubs/   │  │ (transient; thin;  │<--│ IdProvider        │  │
│   - connection.on("Receive...")       │ notif.   │  │ client->server RPC)│   │ ?user=alice -> id │  │
│   - status / list / unread state      │          │  └─────────┬──────────┘   └───────────────────┘  │
│        │ context                      │          │            │ uses                                │
│        v                              │          │            v                                     │
│  useNotifications() hook              │          │  ┌────────────────────────────────────────────┐  │
│   ├─ ConnectionStatus badge           │          │  │ IHubContext<NotificationHub, INotifClient> │  │
│   ├─ SendForm (broadcast/user/group)  │          │  │ (singleton; the ONLY way non-hub code      │  │
│   ├─ NotificationList + unread badge  │  HTTP    │  │  pushes to clients)                        │  │
│   ├─ Toast host                       │  POST    │  └───────────────────────▲────────────────────┘  │
│   └─ TaskButton -> fetch POST /api/   │─────────>│  POST /api/tasks (202)   │ SendAsync after 10s   │
│        tasks  (X-Username header)     │ <-202----│        │ write           │                       │
└───────────────────────────────────────┘          │        v                 │                       │
                                                   │  ┌──────────────┐  read  ┌┴───────────────────┐   │
                                                   │  │ Channel<Job> │------->│ TaskWorker         │   │
                                                   │  │ (singleton   │        │ (BackgroundService)│   │
                                                   │  │  TaskQueue)  │        └────────────────────┘   │
                                                   │  └──────────────┘                                 │
                                                   └──────────────────────────────────────────────────┘
```

Two inbound paths, one outbound path. Clients reach the server by (a) invoking hub methods over the WebSocket (broadcast, targeted, join/leave group) or (b) plain HTTP (`POST /api/tasks`). The server reaches clients only by calling `Clients.*` on either the hub's own `Clients` property (inside a hub method) or an injected `IHubContext` (everywhere else). All three trigger styles converge on the same single client event, `ReceiveNotification`, so the React side needs exactly one handler.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `NotificationHub` | Client-to-server entry point: `SendBroadcast`, `SendToUser`, `SendToGroup`, `JoinGroup`, `LeaveGroup`. Stamps the notification (id, timestamp, sender) server-side. Holds NO state. | `Hub<INotificationClient>` (strongly typed). Instance is created per invocation (transient), so instance fields are lost. |
| `INotificationClient` | The server-to-client contract: `Task ReceiveNotification(Notification n)`. Removes magic strings on the C# side. | Plain interface; used as the type argument of `Hub<T>` and `IHubContext<THub, T>`. |
| `IUserIdProvider` impl | Maps a connection to a user id so `Clients.User(id)` works. For the demo: read `?user=` from the connection's HTTP request. | `GetUserId(HubConnectionContext c) => c.GetHttpContext()?.Request.Query["user"]`. Registered as a singleton. |
| `IHubContext<NotificationHub, INotificationClient>` | Lets code outside a hub (the worker, endpoints) push to clients. Singleton, safe to inject into a `BackgroundService`. | Constructor-injected; call `.Clients.User(userId).ReceiveNotification(...)`. |
| `TaskQueue` | In-process hand-off between the HTTP request and the worker. | Singleton wrapping `Channel.CreateUnbounded<TaskJob>()` (or bounded for a back-pressure talking point); exposes `WriteAsync` and a `ChannelReader`. |
| `POST /api/tasks` endpoint | Validates the poster, enqueues a job, returns `202 Accepted` immediately. | Minimal API `MapPost`; reads the username from a header; `Results.Accepted($"/api/tasks/{id}", new { id })`. |
| `TaskWorker` | Does the "long work" (delay ~10s) outside the request, then notifies the poster. | `BackgroundService` registered with `AddHostedService`; consumes the channel; calls `IHubContext`. |
| CORS policy | Lets the Vite dev origin (`http://localhost:5173`) negotiate and open the WebSocket. | `WithOrigins(...)`, `AllowAnyHeader()`, `AllowAnyMethod()`, `AllowCredentials()`. Specific origin required because credentials are allowed (wildcard is rejected). |
| `UserProvider` (React) | Owns the fake login: current username. | Context + `sessionStorage` (per tab, so each tab can be a different user). |
| `NotificationProvider` (React) | Owns the `HubConnection` lifecycle, connection status, notification list, unread count, and the send/join/leave actions. | Context provider; builds the connection in `useEffect` keyed on username. |
| `useNotifications()` (React) | Thin consumer hook so components never touch `HubConnection` directly. | `useContext` wrapper that throws if used outside the provider. |
| UI components | Presentation only: status indicator, send form, list, badge, toasts, login box, task button. | Plain function components reading from the hook. |

## Recommended Project Structure

```
push_notification_demo/
├── README.md                       # "try it with two tabs" walkthrough
├── presentation/                   # live-demo script or slides
├── server/
│   ├── NotificationDemo.Server.csproj
│   ├── Program.cs                  # DI, CORS, SignalR, MapHub, MapPost: the whole wiring on one screen
│   ├── Hubs/
│   │   ├── NotificationHub.cs      # Hub<INotificationClient>
│   │   └── INotificationClient.cs  # server -> client contract
│   ├── Identity/
│   │   └── QueryStringUserIdProvider.cs
│   ├── Models/
│   │   └── Notification.cs         # record: Id, Type, Message, Sender, Target, Timestamp
│   └── Tasks/
│       ├── TaskJob.cs              # record: Id, UserId
│       ├── TaskQueue.cs            # Channel<TaskJob> wrapper
│       ├── TaskWorker.cs           # BackgroundService
│       └── TaskEndpoints.cs        # MapPost("/api/tasks")
└── client/
    ├── package.json                # vite, react, @microsoft/signalr, a toast lib
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── types.ts                # Notification type mirroring the server record
        ├── context/
        │   ├── UserContext.tsx           # fake login
        │   └── NotificationContext.tsx   # connection lifecycle + state
        ├── hooks/
        │   └── useNotifications.ts
        └── components/
            ├── LoginBox.tsx
            ├── ConnectionStatus.tsx
            ├── SendForm.tsx              # broadcast / user / group tabs
            ├── GroupControls.tsx         # join / leave
            ├── NotificationList.tsx      # + unread badge
            └── TaskButton.tsx            # POST /api/tasks
```

### Structure Rationale

- **`server/` and `client/` as siblings:** matches the stated constraint (one repo, two commands). Each side is independently runnable; the only coupling is the hub URL, the event name, and the `Notification` shape.
- **Folders per concern on the server (Hubs / Identity / Tasks):** the audience is learning; each SignalR concept (hub, user id provider, `IHubContext` + background work) lives in its own small, nameable file they can open during the presentation. Avoid layering (Services/Repositories/Domain): that adds ceremony with no teaching value.
- **`Program.cs` holds all wiring:** the "how is this connected" question is answered in one file. Keep it flat (top-level statements, no Startup class).
- **Context separate from hook, hook separate from components:** components stay free of SignalR imports, so the "why it works" story is concentrated in `NotificationContext.tsx`.

## Architectural Patterns

### Pattern 1: Thin strongly-typed hub + shared `IHubContext` for everything else

**What:** The hub contains only client-initiated entry points and delegates nothing heavy. Anything server-initiated goes through `IHubContext<NotificationHub, INotificationClient>`. Strongly typed (`Hub<T>`) so the event name is a method name checked by the compiler.
**When to use:** Always for this demo. It is the canonical SignalR shape and the single most teachable idea ("a hub is per-call and short-lived; `IHubContext` is how the rest of the app talks to clients").
**Trade-offs:** Strong typing hides the raw string `"ReceiveNotification"` that the JS client must match (the method name becomes the event name). Add one comment on the interface naming the JS handler. Slightly more setup than `SendAsync("name", ...)`, but safer.

**Example:**
```csharp
public interface INotificationClient
{
    // JS client subscribes with connection.on("ReceiveNotification", ...)
    Task ReceiveNotification(Notification notification);
}

public class NotificationHub : Hub<INotificationClient>
{
    public Task SendBroadcast(string message) =>
        Clients.All.ReceiveNotification(Notification.From("broadcast", message, Context.UserIdentifier));

    public Task SendToUser(string targetUser, string message) =>
        Clients.User(targetUser).ReceiveNotification(Notification.From("user", message, Context.UserIdentifier));

    public Task SendToGroup(string group, string message) =>
        Clients.Group(group).ReceiveNotification(Notification.From("group", message, Context.UserIdentifier, group));

    public Task JoinGroup(string group)  => Groups.AddToGroupAsync(Context.ConnectionId, group);
    public Task LeaveGroup(string group) => Groups.RemoveFromGroupAsync(Context.ConnectionId, group);
}
```

### Pattern 2: 202 Accepted + `Channel<T>` + `BackgroundService` + `IHubContext`

**What:** The endpoint does the minimum (validate, enqueue, return 202). A hosted worker drains the channel, performs the slow work, and pushes the result to the posting user via `IHubContext`. This is the architectural point of phase 4: long work must leave the request, and the result returns over the already-open WebSocket rather than the HTTP response.
**When to use:** Any server-originated notification triggered by an HTTP call or other non-hub code.
**Trade-offs:** In-memory queue means queued jobs are lost on restart (acceptable here; say so explicitly in the presentation, and name Hangfire/Quartz/a message broker as the production answer). Unbounded channel is simplest; a bounded channel adds `FullMode` decisions that distract.

**Example:**
```csharp
// Endpoint
app.MapPost("/api/tasks", async (HttpRequest req, TaskQueue queue) =>
{
    var user = req.Headers["X-Username"].ToString();
    if (string.IsNullOrWhiteSpace(user)) return Results.BadRequest("X-Username required");
    var job = new TaskJob(Guid.NewGuid(), user);
    await queue.WriteAsync(job);
    return Results.Accepted($"/api/tasks/{job.Id}", new { job.Id });
});

// Worker: process jobs concurrently so five rapid POSTs finish ~10s after each post, not 50s in series
public class TaskWorker(TaskQueue queue, IHubContext<NotificationHub, INotificationClient> hub,
                        ILogger<TaskWorker> log) : BackgroundService
{
    protected override Task ExecuteAsync(CancellationToken ct) =>
        Parallel.ForEachAsync(queue.Reader.ReadAllAsync(ct),
            new ParallelOptions { MaxDegreeOfParallelism = 8, CancellationToken = ct },
            async (job, token) =>
            {
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(10), token);   // the "long work"
                    await hub.Clients.User(job.UserId).ReceiveNotification(
                        Notification.From("task", $"Task {job.Id:N} completed", "server"));
                }
                catch (OperationCanceledException) { /* shutting down */ }
                catch (Exception ex) { log.LogError(ex, "Task {Id} failed", job.Id); }
            });
}
```

### Pattern 3: Identity via `IUserIdProvider` reading the query string (fake login)

**What:** Browsers cannot set custom headers on a WebSocket handshake, so identity for SignalR must ride in the URL (this is also why real auth uses the `access_token` query parameter, the parked JWT question). For the fake login, the client connects to `/hubs/notifications?user=alice`; the provider reads `?user=`; `Clients.User("alice")` then reaches every connection (every tab) that connected as alice.
**When to use:** Phase 3 onward. Must exist before server-originated notifications, because the worker has only a username string, not a connection.
**Trade-offs:** Completely spoofable (anyone can claim to be anyone). That is the stated trade for the demo; label it loudly in code and README. Note `IUserIdProvider` only feeds `Clients.User(...)` and `Context.UserIdentifier`; it does NOT populate `Context.User.Identity.Name`, so use `Context.UserIdentifier` for the sender.

**Example:**
```csharp
public class QueryStringUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection) =>
        connection.GetHttpContext()?.Request.Query["user"].ToString() is { Length: > 0 } u ? u : null;
}
// Program.cs: builder.Services.AddSingleton<IUserIdProvider, QueryStringUserIdProvider>();
```

### Pattern 4: One connection per logged-in user, owned by a React provider effect

**What:** `NotificationProvider` creates the `HubConnection` inside a `useEffect` that depends on `username`, registers handlers BEFORE `start()`, and tears down in the cleanup. Connection state (`status`) is mirrored into React state from the lifecycle callbacks. All three notification kinds funnel through one `ReceiveNotification` handler that both appends to the list and fires the toast.
**When to use:** Always. Do not create the connection at render time, and do not create one per component.
**Trade-offs:** React 18/19 StrictMode runs effects twice in development (mount, cleanup, mount). The first connection is stopped during negotiation, which logs a benign "connection was stopped during negotiation" error. Handle by catching and ignoring that failure on `start()` for a connection that has already been disposed; do not "fix" it by removing StrictMode or by moving the connection to module scope without a plan.

**Example:**
```typescript
useEffect(() => {
  if (!username) return;
  const conn = new signalR.HubConnectionBuilder()
    .withUrl(`${HUB_URL}?user=${encodeURIComponent(username)}`)
    .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])   // finite; visible in the demo
    .build();

  conn.on("ReceiveNotification", (n: Notification) => {
    dispatch({ type: "received", n });        // list + unread
    toast(n.message);                         // side effect lives in the handler, not in render
  });
  conn.onreconnecting(() => setStatus("reconnecting"));
  conn.onreconnected(() => { setStatus("connected"); rejoinGroups(conn); });  // groups are lost on reconnect
  conn.onclose(() => setStatus("disconnected"));

  let disposed = false;
  setStatus("connecting");
  conn.start().then(() => !disposed && setStatus("connected"))
              .catch(err => { if (!disposed) { setStatus("disconnected"); console.error(err); } });

  connRef.current = conn;
  return () => { disposed = true; conn.off("ReceiveNotification"); void conn.stop(); };
}, [username]);
```

## Data Flow

### Request Flow

```
Broadcast / Targeted / Group (client -> hub -> clients)
  SendForm submit
      v
  useNotifications().send(...)  -->  connection.invoke("SendToUser", target, msg)
                                           v  (WebSocket)
                                    NotificationHub.SendToUser
                                           v
                                    Clients.User(target).ReceiveNotification(n)
                                           v  (WebSocket, fan-out to every connection of that user)
                                    connection.on("ReceiveNotification") in each target tab
                                           v
                                    reducer (list + unread++) and toast()

Server-originated (HTTP -> queue -> worker -> clients)
  TaskButton click
      v
  fetch POST /api/tasks  (header X-Username: alice)  -- CORS preflight first (custom header)
      v
  endpoint: queue.WriteAsync(job)  -->  returns 202 immediately
                                           (request is finished; UI shows "task started")
      v
  TaskWorker (separate thread of control): ReadAllAsync -> Task.Delay(10s)
      v
  IHubContext.Clients.User("alice").ReceiveNotification(n)
      v  (WebSocket, to every tab logged in as alice)
  same handler as above: list + unread++ + toast
```

### State Management

```
Server: no persistent state. Only transient in-memory state:
   - SignalR's connection/group registry (managed by SignalR, per process, lost on restart)
   - Channel<TaskJob> contents (lost on restart)

Client:
UserProvider(username, sessionStorage)
    v
NotificationProvider
  { status, notifications[], unreadCount, joinedGroups }  <-- reducer
    ^   handlers: received / markAllRead / groupJoined / groupLeft
    |
useNotifications()  -->  components (read state, call send/join/leave)
```

`unreadCount` should be derived (`notifications.filter(n => !n.read).length`) rather than stored separately. "Mark read" fires when the list panel is opened or on an explicit button.

### Key Data Flows

1. **Connect:** login sets `username` -> effect builds the connection with `?user=` -> negotiate (HTTP, CORS-checked) -> WebSocket upgrade -> `IUserIdProvider` assigns the user id -> status goes `connecting` -> `connected`.
2. **Broadcast:** `invoke("SendBroadcast")` -> `Clients.All` -> every connection in every tab (including the sender; decide deliberately whether the sender sees its own toast, and say so in the demo).
3. **Targeted:** `invoke("SendToUser")` / `invoke("SendToGroup")`; `Clients.User` reaches all of that user's tabs; `Clients.Group` reaches only connections that called `JoinGroup`.
4. **Server-originated:** HTTP 202 now, WebSocket push ~10s later. The two halves share only the username string, which is why identity must be done first.
5. **Reconnect:** transport drops -> `onreconnecting` (status badge flips) -> reconnect gets a NEW connection id -> `onreconnected` -> client re-invokes `JoinGroup` for each group it believes it is in. Anything sent while disconnected is gone (no persistence by design).

## Build Order (suggested; maps to the draft phases)

Dependencies determine order; each step ends in something demonstrable with two tabs.

| Step | Build | Depends on | Demonstrable result |
|------|-------|------------|---------------------|
| 1 | Server skeleton: `Program.cs` with `AddSignalR`, CORS policy, empty `NotificationHub`, `MapHub`. Client skeleton: Vite app, `NotificationProvider` that connects and shows status. | none | Tab shows "Connected"; kill/restart the server and see status change |
| 2 | Notification model + `INotificationClient` + `SendBroadcast` + `SendForm` + list + toast + single `ReceiveNotification` handler | 1 | Type in tab A, toast in tabs A and B |
| 3 | `UserProvider` (fake login, `sessionStorage`) + `QueryStringUserIdProvider` + `SendToUser` + `JoinGroup`/`LeaveGroup`/`SendToGroup` + group UI. Connection effect now keyed on `username`. | 2 | Alice sends to Bob; group members only |
| 4 | `TaskQueue`, `TaskWorker`, `POST /api/tasks`, `TaskButton` (with `X-Username`, CORS header allowed) | 3 (needs user identity) | Click in tab A; 202 immediately; "Task completed" 10s later in alice's tabs only |
| 5 | Reconnect policy + status states + `rejoinGroups` on reconnect + unread badge | 1-4 | Restart server mid-demo; status recovers; groups still work; badge counts |
| 6 | README two-tab walkthrough + presentation script | 1-5 | Teammate can follow it cold |

Ordering notes for the roadmap:
- Steps 1 to 2 can be built nearly as one slice if desired (the connect proof is tiny), but keep step 1 as its own checkpoint: most "it doesn't work" problems (CORS, URL, ports) show up here.
- Step 3 changes the client connection from "static URL" to "URL depends on username", which touches the lifecycle code from step 1. Build step 1 with the `useEffect([username])` shape from the start (using a hard-coded username placeholder) to avoid a rewrite.
- Step 5's reconnect logic is mostly independent of 2 to 4 but its group-rejoin needs step 3. The unread badge only needs step 2 and could be pulled earlier if a phase is light.
- There is no need for separate "data layer" or "auth" phases; both are explicitly out of scope.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Demo (a few tabs, one process) | Exactly this architecture. In-memory everything. |
| ~1k-100k concurrent connections | Still fine on one well-sized instance (SignalR holds connections cheaply); move the queue to a durable system (Hangfire/Quartz/broker) so jobs survive restarts. Add real auth (JWT via `access_token` query parameter). |
| Multiple server instances | Add a backplane (Redis or Azure SignalR Service) so `Clients.All/User/Group` reach connections on other nodes; sticky sessions or WebSockets-only (`skipNegotiation`) otherwise. Out of scope; mention in the presentation as the "what next". |

### Scaling Priorities

1. **First bottleneck:** the in-memory `Channel` and single-process group registry (restarts lose work; second instance cannot see first instance's connections). Fix: durable queue plus backplane.
2. **Second bottleneck:** fan-out of `Clients.All` for large audiences. Fix: groups, or a managed service.

None of this should be built; the demo should only name it.

## Anti-Patterns

### Anti-Pattern 1: Doing the long work inside the request (or `Task.Run` from the endpoint)

**What people do:** `await Task.Delay(10_000)` in the controller, then send; or fire-and-forget `Task.Run(() => ...)` inside the endpoint.
**Why it's wrong:** The first blocks the HTTP request for 10s (defeats the lesson). The second is unobserved: exceptions vanish, shutdown does not wait for it, and it has no home for DI lifetimes.
**Do this instead:** Enqueue to the channel and return 202; let a `BackgroundService` own the work.

### Anti-Pattern 2: Processing the channel serially with a plain `await foreach` and a 10s delay inside

**What people do:** `await foreach (var job in reader.ReadAllAsync(ct)) { await Task.Delay(10s); ... }`.
**Why it's wrong:** The second POST waits for the first: with a live audience of several people clicking, notifications arrive 10s, 20s, 30s later and the demo looks broken.
**Do this instead:** `Parallel.ForEachAsync` with a modest `MaxDegreeOfParallelism`, or spawn a tracked task per job. Catch exceptions per job: an unhandled exception escaping `ExecuteAsync` stops the whole host by default in modern .NET.

### Anti-Pattern 3: State in hub fields, or sending to `Context.ConnectionId` from the worker

**What people do:** Keep a `List<string>` of users on the hub class; or remember the connection id at POST time and target `Clients.Client(id)`.
**Why it's wrong:** The hub is transient, so the field is gone after each call. A connection id dies on reconnect and only identifies one tab.
**Do this instead:** Target by user id (`Clients.User`), which survives reconnects and covers all tabs. This is exactly why identity precedes the background worker.

### Anti-Pattern 4: Creating or registering the connection in render, or registering handlers after `start()`

**What people do:** Build the `HubConnection` in the component body; call `on()` after `start()`; forget `off()`/`stop()` in cleanup.
**Why it's wrong:** Duplicate connections per re-render, duplicate toasts (handlers stacked), and dropped messages that arrive before the handler exists.
**Do this instead:** Connection in a `useEffect` keyed on username; `on()` before `start()`; cleanup removes handlers and stops the connection.

### Anti-Pattern 5: Storing the fake login in `localStorage`

**What people do:** Persist the username in `localStorage` so refresh keeps the login.
**Why it's wrong:** It is shared across tabs, so both demo tabs become the same user and targeted messages cannot be demonstrated.
**Do this instead:** `sessionStorage` (per tab) or no persistence.

### Anti-Pattern 6: Wildcard CORS with credentials, or `UseCors` after `MapHub`

**What people do:** `AllowAnyOrigin()` plus `AllowCredentials()` (rejected by ASP.NET Core), or place `UseCors` after endpoint mapping/routing in the wrong order.
**Why it's wrong:** Negotiate fails in the browser with an opaque CORS error that looks like a SignalR bug.
**Do this instead:** Explicit origin(s), `AllowCredentials()`, `AllowAnyHeader()` (also needed for `X-Username` on the POST), `app.UseCors(...)` before `MapHub`/`MapPost`.

## Integration Points

### External Services

None. The demo has no external services, no database, and no push provider by design.

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| React UI <-> `NotificationProvider` | React context + hook | Components never import `@microsoft/signalr`. |
| `NotificationProvider` <-> `NotificationHub` | WebSocket: `invoke(...)` up, `on("ReceiveNotification")` down | Method names and the event name are a string contract; define once on each side and cross-reference in comments. |
| `TaskButton` <-> `POST /api/tasks` | HTTP fetch, header `X-Username` | Triggers CORS preflight; the identity is a plain header here (not SignalR identity). |
| Endpoint <-> `TaskWorker` | `Channel<TaskJob>` via singleton `TaskQueue` | Producer/consumer; DI singleton on both sides. |
| `TaskWorker` <-> clients | `IHubContext<NotificationHub, INotificationClient>` | Singleton-safe in a hosted service. |
| `NotificationHub` <-> `IUserIdProvider` | SignalR runtime calls provider on connect | Provider must be registered as a singleton. |
| Client <-> server shared contract | `Notification` JSON shape | SignalR default JSON uses camelCase property names; make `types.ts` match. |

## Environment Note

`dotnet` was not found on this machine during research (`dotnet --list-sdks` returned "command not found"). Phase 1 of the roadmap must include installing the .NET SDK (the version targeted should be a currently supported LTS; PROJECT.md says ".NET 8+") as a prerequisite. The npm package `@microsoft/signalr` latest is 10.0.11 with `8.0.x` and `9.0.x` dist-tags available; align the client package major version with the chosen .NET target.

## Sources

- Microsoft Learn, ASP.NET Core SignalR documentation: hubs, `IHubContext`, strongly typed hubs, users and groups, `IUserIdProvider`, JS client reconnect, authentication (access_token query string) (training knowledge of long-stable APIs; not re-fetched this pass) - MEDIUM
- Microsoft Learn, "Background tasks with hosted services" and `System.Threading.Channels` guidance (training knowledge) - MEDIUM
- React documentation on StrictMode double-invoked effects and effect cleanup (training knowledge) - MEDIUM
- `npm view @microsoft/signalr` run 2026-10-26: latest 10.0.11, dist-tags 8.0.x / 9.0.x / next - HIGH
- Local environment check: `dotnet` absent - HIGH
- `/home/firestorm/source/push_notification_demo/.planning/PROJECT.md` and `.planning/notes/signalr-notification-demo-decisions.md` (project constraints and draft phases) - HIGH

---
*Architecture research for: SignalR + React real-time notification demo*
*Researched: 2026-10-26*
