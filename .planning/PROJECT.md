# SignalR Notification Demo

## What This Is

A demo of real-time in-app notifications built with ASP.NET Core SignalR and a React client. It is made for the author's team to learn from, and it shows three ways notifications get triggered: broadcast to everyone, targeted to a user or group, and server-originated (a POST that finishes work in the background and notifies the poster 10 seconds later).

## Core Value

A teammate can open two browser tabs and watch every notification type arrive live, and understand from the code why it works.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Hub, CORS and React client connect, with visible connection status
- [ ] Broadcast: a send form pushes a notification to every open tab (toast + list)
- [ ] Targeted: fake username login; send to one user or to a group (join/leave)
- [ ] Server-originated: `POST /api/tasks` returns 202, a background worker waits ~10s, then sends "Task completed" to the posting user
- [ ] Auto-reconnect handling and an unread badge
- [ ] README with a "try it with two tabs" walkthrough
- [ ] A short live-presentation script or slides for the team

### Out of Scope

- Browser Web Push / service workers / VAPID — this demo is in-app only
- Mobile push (FCM/APNs) — not what the team needs to learn here
- Real authentication (JWT over SignalR) — separate topic, parked as a research question
- Database persistence — notifications are in memory only, to keep the demo small
- Automated tests — not requested; "done" is a local run plus a presentation

## Context

- Audience is the author's team, who are learning SignalR; clarity of code beats completeness.
- Exploration notes: `.planning/notes/signalr-notification-demo-decisions.md`
- Open follow-up: `.planning/research/questions.md` (JWT auth over SignalR)
- Greenfield: the directory was empty when the project started.

## Constraints

- **Tech stack**: C# / ASP.NET Core (.NET 8+) with SignalR, React (Vite) with `@microsoft/signalr` — stated by the author
- **Simplicity**: fake username login, in-memory state, one repo with `server/` and `client/` — keeps the demo readable
- **Delivery**: must run locally in two commands plus two tabs — it is shown live

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| In-app SignalR, not Web Push | Author chose real-time in-app notifications | — Pending |
| Fake username login | Avoids JWT/SignalR complexity in a learning demo | — Pending |
| 202 + BackgroundService for the 10s task | Shows `IHubContext` and why long work leaves the request | — Pending |
| Identity (targeted) before server-originated | Task-complete must reach the posting user | — Pending |
| No tests, presentation included | Author's definition of done | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-26 after initialization*
