# Pitfalls Research

**Domain:** Real-time in-app notifications, ASP.NET Core SignalR (.NET 8+) server plus React (Vite) client using `@microsoft/signalr`. This is a team-learning demo with fake username login, in-memory state and a live presentation.
**Researched:** 2026-10-26
**Confidence:** MEDIUM-HIGH. Official Microsoft docs confirm the hub, group, IHubContext and timeout behavior (HIGH). The React StrictMode, Vite HMR and browser-throttling items come from well-known community behavior and were not re-verified against a source this session (MEDIUM). Stateful-reconnect group behavior is unverified (LOW) and is flagged where it appears.

Phase names follow the draft in `.planning/notes/signalr-notification-demo-decisions.md`:
P1 Skeleton (hub, CORS, connect, status), P2 Broadcast, P3 Targeted (identity, groups), P4 Server-originated (202, BackgroundService, IHubContext), P5 Polish (reconnect, unread badge, README), P6 Presentation.

---

## Critical Pitfalls

### Pitfall 1: CORS with credentials is configured in a way that fails or is insecure

**What goes wrong:**
The browser blocks `/hub/negotiate` with a CORS error and the connection never starts. The classic causes are:
- `AllowAnyOrigin()` combined with `AllowCredentials()`. ASP.NET Core rejects this combination, and browsers reject `Access-Control-Allow-Origin: *` on credentialed requests.
- `UseCors` placed after `MapHub`, or the policy never applied to the hub endpoint.
- Restricting headers or methods. The JS client sends `X-SignalR-User-Agent` on negotiate, which forces a preflight. A policy without `AllowAnyHeader()` fails there.
- The origin does not match exactly. Vite serves on `http://localhost:5173`, but someone opens `127.0.0.1:5173`, or Vite silently moves to 5174 because 5173 is busy.

The "fix" people paste from Stack Overflow is `SetIsOriginAllowed(_ => true).AllowCredentials()`. That works, but it is a wide-open credentialed policy, and the team will copy it.

**Why it happens:**
The JS client's `withCredentials` defaults to `true`, so credentialed CORS is on without anyone asking for it. WebSockets are not subject to CORS, but the negotiate POST is. That makes the error look like a SignalR problem rather than a CORS problem. The browser console message is vague, and the server logs nothing unless CORS logging is enabled.

**How to avoid:**
- Use an explicit policy: `WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod().AllowCredentials()`.
- Read the origin list from configuration rather than hard-coding it in two places.
- Pin the Vite port with `server.port` and `strictPort: true` so it fails loudly instead of moving.
- Call `app.UseCors(...)` before `app.MapHub<>()`.
- Keep `AllowCredentials()` only if cookies or auth are actually used. For a fake-username demo you could set `withCredentials: false` on the client and drop `AllowCredentials`. That is the simpler, safer demo. Choose one deliberately and write a comment saying why.
- Choose one topology and stick with it: either direct cross-origin with CORS (teaches CORS) or a Vite proxy (no CORS, but needs `ws: true`, see Pitfall 9). Do not mix them.

**Warning signs:**
- Console error "blocked by CORS policy... The value of the 'Access-Control-Allow-Origin' header must not be the wildcard '*' when the request's credentials mode is 'include'".
- The Network tab shows a failed OPTIONS or negotiate request.
- Works at `localhost:5173`, fails at `127.0.0.1:5173`.

**Phase to address:** P1 (Skeleton). Success criterion: the status badge shows "Connected" from a fresh clone, and the origin and port are documented in the README.

---

### Pitfall 2: React StrictMode double-mount creates a race, duplicate connections, and duplicate handlers

**What goes wrong:**
In dev, StrictMode mounts, unmounts, then remounts every effect. A naive `useEffect(() => { conn.start(); }, [])` produces:
- The console error "Failed to start the connection: Error: The connection was stopped during negotiation", or "Cannot start a HubConnection that is not in the 'Disconnected' state". This happens when cleanup calls `stop()` while the first `start()` is still negotiating.
- Two live connections for one tab. If cleanup is missing, the first connection is never stopped. A user-targeted message is then delivered twice, and the server's connection count is double.
- Handlers registered twice with `connection.on("ReceiveNotification", ...)`. Every toast then appears twice. This is easy to mistake for a server bug.

**Why it happens:**
Developers create the `HubConnection` inside the component body (a new one per render) or inside an effect without cleanup. They also treat `start()` as synchronous. `start()` and `stop()` are async and overlap during the double-mount.

**How to avoid:**
- Create the connection once, outside the render path. Use a `ConnectionProvider` that builds it in `useEffect` or `useRef`, or a module-level factory keyed by username.
- Keep the whole lifecycle in one effect:
  ```ts
  useEffect(() => {
    const conn = new HubConnectionBuilder()/*...*/.build();
    conn.on("ReceiveNotification", handler);
    const startPromise = conn.start().catch(err => { if (!stopped) setStatus("failed"); });
    let stopped = false;
    return () => { stopped = true; conn.off("ReceiveNotification", handler); startPromise.finally(() => conn.stop()); };
  }, [username]);
  ```
  The point is to build a fresh connection per effect run, wait for `start()` to settle before `stop()`, and ignore the "stopped during negotiation" error.
- Do not "fix" it by removing `<StrictMode>`. StrictMode is what exposes the missing cleanup, and the team should learn from it. Disabling it is acceptable only as a last resort, with a comment.

**Warning signs:**
- Every toast appears twice in dev but once in a production build.
- A red "stopped during negotiation" error on page load.
- The server `OnConnectedAsync` log shows two connections per tab load.

**Phase to address:** P1 (Skeleton). Build the connection hook correctly once, and every later phase reuses it. Verify with a log line in `OnConnectedAsync`: one tab load should show one connection, and after a reload the old one should disconnect.

---

### Pitfall 3: Stale closures and side effects in React state updaters

**What goes wrong:**
Three related bugs in the notification list and unread badge:
1. A handler registered once in an effect with `setItems([...items, n])` captures the first `items` value, so the list only ever shows the latest item. The fix is the functional form, `setItems(prev => [n, ...prev])`.
2. Calling `toast(...)` or incrementing the unread count inside a `setState(prev => ...)` updater. StrictMode runs updaters twice, so there are duplicate toasts and a badge that counts by 2.
3. List `key={index}`, which causes UI glitches when items are prepended. The server should generate a notification `id` (GUID) and `createdAt`, and the client should key on the id.

**Why it happens:**
`connection.on` callbacks are long-lived, so they close over whatever state existed when the effect ran. Updaters are expected to be pure, but a toast call looks harmless.

**How to avoid:**
- Keep updaters pure. Fire the toast in the handler body, outside any updater.
- Use `useReducer` or functional updates.
- Derive "unread" from data (`items.filter(i => !i.read).length`) or a single reducer rather than a separately maintained counter.
- Have the server assign `id`, `type` (broadcast, targeted, task), `message`, `sentAt` and `from`.

**Warning signs:** Badge jumps by 2. The list shows only one item, or an old item. Duplicate-key warnings in the console.

**Phase to address:** P2 (Broadcast) for the list and toast, P5 (Polish) for the unread badge.

---

### Pitfall 4: Using `Context.ConnectionId` as the user identity (or never defining identity)

**What goes wrong:**
`Clients.User("alice")` delivers nothing, silently, because no `IUserIdProvider` maps connections to "alice". Developers then fall back to keeping a `username -> connectionId` dictionary. That breaks in three ways:
- One user with two tabs has two connections, so the dictionary keeps only one, and the other tab misses the message.
- A reconnect issues a new connection ID, and the dictionary entry goes stale.
- The map is mutated from multiple threads, so a plain `Dictionary` can be corrupted.

Related traps:
- User identifiers are case-sensitive, so "Alice" and "alice" are different users. Normalize at login.
- Identity is bound at connect time. Changing the username in React state does not change the server-side identity. You must stop and start a new connection.
- A WebSocket cannot send custom headers from a browser. The username has to travel as a query string value on the connect URL (the `access_token` mechanism, or a custom query parameter), not a header.

**Why it happens:**
There is no authentication, so the default `ClaimTypes.NameIdentifier` provider returns null. The registration of a custom provider is easy to miss because it is just a DI line.

**How to avoid:**
- Register a custom `IUserIdProvider` as a singleton. It reads `connection.GetHttpContext()?.Request.Query["username"]`, trims it and lowercases it.
- On the client use `.withUrl(`${base}/hubs/notifications?username=${encodeURIComponent(name)}`)`. Rebuild the connection when the username changes (the Pitfall 2 effect keyed on `username` does this).
- Use `Clients.User(...)` and groups. Never maintain a connection-id dictionary. The official guidance says groups and `Clients.User` exist precisely so you do not have to.
- Keep a visible "you are alice" badge in the UI and show the identity in the connection status line.
- Document that the fake identity is spoofable and is not security (see Security Mistakes).

**Warning signs:**
- Targeted sends return success but nothing arrives.
- `Context.UserIdentifier` is null in `OnConnectedAsync` (log it).
- Targeted works in one tab but not both tabs of the same user.

**Phase to address:** P3 (Targeted). P4 depends on it, which is why the roadmap orders identity first.

---

### Pitfall 5: Treating the Hub as long-lived state, or putting services with the wrong lifetime in the BackgroundService

**What goes wrong:**
- A `Hub` instance is created per invocation, so it is transient. A field such as `private static int count` or an instance `List<string>` either loses data or turns into a thread-unsafe static. A teammate puts "online users" in a hub field and it is always empty.
- A `BackgroundService` (a singleton) injects a scoped service, and the host throws `InvalidOperationException: Cannot consume scoped service from singleton` at startup. Alternatively, a DbContext-like scoped thing is captured and used after disposal.
- The task worker reads `HttpContext` or `Context.UserIdentifier` after the request has ended. `HttpContext` is gone once the 202 is returned.

**Why it happens:**
The hub looks like a controller or a long-lived object but is neither. `IHubContext` and `IUserIdProvider` are singletons, but people forget that the BackgroundService cannot see request scope.

**How to avoid:**
- Keep state in singleton services (for example a `ConcurrentDictionary`-backed `NotificationStore`) registered with `AddSingleton`, and inject them into the hub's constructor.
- Capture the username inside the POST handler and put it into the work item (`record TaskJob(Guid Id, string User)`) before returning 202. Never reach back to `HttpContext` from the worker.
- Inject `IHubContext<NotificationHub>` (or `IHubContext<NotificationHub, INotificationClient>`) into the BackgroundService. It is a singleton and safe there.
- Use a bounded `Channel<TaskJob>` as the queue between the endpoint and the worker, which also reads well in a presentation.
- Know the limits: `IHubContext` has no `Caller`, `Others` or `ConnectionId`, and you cannot invoke hub methods through it. It is for sending only.

**Warning signs:** State that resets on every call. DI validation errors at startup. A `NullReferenceException` on `HttpContext` in the worker.

**Phase to address:** P3 for hub-state design, P4 for the worker and IHubContext usage.

---

### Pitfall 6: The BackgroundService is fragile (swallowed exceptions, host crash, slow shutdown, fire-and-forget)

**What goes wrong:**
- An unhandled exception in `ExecuteAsync` stops the whole host by default in .NET 6+ (`BackgroundServiceExceptionBehavior.StopHost`). One bad job kills the demo mid-presentation.
- The 10-second wait is `Thread.Sleep` or `Task.Delay(10_000)` without the stopping token. Ctrl+C and `dotnet watch` hang for up to 10 seconds, or until the host's shutdown timeout.
- The 10-second wait is done in the controller (`await Task.Delay` before returning), which defeats the whole lesson of 202 Accepted.
- `Task.Run(...)` fire-and-forget in the controller, with the exception unobserved and no lifetime management.
- `hubContext.Clients.User(...).SendAsync(...)` is not awaited, so a failure is lost.
- Jobs are lost on restart. That is acceptable for the demo but must be stated.

**How to avoid:**
- Loop with `await foreach (var job in channel.Reader.ReadAllAsync(stoppingToken))` and wrap each job in try/catch with logging.
- Pass `stoppingToken` to `Task.Delay`.
- If several jobs should run in parallel, start each job's delay as its own task. A sequential loop makes a second POST during the first 10 seconds wait for 20 seconds, which looks like a bug on stage.
- Return `Results.Accepted($"/api/tasks/{id}", new { id })` and send a "Task accepted" signal if useful.
- Write "jobs are in-memory and lost on restart" in the README and the slides.

**Warning signs:**
- The server exits after a POST with a bad payload.
- A second task finishes at 20 seconds.
- Ctrl+C hangs.

**Phase to address:** P4.

---

### Pitfall 7: Reconnect policy gaps, and group membership and identity assumptions after reconnect

**What goes wrong:**
- `withAutomaticReconnect()` default retry delays are 0, 2, 10 and 30 seconds, after which the connection goes to `Closed` and stays dead. If the server restarts (very likely with `dotnet watch` during the demo), the UI shows "Connected" or "Reconnecting" and then silently nothing, forever.
- Automatic reconnect only applies after a successful initial `start()`. If the page loads before the server is up, `start()` rejects and nothing retries. The common live-demo failure is starting the client before the server.
- After reconnect the connection ID is new, and group membership is not preserved (official docs: "Group membership isn't preserved when a connection reconnects"). A user who joined "team-a" stops receiving group messages, and the UI does not notice. Groups are also in-memory, so a server restart empties them.
- Notifications sent while disconnected are gone (no persistence). Users do not know they missed something.
- Stateful reconnect (`withStatefulReconnect`, .NET 8+) buffers and replays messages during short drops, but it is opt-in on both sides and has a buffer limit. Whether group membership survives it was not confirmed in the docs read. Treat that as unverified (LOW) and test before claiming it in the presentation.

**How to avoid:**
- Provide a custom `withAutomaticReconnect({ nextRetryDelayInMilliseconds })` that keeps retrying (for example capped exponential backoff, never returning null), or an `onclose` handler that restarts with a delay.
- Wrap the initial `start()` in a retry loop with backoff, and expose a status of `connecting | connected | reconnecting | disconnected | failed` in the UI.
- Keep the client's joined-group list in React state (or sessionStorage). In `onreconnected`, rejoin every group. Make server-side `JoinGroup` idempotent (the docs say adding twice is safe).
- Alternatively, re-derive group membership server-side in `OnConnectedAsync` from a singleton store keyed by username. This also survives a full page reload. Pick one rule and teach it.
- On `onreconnected`, show a banner: "Reconnected, you may have missed notifications".
- Leave stateful reconnect out of the base demo. Mention it as a follow-up.

**Warning signs:**
- After a server restart the status is stuck on "Reconnecting" or "Disconnected" and a page refresh is needed.
- Group sends reach only freshly joined tabs.
- The demo fails when the client is started first.

**Phase to address:** P5 (Polish) for the retry policy and rejoin logic. The initial-start retry should land in P1, because a "server not up yet" state shows up on day one.

---

### Pitfall 8: Method-name and payload mismatch fails silently

**What goes wrong:**
The server calls `SendAsync("ReceiveNotification", dto)`, but the client registered `on("receiveNotifications")` (extra "s"), or the argument shape changed. Nothing throws. The JS client logs a warning at best, and by default the log level hides it. The UI just stays empty. Relatedly, hub method arguments are bound positionally, and JSON is camelCased by default, so a client reading `n.Message` gets `undefined`.

**How to avoid:**
- Use a strongly typed hub (`Hub<INotificationClient>` and `IHubContext<NotificationHub, INotificationClient>`). Then the server side has no magic strings.
- Put the client method names in one constants file, and mirror the DTO as a TypeScript type.
- Configure `.configureLogging(LogLevel.Information)` in dev so "No client method with the name..." is visible.
- Keep a single payload shape: `{ id, kind, message, from, sentAt }`.

**Warning signs:** The server log shows a send, the Network frames show the message arriving, and the UI does nothing.

**Phase to address:** P2, and enforce through P3 and P4.

---

### Pitfall 9: WebSocket negotiation, transport fallback and proxy issues

**What goes wrong:**
- With a Vite proxy, `/hubs` needs `ws: true`, otherwise the WebSocket upgrade fails and SignalR quietly falls back to Server-Sent Events or long polling. Everything "works" but slowly, and the team believes they are seeing WebSockets.
- Hard-coding `skipNegotiation: true` with `transport: WebSockets` to dodge CORS works for a single server but hides the negotiate step the team is meant to learn. It also breaks if the app ever scales out or is put behind Azure SignalR.
- Using an `https://localhost:7xxx` server with an untrusted dev certificate gives an opaque failed negotiate. The presenter's laptop may not have run `dotnet dev-certs https --trust`.
- The server URL and port are hard-coded in the client and drift from `launchSettings.json`.

**How to avoid:**
- Prefer an `http://localhost:<port>` server profile for the demo, with the port taken from `launchSettings.json` and exposed to the client as `VITE_API_URL` in `.env`.
- If you use a proxy, set `server.proxy['/hubs'] = { target, ws: true, changeOrigin: true }`. Otherwise use direct CORS. Do not use both.
- Do not skip negotiation. Log or display the active transport (it is visible in the Network tab as a `101 Switching Protocols` request) so the team can see WebSockets are in use.

**Warning signs:** The Network tab shows repeated `GET /hubs/...?id=` long-poll requests rather than one 101. Negotiate succeeds but the socket fails.

**Phase to address:** P1.

---

## Moderate Pitfalls

### Pitfall 10: Browser tabs share `localStorage`, so the two-tab demo has one user

**What goes wrong:**
The fake login stores the username in `localStorage`. Both tabs share it, so a second login in tab 2 overwrites tab 1's identity, and the "send to one user" demo cannot show a message arriving in one tab but not the other. This undermines the project's core value ("open two tabs").

**Prevention:** Store the username in `sessionStorage` (per tab), or hold it in React state and ask on every load. Note that "Duplicate tab" copies sessionStorage, so the README walkthrough should say "open a new tab, not duplicate".

**Phase:** P3.

### Pitfall 11: Vite HMR and `dotnet watch` leave zombie connections

**What goes wrong:** A module-level `const connection = ...` is re-evaluated on HMR while the old connection is still open, so you accumulate connections and duplicate toasts without a page reload. `dotnet watch` restarts the server on a save, which drops all connections and empties groups (see Pitfall 7).

**Prevention:** Own the connection in a provider component with effect cleanup (Pitfall 2). If a module singleton is used, dispose it in `import.meta.hot.dispose`. Run the presentation with `dotnet run`, not `dotnet watch`, and a production-like `npm run dev` only after testing.

**Phase:** P1, and the presentation phase (P6).

### Pitfall 12: Client-supplied sender and unrestricted groups

**What goes wrong:** The hub method is `Send(string fromUser, string message)` and trusts `fromUser`. Any client can also join any group, call `Clients.All`, or send to any user. This is acceptable only because auth is out of scope, but it is exactly what a team will copy into a real app.

**Prevention:** Derive the sender from `Context.UserIdentifier` on the server. State in code comments and on a slide: "this identity is not authenticated; see the JWT follow-up in `.planning/research/questions.md`". Note that groups are not a security feature.

**Phase:** P3, and call it out in P6.

### Pitfall 13: Background-tab throttling and tab sleep

**What goes wrong:** Browsers throttle timers in hidden tabs (and may freeze them after a long time). The SignalR keep-alive ping runs on timers. The default server timeouts are 15 s keep-alive and 30 s server timeout, and a throttled or frozen tab can be considered dead and get disconnected, so a notification meant for a tab that is in the background goes missing. This is MEDIUM confidence and varies by browser. The default `serverTimeout` of 30 s should be at least double the keep-alive interval if you change either.

**Prevention:** Keep both demo tabs visible side by side (also better on a projector). If you change timeouts, keep `serverTimeout >= 2 x keepAlive`. Rely on the reconnect handling of Pitfall 7 for the rest.

**Phase:** P5/P6.

### Pitfall 14: SDK, package and version skew

**What goes wrong:** The `@microsoft/signalr` major version differs from the server's .NET version, or the presenter's machine lacks the .NET SDK or the right Node version. The dev machine used for this research has .NET SDK 10.0.402 state under `~/.dotnet` but `dotnet` is not on the shell `PATH`, so "runs in two commands" is not guaranteed even on the author's machine.

**Prevention:** Add a `global.json` (or a documented SDK version) and an `.nvmrc`/`engines` field. Match the `@microsoft/signalr` major to the target .NET major. In P1 verify `dotnet --version` and `node -v` and write them in the README.

**Phase:** P1.

### Pitfall 15: Unbounded in-memory notification history

**What goes wrong:** Storing every notification forever in a singleton list is a leak. The client list also grows without bound, and the page slows down. Neither matters for a demo, but the presenter's "spam 1,000 sends" stress test could make it noticeable.

**Prevention:** Cap the client list (for example 50). If the server keeps a history, cap it and use a thread-safe structure. Do not add history replay on connect unless the team wants it, because it adds scope.

**Phase:** P2/P5.

---

## Minor Pitfalls

### Pitfall 16: Hub route and endpoint ordering
`app.MapHub<NotificationHub>("/hubs/notifications")` must match the client URL exactly (case and leading slash). With minimal hosting, call `UseCors` before the hub is mapped. A 404 on negotiate usually means the route differs.

### Pitfall 17: Sending to `Clients.All` and expecting the sender to be excluded
Broadcast includes the sender's own tab. That is fine for the demo (the sender sees it arrive), but say so, or use `Clients.Others` deliberately. In a hub, `Caller` and `Others` exist; from `IHubContext` they do not.

### Pitfall 18: Toast library flooding and focus
Several toasts in a row hide the interesting one. Cap visible toasts and set auto-dismiss, because a 10-second task completing while three toasts are on screen is easy to miss on a projector.

### Pitfall 19: Missing connection status as a first-class UI element
If the status badge is added late, early bugs (CORS, wrong port, reconnect) are invisible. Add it in P1 and surface `connection.state`, the connection id, the username and the transport.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `SetIsOriginAllowed(_ => true).AllowCredentials()` | CORS error goes away instantly | Any site can make credentialed hub requests; the team copies it into real apps | Never. Use `WithOrigins` |
| Fake username in query string, no auth | No JWT complexity | Spoofable identity | Acceptable here; label it clearly in code and slides |
| Static / hub-field state | No DI wiring | Data loss, race conditions, wrong lesson about hub lifetime | Never. Use a singleton service |
| `connection-id -> user` dictionary | Easy to reason about | Breaks with multiple tabs and on reconnect | Never. Use `IUserIdProvider` and groups |
| In-memory queue and groups | No infra | Lost on restart, no scale-out | Acceptable by scope; state it in README |
| Removing StrictMode to hide duplicates | Duplicate toasts vanish | Hides a real cleanup bug | Only temporarily, with a TODO |
| `skipNegotiation: true` | Avoids a CORS preflight | Hides the negotiation lesson, breaks scale-out | Not for this demo |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `@microsoft/signalr` and React | Connection created per render, no cleanup | One connection per username, built and torn down in one effect |
| `@microsoft/signalr` auth/identity | Trying to send custom headers on WebSocket | Use a query-string value (the browser WebSocket API cannot set headers) |
| ASP.NET Core CORS and SignalR | Wildcard origin with credentials; `UseCors` after `MapHub` | Explicit origin, `AllowCredentials` only if needed, `UseCors` first |
| `IHubContext` and `BackgroundService` | Using `Context`, `Caller` or `HttpContext` from the worker | Capture the user in the job record, send via `Clients.User(...)` |
| Vite dev server and SignalR | Proxy without `ws: true` | Direct CORS, or proxy with `ws: true` |
| Scoped services and `BackgroundService` | Injecting scoped services into a singleton | Inject singletons, or create a scope with `IServiceScopeFactory` |

## Performance Traps

Scale is a handful of tabs, so none of these matter beyond the demo. They are listed only so the team knows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Group and connection state in process memory | State lost on restart; wrong on scale-out | Backplane (Redis) or Azure SignalR; out of scope | More than one server instance |
| Sequential single-consumer job loop | A second task waits behind the first | Start each job's delay as its own task | Two POSTs within 10 s |
| Unbounded client list or history | Slow render, memory growth | Cap the list | Hundreds of notifications |
| Default `MaximumReceiveMessageSize` (32 KB) | Connection aborted on a large payload | Keep payloads small | A pasted huge message |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting a client-provided `fromUser` or `username` | Impersonation (accepted for the demo) | Derive from `Context.UserIdentifier`; document as non-auth |
| Wide-open credentialed CORS | Cross-site hijack of a future authenticated version | Explicit `WithOrigins` |
| Anyone can join any group or broadcast | Abuse of the demo if exposed on a network | Bind to localhost only; do not expose it on a public network |
| Rendering notification text as HTML (`dangerouslySetInnerHTML`) | XSS via the send form, delivered to every tab | Render as text; React escapes by default |
| Token in query string (future JWT work) | Tokens in logs | Out of scope here; note in the JWT follow-up |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visible connection state | Team cannot tell if it is the demo or the network | Status badge with state, user and transport |
| Silent loss after reconnect | The audience thinks a notification was never sent | "Reconnected, you may have missed notifications" message |
| Unread badge that resets on every render or is not tied to the open panel | Confusing counts | Mark read on panel open; derive the count from data |
| No distinction between broadcast, targeted, group and task notifications | The three trigger styles blur together | Label each item with its kind and sender |
| Refresh clears the list | Surprise on stage | Say so in the README ("in-memory, per tab, resets on refresh") |

## "Looks Done But Isn't" Checklist

- [ ] **Connected status:** Often missing a failed-initial-start state. Verify by starting the client before the server, then starting the server.
- [ ] **Single connection per tab:** Often two in dev. Verify `OnConnectedAsync` logs exactly one per page load under StrictMode.
- [ ] **Toasts:** Often doubled. Verify one toast per message in dev.
- [ ] **Targeted:** Often works for one tab only. Verify two tabs for the same user both receive it, and a third user's tab does not.
- [ ] **Different users per tab:** Often broken by `localStorage`. Verify two tabs can be two different users.
- [ ] **Groups:** Often fail after reconnect. Verify by restarting the server while joined, then sending to the group.
- [ ] **Server restart recovery:** Often gives up after about 45 seconds of retries. Verify by keeping the server down for over a minute.
- [ ] **Task-complete:** Often goes to the wrong person or nobody. Verify user A's POST notifies only user A, in every tab of A, at about 10 s.
- [ ] **202 behavior:** Often secretly blocks. Verify the POST responds immediately.
- [ ] **Shutdown:** Often hangs. Verify Ctrl+C within a few seconds with a task pending.
- [ ] **Fresh clone:** Often depends on local state. Verify the README's two commands on a clean machine with the required SDK and Node versions.
- [ ] **Browser console:** Often has warnings the team ignores. Verify the console is clean in the demo.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| CORS misconfigured | LOW | Check the Network tab OPTIONS and negotiate responses, set an explicit origin, move `UseCors` before `MapHub` |
| Duplicate connections or handlers | LOW | Add cleanup (`off` and `stop`) to the effect, key the connection to the username |
| Identity mapping wrong | MEDIUM | Register `IUserIdProvider`, remove the connection-id dictionary, rebuild the connection on login |
| BackgroundService crashing the host | LOW | Wrap per-job work in try/catch, pass the stopping token |
| Groups lost after reconnect | LOW | Rejoin in `onreconnected` or in `OnConnectedAsync` from a store |
| Client stuck disconnected after outage | LOW | Custom retry policy that never returns null, plus a retry loop on initial start |
| Live-demo failure on stage | LOW | Keep a pre-recorded screen capture and a documented restart order (server first, then client) |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. CORS with credentials | P1 Skeleton | Fresh clone shows "Connected"; origin pinned; `UseCors` before `MapHub` |
| 2. StrictMode double connect | P1 Skeleton | One server connection per page load in dev; no "stopped during negotiation" error |
| 3. Stale closures, updater side effects | P2 Broadcast (list, toast), P5 (badge) | One toast per message; badge counts correctly |
| 4. Identity vs connection id | P3 Targeted | Two tabs, same user, both receive; other user does not |
| 5. Hub transience, DI lifetimes | P3 and P4 | State lives in singletons; worker uses a job record, not `HttpContext` |
| 6. Fragile BackgroundService | P4 Server-originated | Bad job does not stop the host; Ctrl+C is quick; two jobs overlap |
| 7. Reconnect, groups, initial start | P1 (initial retry), P5 (policy, rejoin) | Server restarted mid-demo; client recovers; groups work again |
| 8. Silent method-name mismatch | P2, enforced P3 and P4 | Strongly typed hub; shared constants; client log level visible |
| 9. WebSocket, proxy, transport | P1 Skeleton | Network tab shows a 101 upgrade; no long-poll fallback |
| 10. `localStorage` vs `sessionStorage` | P3 Targeted | Two tabs, two different users |
| 11. HMR and `dotnet watch` zombies | P1, P6 | No duplicate toasts after saving a file |
| 12. Client-trusted sender | P3, P6 | Sender from `Context.UserIdentifier`; slide notes the limitation |
| 13. Background-tab throttling | P5/P6 | Rehearse with both tabs visible |
| 14. SDK and version skew | P1 | README lists required versions; `dotnet --version` works |
| 15. Unbounded history | P2/P5 | Client list capped |

## Sources

- Microsoft Learn, ASP.NET Core SignalR Groups and users (HIGH): group membership is not preserved on reconnect, groups are in memory and lost on restart, user IDs and group names are case-sensitive, adding to a group twice is safe, groups are not a security feature. https://learn.microsoft.com/en-us/aspnet/core/signalr/groups
- Microsoft Learn, SignalR HubContext (HIGH): `IHubContext` is for sending only, no `Caller`, `Others` or `ConnectionId` outside a hub, and user-to-connection mapping advice. https://learn.microsoft.com/en-us/aspnet/core/signalr/hubcontext
- Microsoft Learn, SignalR configuration (HIGH): keep-alive 15 s, server timeout 30 s, handshake 15 s, recommended server timeout of at least double keep-alive, stateful reconnect opt-in (.NET 8+) with a 100,000-byte default buffer, default `MaximumReceiveMessageSize` of 32 KB, and `withCredentials` defaulting to `true`. https://learn.microsoft.com/en-us/aspnet/core/signalr/configuration
- Microsoft Learn, `WithStatefulReconnect` API reference (MEDIUM; prerelease documentation page). https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.signalr.client.hubconnectionbuilderhttpextensions.withstatefulreconnect
- Community guides on automatic reconnect and rejoining groups in `onreconnected`, for example https://code-maze.com/signalr-automatic-reconnect-option/ (MEDIUM).
- From established knowledge, not re-verified this session (MEDIUM): default automatic reconnect delays of 0, 2, 10 and 30 s; `BackgroundServiceExceptionBehavior.StopHost` default since .NET 6; React 18+ StrictMode effect double-invocation; the `X-SignalR-User-Agent` preflight trigger; Vite proxy `ws: true`; browsers being unable to set WebSocket headers.
- Local environment check: `dotnet` is not on the shell PATH, though `~/.dotnet` shows SDK 10.0.402 first-use state. Node is v22.23.2.

---
*Pitfalls research for: SignalR (ASP.NET Core) plus React real-time notification demo*
*Researched: 2026-10-26*
