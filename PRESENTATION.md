# Presentation script: real-time notifications with SignalR

About 20 minutes. Set up before the room fills.

## Before you start

- Start the server **first**, then the client. Use `dotnet run`, not `dotnet watch`.
- Two browser windows **side by side**, both visible on the projector, each on `http://localhost:5173`. Set one to `alice` and one to `bob`.
- Have the code open in tabs: `NotificationHub.cs`, `Notifications.cs`, `useHub.ts`.
- Keep a short screen recording of the full walkthrough as a fallback.

## 1. The problem (2 min)

"HTTP is request and response: the server can only speak when asked. How does a server tell a browser something happened?" Polling is wasteful, SignalR keeps one connection open (WebSocket, with fallbacks) and the server pushes.

Say clearly what this is not: not browser Web Push. Nothing arrives when the tab is closed.

## 2. Connect (2 min)

Show the green **Connected** pill and the two different `connectionId`s in the Debug card. "One connection per tab."
Open `Program.cs`: `AddSignalR`, `MapHub`, and the CORS policy. Mention why credentials force explicit origins.

## 3. Broadcast (3 min)

Send from alice. Both windows react at once, one toast and one list row each.
Open `NotificationHub.SendBroadcast`: one line, `Clients.All`. Point out the typed hub (`INotificationClient`): a misspelled event name would be a compile error, not a silent failure.
Point at the unread badge and *Mark all read*.

## 4. Targeted (4 min)

Send to `bob` only. Then open a third tab as `bob`: both bob tabs receive it. "A user can have many connections."
Open `QueryStringUserIdProvider`. "This is why `Clients.User` works, and why the demo login is fake: anyone can claim any name."
Tenant keys: both windows join the tenant `team`, send to it, then leave in one window and send again.

## 5. Server-originated (4 min)

In bob's window press **Start task**. The "accepted" line appears immediately: show the `202`.
While waiting, open `TaskWorker`:

- the request does not wait; it drops a job on a `Channel` and returns
- the worker uses `IHubContext` because it is outside a hub: there is no `Caller`
- the job carries the user key because `HttpContext` is gone by the time it runs
- jobs run concurrently, otherwise a second task would take 20 seconds
- an exception is caught per job, otherwise it would stop the whole host

About 10 seconds later "Task completed" appears in bob's window only.

## 6. When things break (3 min)

Stop the server live. The pill goes to **Reconnecting…** and sending is disabled. Start it again: both windows recover on their own.
Send a tenant message: it still arrives. Open `useHub.ts` and show `rejoinTenants`: "tenant membership belongs to a connection id, and a reconnect gets a new one."

## 7. Limits and where to go next (2 min)

- No delivery guarantee: what was sent while disconnected is gone (hence the "you may have missed notifications" notice).
- The user key is spoofable. The next step is JWT authentication over SignalR (the token travels in the query string for WebSockets).
- In-memory and single instance. Several servers need a Redis backplane (or Azure SignalR Service) and a load balancer that passes WebSockets through. Without it, a broadcast on server A never reaches a tab on server B. The steps are in `SCALING-REDIS.md`.

## If something goes wrong live

- **Red console errors while the server is down**: expected, the client is retrying.
- **Stuck on "Connecting…"**: the server is not running, or you opened the page on a different origin than `localhost:5173` / `127.0.0.1:5173`.
- **Port in use**: another process holds 5080 or 5173; stop it, or change the ports together (see README).
- **`dotnet: command not found`**: see the PATH note in the README.
