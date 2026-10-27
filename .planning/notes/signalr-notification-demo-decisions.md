---
title: SignalR notification demo - decisions
date: 2026-10-26
context: /gsd-explore session; audience is the team (learning demo)
---

# Goal
Demo of real-time in-app notifications for team learning. Not browser Web Push, not mobile push.

# Stack
- Server: ASP.NET Core (.NET 8+) with SignalR
- Client: React (Vite) with `@microsoft/signalr`

# Scope (all three trigger styles)
1. Broadcast: send form -> `Clients.All` -> toasts + list in every open tab
2. Targeted: fake username login, custom `IUserIdProvider`, send to user and to groups
3. Server-originated: `POST /api/tasks` returns 202; a background worker sleeps ~10s, then pushes
   "task completed" to the user who posted, via `IHubContext<NotificationHub>`

# Defaults chosen
- Fake username login, no real auth (JWT over SignalR is a separate topic)
- In-memory only, no database
- One repo: `server/` and `client/`

# Phases (draft)
1. Skeleton: hub, CORS, React connects and shows status
2. Broadcast
3. Targeted (user identity, groups)
4. Server-originated (202 + BackgroundService/channel + IHubContext)
5. Polish: auto-reconnect, unread badge, README with two-tab walkthrough

# Gotcha to teach
Long work must not run in the request; the notification must reach the posting user's connection(s), hence identity (phase 3) before phase 4.
