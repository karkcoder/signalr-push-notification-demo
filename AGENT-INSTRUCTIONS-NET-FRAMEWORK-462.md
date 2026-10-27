# Agent instructions: port the SignalR notification demo to .NET Framework 4.6.2

You are an AI coding agent. Your job is to build a **.NET Framework 4.6.2 version of this demo's server** using **ASP.NET SignalR 2.x**, and to adapt the React client to talk to it. The behaviour must match the existing ASP.NET Core version exactly.

Read this whole file before you change anything. Work through the steps in order. When something here conflicts with what you observe in the repo, trust the repo and say so in your final report.

## 1. Goal

Deliver a second, working implementation next to the original:

- `server-net462/`: ASP.NET (.NET Framework 4.6.2) + OWIN + ASP.NET SignalR 2.4.3 + Web API 2
- `client-net462/`: a copy of `client/` with only the connection code changed to the legacy SignalR 2.x JavaScript client

The original `server/` and `client/` must stay untouched and keep working.

## 2. Hard constraints

1. **Target framework is .NET Framework 4.6.2.** Not 4.7, not 4.8, not .NET Core, not .NET 5+. The `.csproj` must say `<TargetFrameworkVersion>v4.6.2</TargetFrameworkVersion>`.
2. **Use ASP.NET SignalR 2.x** (`Microsoft.AspNet.SignalR`, version 2.4.3). Do **not** use `Microsoft.AspNetCore.SignalR`, it cannot run on .NET Framework.
3. **Do not edit `server/` or `client/`.** Copy, then change the copy.
4. **Do not invent features.** No database, no real authentication, no extra endpoints, no UI redesign.
5. **Keep the fake login.** The username is only `?username=...`. Do not add JWT or cookies.
6. **Windows is required to build.** You need Visual Studio 2019/2022 (or Build Tools) with the **.NET Framework 4.6.2 targeting pack**, and IIS Express. If you are not on Windows, or cannot build, **stop and report that** instead of writing code you cannot compile.
7. **Never claim something works unless you ran it.** If a check could not be run, say "not run" in the report.

## 3. Source of truth (read these first)

| File | What it tells you |
|---|---|
| `server/NotificationHub.cs` | Hub methods, validation, group name rules |
| `server/Notifications.cs` | The payload, the typed client interface, user id provider, the 10-second task worker |
| `server/Program.cs` | CORS origins, route names, the `202` endpoint |
| `client/src/useHub.ts` | Connection lifecycle: StrictMode safety, retry, reconnect, group re-join, de-duplication |
| `client/src/App.tsx` | How the UI calls the hub and reads results |
| `client/src/types.ts` | The payload type and constants |
| `ARCHITECTURE.md` | Why each piece exists |
| `TUTORIAL-NET-FRAMEWORK-462.md` | Human-oriented direction for this same port (**untested**, verify before trusting) |
| `README.md` | The 8-step manual walkthrough you must be able to pass |

## 4. The contract you must preserve

The React `App.tsx` should work with **no changes**. That means the server must expose exactly this.

### 4.1 Endpoints

| Thing | Value |
|---|---|
| Server URL | `http://localhost:5080` (set the IIS Express Project URL to this) |
| Hub | name `NotificationHub`, JS name `notificationHub`, connected at `/signalr` |
| Task endpoint | `POST /api/tasks` with header `X-Username: <name>` |
| Task success | HTTP **202**, body `{ "taskId": "<6 chars>" }` |
| Task missing username | HTTP **400**, body `{ "error": "Send your username in the X-Username header." }` |
| Client origins (CORS) | `http://localhost:5173` and `http://127.0.0.1:5173`, explicit, no wildcard |

### 4.2 Hub methods (client calls server)

| Method | Arguments | Behaviour |
|---|---|---|
| `SendBroadcast` | `message` | To everyone including the sender. `kind = "broadcast"` |
| `SendToUser` | `username`, `message` | To every connection of that user. `kind = "user"` |
| `JoinGroup` | `group` | Add this connection to the group |
| `LeaveGroup` | `group` | Remove it |
| `SendToGroup` | `group`, `message` | To current members. `kind = "group"`, `group` set |

### 4.3 The one event (server calls client)

Event `receiveNotification` (C# method `ReceiveNotification`), payload **camelCase** JSON:

```json
{ "id": "32 hex chars", "kind": "broadcast|user|group|task", "message": "text",
  "from": "alice or null", "group": "team or null", "sentAt": "ISO-8601 timestamp" }
```

### 4.4 Rules that must be identical

- **Names are normalised**: trim and lower-case, for usernames (`"Alice"` and `"alice"` are the same user) and for group names.
- **Message validation on the server**: trim; reject empty; reject longer than **280** characters (exactly 280 is allowed). Throw `HubException` with these messages: `Message is empty.` and `Message is longer than 280 characters.`
- **Other errors**: `Pick a username to send to.` (empty target user), `Pick a group name.` (empty group), `Group name is too long.` (over 40 characters).
- **`from`** is the caller's normalised username, or `null` if the caller has none.
- **The task**: after the 202, wait **10 seconds**, then send `kind = "task"`, `message = "Task completed (<taskId>)"`, `from = "server"` to **only the user who posted**. Two quick tasks must both complete about 10 seconds after their own start (not 10 and 20).
- **One failing task must not crash the app.**

## 5. Target architecture (mapping)

| Core version | Build this instead |
|---|---|
| `Program.cs` minimal hosting | OWIN `Startup.cs` with `[assembly: OwinStartup(...)]` |
| `AddSignalR` + `MapHub` | `app.Map("/signalr", map => { map.UseCors(policy); map.RunSignalR(new HubConfiguration()); });` |
| `Hub<INotificationClient>` | `Hub<INotificationClient>` (supported in 2.x) |
| `QueryStringUserIdProvider : IUserIdProvider` | `Microsoft.AspNet.SignalR.IUserIdProvider`, registered with `GlobalHost.DependencyResolver.Register(typeof(IUserIdProvider), ...)`, reading `request.QueryString["username"]` |
| Injected `IHubContext<NotificationHub, INotificationClient>` | `GlobalHost.ConnectionManager.GetHubContext<NotificationHub, INotificationClient>()` |
| Minimal API `MapPost` | Web API 2 `ApiController`, attribute routing, `app.UseWebApi(config)` |
| `Channel<T>` + `BackgroundService` | `HostingEnvironment.QueueBackgroundWorkItem(async ct => ...)` |
| camelCase JSON by default | PascalCase by default: register a `JsonSerializer` with `CamelCasePropertyNamesContractResolver` on `GlobalHost.DependencyResolver` |
| `Groups.AddToGroupAsync` | `Groups.Add(Context.ConnectionId, name)` |
| Caller name from `Context.UserIdentifier` | `Context.QueryString["username"]`, normalised |

NuGet packages to install (pin these versions):

```powershell
Install-Package Microsoft.AspNet.SignalR -Version 2.4.3
Install-Package Microsoft.Owin.Host.SystemWeb -Version 4.2.2
Install-Package Microsoft.Owin.Cors -Version 4.2.2
Install-Package Microsoft.AspNet.WebApi.Owin -Version 5.2.9
```

If NuGet reports a version conflict, resolve it by upgrading to the highest compatible version and **record the result in your report**. Do not downgrade the target framework.

## 6. Work plan (do in order, commit after each step)

### Step 1: Project skeleton
1. Create `server-net462/` as an **ASP.NET Web Application (.NET Framework)**, template **Empty**, framework **4.6.2**.
2. Set Project Url to `http://localhost:5080/` (Properties > Web) and create the virtual directory.
3. Install the packages above.
4. Add a `.gitignore` entry for `bin/`, `obj/`, `packages/`, `.vs/`.
5. **Check:** it builds, and `http://localhost:5080/signalr/hubs` (after Step 2) is reachable.

### Step 2: Startup, CORS, JSON
Create `Startup.cs`. In this order: register the user id provider; register the camelCase serializer; `app.Map("/signalr", ...)` with CORS and `RunSignalR`; then `app.UseCors(policy)` and `app.UseWebApi(config)` for the HTTP API. The CORS policy lists the two explicit origins, allows any header and the methods GET and POST, and sets `SupportsCredentials = true`.
**Check:** `GET http://localhost:5080/signalr/hubs` returns generated JavaScript, not a 404.

### Step 3: Models, client interface, user id provider
Port `AppNotification`, `INotificationClient` and `QueryStringUserIdProvider` (with a `Normalize` helper) from `server/Notifications.cs`.
**Check:** it builds.

### Step 4: The hub
Port `NotificationHub` from `server/NotificationHub.cs` using the mapping in section 5, keeping every validation rule from section 4.4.
**Check:** a connected client can broadcast (see Step 7 tests).

### Step 5: The task endpoint and worker
Add `TasksController` (`POST api/tasks`) that validates the header, returns `Accepted` with the task id, and queues the work with `QueueBackgroundWorkItem`. Inside the work item: `Task.Delay(10s, ct)`, then push through `GetHubContext<NotificationHub, INotificationClient>().Clients.User(username)`. Wrap in try/catch and log (`Trace.TraceError`).
**Check:** `curl -i -X POST http://localhost:5080/api/tasks -H "X-Username: bob"` returns 202 immediately.

### Step 6: Adapt the client
1. Copy `client/` to `client-net462/`.
2. Replace the Core client package with the legacy one: `npm uninstall @microsoft/signalr`, then `npm install jquery@3.7.1 signalr@2.4.3`.
3. In `src/main.tsx`, put these three lines at the top, in this order, before any other import that uses SignalR:
   ```ts
   import jquery from "jquery";
   (window as any).$ = (window as any).jQuery = jquery;
   import "signalr";
   ```
   If you get `jQuery is not defined`, this order is the cause.
4. Rewrite **only** `src/useHub.ts` with the legacy API: `$.hubConnection(SERVER, { qs: { username } })`, `createHubProxy("notificationHub")`, `proxy.on("receiveNotification", ...)`, `proxy.invoke("sendBroadcast", ...)`, and the `reconnecting` / `reconnected` / `disconnected` callbacks. Keep the **same return shape** so `App.tsx` needs no change.
5. Keep these behaviours from the original hook (they exist for reasons, see `ARCHITECTURE.md`):
   - one connection per username; build it in an effect keyed on the username
   - defer `start()` by one tick and cancel it in cleanup (React StrictMode runs the effect twice in development)
   - retry the first `start()` every 2 seconds
   - the legacy client gives up after its disconnect timeout and fires `disconnected`; call `start()` again after a short delay so it never gives up
   - re-join remembered groups after every successful start
   - ignore a repeated notification id; reuse the id as the toast id
6. Leave `App.tsx`, `types.ts` and CSS unchanged, unless a change is unavoidable. If you must change one, list the exact reason in the report.

**Check:** `npm run build` and `npm run lint` pass in `client-net462/`.

### Step 7: Verify (this is the acceptance test)
Run both apps (server from Visual Studio or `iisexpress`, client with `npm run dev`) and prove each item in section 7. Automate what you can.

### Step 8: Document
Add a short `server-net462/README.md`: prerequisites, the exact run commands, ports, and any deviations you made.

## 7. Acceptance criteria

All of these must pass. Mark each as **PASS**, **FAIL** or **NOT RUN** in your report, with evidence.

**Server and contract**
1. Builds on .NET Framework 4.6.2 with no errors.
2. Broadcast reaches every connection, including a user with two tabs.
3. `SendToUser` reaches only that user, and `Alice` and `alice` are the same user.
4. Group messages reach only current members; after `LeaveGroup` the member gets nothing. `Team` and `team` are the same group.
5. Empty message is rejected; 281 characters is rejected; exactly 280 is accepted. The client receives a `HubException` message.
6. `POST /api/tasks` returns **202 in under 1 second**; without `X-Username` it returns **400**.
7. About 10 seconds after the POST, `Task completed (...)` reaches **only the poster**.
8. Two rapid POSTs both complete about 10 seconds after their own start.
9. The payload fields arrive in camelCase (`id`, `kind`, `message`, `from`, `group`, `sentAt`).
10. CORS: `http://127.0.0.1:5173` is allowed with credentials; an unknown origin such as `http://evil.example` is not.

**Client (in a real browser, two separate tabs as `alice` and `bob`)**
11. Both tabs reach "Connected" in development mode (StrictMode on).
12. A broadcast gives **exactly one toast and one list row per tab**.
13. The unread badge counts up and "Mark all read" clears it.
14. Direct message, group message and the background task work as described in `README.md` steps 3 to 6.
15. Stop and restart the server: the pill shows "Reconnecting…", then both tabs reconnect **by themselves**, and a group message sent afterwards still reaches the other tab (groups were re-joined).
16. Open a tab **before** the server is running: it shows "Connecting…" and connects on its own once the server starts, with no reload.

## 8. Known pitfalls (read before debugging)

- **Payload fields undefined in the browser** means JSON is still PascalCase. Register the camelCase serializer (Step 2).
- **`Clients.User(...)` reaches nobody** means the `IUserIdProvider` is not registered, or the connection has no `username` in its query string.
- **CORS errors** usually mean the origin is missing from the policy, or `UseCors` is not applied to both the `/signalr` branch and the Web API branch.
- **`QueueBackgroundWorkItem` work is lost when IIS recycles the app pool.** That is accepted for this demo; mention it, do not "fix" it with a database.
- **Do not use `dotnet watch`-style auto-restart during acceptance tests**: a restart drops every connection and group.
- **Do not mix SignalR families.** A `@microsoft/signalr` client cannot connect to this server, and the legacy `signalr` client cannot connect to the Core server.
- **The client and server must agree on case-insensitive names** (`notificationHub`, `receiveNotification`, `sendBroadcast`). A mismatch fails silently, so turn on client logging while testing (`connection.logging = true`).

## 9. Out of scope

Authentication, persistence, a durable queue, scale-out/backplane, new UI, migrating to a newer .NET, changing the original `server/` or `client/`, Web Push.

## 10. Final report (send this back)

Reply with:

1. **Summary** in 3 to 5 sentences.
2. **Acceptance table**: items 1 to 16, each PASS / FAIL / NOT RUN, with a one-line piece of evidence (command output, test name or screenshot path).
3. **Deviations**: anything that differs from this document, and why. Include final NuGet versions if you changed them.
4. **Open problems**: anything broken or unverified.
5. **How to run it**: the exact commands, in order.
6. **Files**: the list of files you created or changed.

Be direct about failures. A short honest report is more useful than a long optimistic one.
