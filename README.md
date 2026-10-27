# SignalR notification demo

Real-time **in-app** notifications with an ASP.NET Core SignalR server and a React client. It shows three ways a notification gets triggered:

1. **Broadcast**: one tab sends, every open tab receives.
2. **Targeted**: send to one user key, or to a tenant.
3. **Server-originated**: a `POST` returns `202` immediately, and about 10 seconds later the server pushes "Task completed" to the user who started it.

This is not browser Web Push (no service worker, nothing when the tab is closed). Everything is in memory and the "login" is a fake user key, so it is a learning demo, not a template for production.

## Requirements

- **.NET 10 SDK** (`dotnet --version` should print `10.x`)
- **Node 20.19+ or 22.12+** (Vite 8 requirement)

If `dotnet` is installed but not on your PATH (as it can be after the install script puts it in `~/.dotnet`):

```bash
export DOTNET_ROOT=$HOME/.dotnet
export PATH=$PATH:$HOME/.dotnet
```

## Run it (two commands, two terminals)

```bash
# terminal 1: server on http://localhost:5080
dotnet run --project server

# terminal 2: client on http://localhost:5173 (first time only: npm --prefix client install)
npm --prefix client run dev
```

Open **http://localhost:5173** (use `localhost`, though `127.0.0.1:5173` is also allowed by CORS).

Use `dotnet run`, not `dotnet watch`: a watch restart drops every connection and tenant membership.

The browser console will show red `ERR_CONNECTION_REFUSED` and SignalR errors while the server is down. They are expected: the client is retrying.

## Try it with two tabs

Open the page in **two tabs** (a new tab, not a duplicate: each tab keeps its own user key in `sessionStorage`).

1. **Connected.** Both tabs show a green "Connected" pill. In the Debug card, compare the two `connectionId`s.
2. **User keys.** In tab 1 type `alice` and press *Set key*. In tab 2 type `bob`.
3. **Broadcast.** In tab 1 choose *Everyone*, type a message, press *Send broadcast*. Both tabs show one toast and one list row, labelled *Broadcast*. The unread badge counts up in the tab you are not typing in; *Mark all read* clears it.
4. **Direct message.** In tab 1 choose *One user*, enter `bob`, send. Only bob's tab receives it. Open a third tab, set its name to `bob` too, and send again: both bob tabs receive it (a user can have several connections).
5. **Tenants.** In both tabs, type `team` under *Tenants* and press *Join*. In tab 1 choose *A tenant*, enter `team`, send. Only members receive it. *Leave* in tab 2 and send again: tab 2 gets nothing.
6. **Server-originated task.** In bob's tab press *Start task*. "Task accepted" appears at once (the POST returned `202`). About 10 seconds later a *Task* notification appears, in bob's tabs only. Press it twice quickly: both finish about 10 seconds after their own start.
7. **Restart test.** Stop the server (Ctrl+C). The pill turns to "Reconnecting…" and sending is disabled. Start it again: both tabs reconnect on their own and a "you may have missed notifications" notice appears. Send a tenant message from tab 1: tab 2 still gets it, because the client re-joined `team` automatically.
8. **Server not up yet.** Stop the server, open a new tab: it shows "Connecting…" with a hint, then connects by itself once you start the server.

## How it works

```
React tab ──WebSocket──►  NotificationHub  ──►  Clients.All / User / Group
    │                                                  ▲
    └──POST /api/tasks──► TaskQueue ──► TaskWorker ────┘   (IHubContext, after ~10s)
```

| Piece | File | Teaches |
|---|---|---|
| Hub | `server/NotificationHub.cs` | Client-to-server calls, `Clients.All/User/Group`, server-side validation |
| Identity | `server/Notifications.cs` (`QueryStringUserIdProvider`) | Why `Clients.User` needs an `IUserIdProvider` |
| Worker | `server/Notifications.cs` (`TaskQueue`, `TaskWorker`) | `IHubContext`, `Channel<T>`, `BackgroundService`, why work leaves the request |
| Wiring | `server/Program.cs` | CORS with credentials, hub mapping, the `202` endpoint |
| Connection hook | `client/src/useHub.ts` | StrictMode-safe lifecycle, retry, reconnect, re-joining tenant keys |
| UI | `client/src/App.tsx` | One `ReceiveNotification` handler feeding list, toast and unread count |

Things worth reading in the code:

- Every notification, whoever triggered it, arrives through the **same** `ReceiveNotification` event with a `kind` field.
- **Tenant membership is per connection.** A tenant key is a SignalR group under the hood. A reconnect gets a new `connectionId` and loses its memberships, so `useHub.ts` re-joins them.
- The hub is **transient** (a new instance per call), so it holds no state. The worker captures the user key in the job because `HttpContext` is gone by then.
- The worker runs jobs **concurrently**; a plain loop would make the second task finish at 20 seconds.
- Reconnect uses a **never-give-up** policy; SignalR's default stops after about 40 seconds.
- CORS: credentials require explicit origins, so `AllowAnyOrigin` would not work.

## Limits (say these out loud when presenting)

- No delivery guarantee: anything sent while a client is disconnected is lost.
- The user key is spoofable by design. Real apps authenticate (for example JWT) and read the user id from the token.
- State is in memory: a server restart forgets queued tasks, and one server instance only. Several instances need a backplane (Redis or Azure SignalR Service).

## Ports

Server `5080`, client `5173` (`strictPort`, so Vite fails instead of moving to a port the CORS policy would reject). To change them, update `server/Properties/launchSettings.json`, `clientOrigins` in `server/Program.cs`, `SERVER` in `client/src/types.ts`, and `client/vite.config.ts` together.
