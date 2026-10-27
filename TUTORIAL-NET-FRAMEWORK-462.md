# Tutorial: run this demo's server on .NET Framework 4.6.2

A step-by-step direction guide. It tells you **what to install, what changes and where to look**. It is not a finished migration.

> **Status: untested.** This was written from the package metadata on NuGet and npm and from the code in this repo. It has not been run on Windows or Visual Studio. Treat the code snippets as starting points and expect to fix small things.

## 0. Read this first

This repo's server uses **ASP.NET Core SignalR**, which does not run on .NET Framework. On .NET Framework 4.6.2 you use the older, separate library, **ASP.NET SignalR 2.x** (NuGet package `Microsoft.AspNet.SignalR`, latest 2.4.3). It covers the same ideas (hubs, groups, users) but the API and the wire protocol are different.

Two consequences:

1. **The server is rewritten**, not just retargeted. See section 3.
2. **The React client must change too.** The `@microsoft/signalr` npm package only talks to ASP.NET Core SignalR. For SignalR 2.x you use the legacy `signalr` npm package, which needs jQuery. See section 6.

If you are free to choose, newer .NET is simpler. This guide is for when you must stay on .NET Framework 4.6.2. Check Microsoft's lifecycle page for how long 4.6.2 is supported.

### What maps to what

| This repo (ASP.NET Core) | .NET Framework 4.6.2 (ASP.NET SignalR 2.x) |
|---|---|
| `Program.cs` minimal hosting | OWIN `Startup.cs` |
| `builder.Services.AddSignalR()` + `MapHub` | `app.MapSignalR()` (or `RunSignalR` inside a `Map`) |
| `Hub<INotificationClient>` | `Hub<T>` (also exists in 2.x) |
| `IUserIdProvider` (Core) | `Microsoft.AspNet.SignalR.IUserIdProvider`, registered on `GlobalHost.DependencyResolver` |
| `IHubContext<Hub, T>` injected | `GlobalHost.ConnectionManager.GetHubContext<THub, TClient>()` |
| Minimal API `MapPost("/api/tasks")` | Web API 2 `ApiController` |
| `Channel<T>` + `BackgroundService` | `HostingEnvironment.QueueBackgroundWorkItem` (4.5.2 and later) |
| `AddCors` + `UseCors` | `Microsoft.Owin.Cors` |
| JSON camelCase by default | PascalCase by default: configure it (step 5) |
| `@microsoft/signalr` client | `signalr` + `jquery` client |

## 1. Prerequisites

1. **Windows** with **Visual Studio 2019 or 2022**.
2. In the Visual Studio Installer, tick the workload **ASP.NET and web development**.
3. Under **Individual components**, tick **.NET Framework 4.6.2 targeting pack**. Newer Visual Studio versions do not install it by default. Without it, 4.6.2 will not appear in the framework dropdown.
4. **Node 20.19+ or 22.12+** (for the React client).
5. Clone this repo so you can reuse `client/`:

   ```bash
   git clone https://github.com/karkcoder/signalr-push-notification-demo.git
   ```

## 2. Create the server project

1. Visual Studio, **File > New > Project**, choose **ASP.NET Web Application (.NET Framework)** (C#).
2. Name it `NotificationDemo` and put it next to the existing folders, for example `signalr-push-notification-demo/server-framework/`.
3. **Framework: .NET Framework 4.6.2.**
4. Template: **Empty**. Leave every checkbox (MVC, Web API) unticked. You add what you need by NuGet.
5. Pin the URL so the React client's setting stays the same: right-click the project, **Properties > Web**, set **Project Url** to `http://localhost:5080/`, then click **Create Virtual Directory**.

## 3. Install the NuGet packages

Open **Tools > NuGet Package Manager > Package Manager Console** and run:

```powershell
Install-Package Microsoft.AspNet.SignalR -Version 2.4.3
Install-Package Microsoft.Owin.Host.SystemWeb -Version 4.2.2
Install-Package Microsoft.Owin.Cors -Version 4.2.2
Install-Package Microsoft.AspNet.WebApi.Owin -Version 5.2.9
```

What each one is for:

| Package | Why |
|---|---|
| `Microsoft.AspNet.SignalR` | The hub library (pulls in the server pieces and the JS files) |
| `Microsoft.Owin.Host.SystemWeb` | Lets OWIN `Startup` run inside IIS and IIS Express |
| `Microsoft.Owin.Cors` | CORS, because the React app is on another origin (`:5173`) |
| `Microsoft.AspNet.WebApi.Owin` | The `POST /api/tasks` endpoint |

The versions above were the newest stable ones found on NuGet. SignalR 2.4.3 targets .NET Framework 4.5, so it works on 4.6.2.

## 4. Write the server (the pieces that matter)

Use the files in `server/` of this repo as the reference for **behaviour**: the hub methods, validation rules, normalisation of names and the 280-character limit. Recreate each file in the new project.

### 4.1 `Startup.cs` (replaces `Program.cs`)

Things it must do, in this order:

1. Mark it as the OWIN startup class with `[assembly: OwinStartup(typeof(YourNamespace.Startup))]`.
2. Register your user id provider:
   `GlobalHost.DependencyResolver.Register(typeof(IUserIdProvider), () => new QueryStringUserIdProvider());`
3. Make JSON camelCase so the React code can keep reading `id`, `kind`, `message`, `sentAt`:
   register a `JsonSerializer` with `CamelCasePropertyNamesContractResolver` on `GlobalHost.DependencyResolver`. Without this, the browser receives `Id`, `Kind` and so on.
4. Map SignalR on `/signalr` with its own CORS policy:
   `app.Map("/signalr", map => { map.UseCors(policy); map.RunSignalR(new HubConfiguration()); });`
5. After that, add CORS again for the rest of the pipeline and then Web API:
   `app.UseCors(policy); app.UseWebApi(config);` where `config.MapHttpAttributeRoutes();` is called first.

The CORS policy should list the same two origins as the Core version (`http://localhost:5173` and `http://127.0.0.1:5173`), allow any header and the methods you use, and not use a wildcard origin.

### 4.2 The hub

Create `NotificationHub : Hub<INotificationClient>` with the same five methods: `SendBroadcast`, `SendToUser`, `JoinGroup`, `LeaveGroup`, `SendToGroup`.

Differences from the Core version:

- Methods return `void` or `Task`; use `Groups.Add` / `Groups.Remove` (not `AddToGroupAsync`).
- `Clients.All`, `Clients.User(id)` and `Clients.Group(name)` exist in 2.x with the same meaning.
- Read the caller's name from the connection query string: `Context.QueryString["username"]`.
- `HubException` exists in `Microsoft.AspNet.SignalR` and its message reaches the client.
- Keep the **server-side** validation (trim, empty check, 280 limit). The UI limit does not protect a direct hub call.

### 4.3 The user id provider

Implement `IUserIdProvider.GetUserId(IRequest request)` and return the normalised (trimmed, lower-case) value of `request.QueryString["username"]`. It is still a fake login, for the same reason as before.

### 4.4 The background task (no Channel, no BackgroundService)

There is no `BackgroundService` on .NET Framework. The closest simple tool is `HostingEnvironment.QueueBackgroundWorkItem`:

1. A Web API `TasksController` with `[HttpPost] [Route("api/tasks")]`.
2. Read the username from the `X-Username` header, reject a missing one with `400`.
3. Create a short task id, call `QueueBackgroundWorkItem(async ct => { ... })`, and return `Content(HttpStatusCode.Accepted, new { taskId = id })` right away.
4. Inside the work item: `await Task.Delay(TimeSpan.FromSeconds(10), ct)`, then
   `GlobalHost.ConnectionManager.GetHubContext<NotificationHub, INotificationClient>().Clients.User(username).ReceiveNotification(...)`.
5. Wrap the body in `try/catch` so one failing job cannot take the worker down.

Each queued item runs on its own, so you get the "two quick tasks both finish after about 10 seconds" behaviour without extra code.

Know the limits: IIS can recycle the app pool and drop pending work (it only gets a short grace period on shutdown), and the work is not durable. For anything that must not be lost, use a real queue.

## 5. Build and run the server

1. Press **F5** (or **Ctrl+F5**). It starts under IIS Express on `http://localhost:5080`.
2. Check the hub is alive by opening `http://localhost:5080/signalr/hubs` in a browser. You should see a block of generated JavaScript. A 404 means SignalR is not mapped.
3. Check the endpoint is alive: from a terminal,
   `curl -i -X POST http://localhost:5080/api/tasks -H "X-Username: alice"` should answer `202`.

## 6. Change the React client for SignalR 2.x

Only the connection code changes. `App.tsx`, the CSS and the UI stay as they are, because `useHub` keeps returning the same things.

1. In `client/`, replace the Core client with the legacy one:

   ```bash
   npm uninstall @microsoft/signalr
   npm install jquery@3.7.1 signalr@2.4.3
   ```

2. Load jQuery **before** the `signalr` package, because the legacy client looks for `window.jQuery` when it loads. Put this at the top of `client/src/main.tsx`, in this order:

   ```ts
   import jquery from "jquery";
   (window as any).$ = (window as any).jQuery = jquery;
   import "signalr";
   ```

   Because ES imports run in source order, the global is set before `signalr` evaluates. If you ever see `jQuery is not defined`, this ordering is the cause.

3. Rewrite `client/src/useHub.ts` using the legacy API:

   | Core client (current) | SignalR 2.x client |
   |---|---|
   | `new HubConnectionBuilder().withUrl(url).build()` | `$.hubConnection(SERVER, { qs: { username } })` |
   | (hub is the URL) | `connection.createHubProxy("notificationHub")` |
   | `connection.on("ReceiveNotification", fn)` | `proxy.on("receiveNotification", fn)` |
   | `connection.invoke("SendBroadcast", text)` | `proxy.invoke("sendBroadcast", text)` |
   | `withAutomaticReconnect(...)` | built in, plus a `connection.disconnected(...)` handler that calls `start()` again after a delay |
   | `onreconnecting` / `onreconnected` / `onclose` | `connection.reconnecting` / `reconnected` / `disconnected` |
   | `connection.start()` | `connection.start()` (a jQuery promise; `await` works) |

4. Keep the same ideas as the current hook:
   - Build the connection in an effect keyed on the username, and defer `start()` by one tick so React StrictMode does not open two connections.
   - Retry the first `start()` yourself every 2 seconds.
   - In SignalR 2.x the legacy client stops reconnecting after its disconnect timeout (about 30 seconds by default) and fires `disconnected`. Call `start()` again from that handler to keep the "never give up" behaviour.
   - Re-join the remembered groups after **every** successful start. A fresh `start()` is a new connection and its groups are gone. (A transport-level reconnect keeps the connection id, but re-joining is harmless and simpler.)
   - Keep ignoring a repeated notification id.

5. In `types.ts`, `SERVER` stays `http://localhost:5080`. `HUB_PATH` is no longer used because the legacy client uses `/signalr` by default.

## 7. Run it end to end

1. Start the server from Visual Studio (F5).
2. Start the client: `npm --prefix client run dev`.
3. Open `http://localhost:5173` in two tabs and follow the walkthrough in [README.md](README.md).

Quick checks that tell you where a problem is:

| Symptom | Likely cause |
|---|---|
| `/signalr/hubs` returns 404 | `MapSignalR`/`RunSignalR` not reached, or `Microsoft.Owin.Host.SystemWeb` missing |
| Stuck on "Connecting…" and the browser console shows a CORS error | Origin not in the policy, or `UseCors` runs after SignalR |
| Messages arrive but fields are `undefined` | JSON still PascalCase: the camelCase resolver was not registered |
| `Clients.User(...)` reaches nobody | `IUserIdProvider` not registered, or the `username` query string is missing |
| `jQuery is not defined` | `signalr` imported before jQuery was put on `window` |
| Task completes but never arrives | The work item threw (check the Output window), or the username in the header does not match the connection's |
| Pending tasks vanish | IIS recycled the app pool |

## 8. Things that behave differently from the Core version

- **No `Channel`/`BackgroundService`**: background work is not durable under IIS.
- **Wire protocol**: the two SignalR families are not compatible. Mixing a Core client with a 2.x server (or the reverse) fails at connect time.
- **Fewer transports**: 2.x uses WebSockets (needs IIS 8+ with the WebSocket feature on), Server-Sent Events and long polling.
- **No built-in DI for hubs**: hubs are created by SignalR's own dependency resolver, so shared state belongs in static or singleton classes you register yourself.
- **Maintenance**: ASP.NET SignalR 2.x is in maintenance mode. New features land in ASP.NET Core SignalR.

## 9. Where to look when stuck

- Microsoft Learn, "ASP.NET SignalR" (the 2.x documentation, separate from the Core docs).
- The Core code in this repo for the intended behaviour: [`server/`](server/) and [`client/src/useHub.ts`](client/src/useHub.ts).
- The design reasoning, which still applies: [ARCHITECTURE.md](ARCHITECTURE.md).
