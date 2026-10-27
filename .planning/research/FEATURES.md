# Feature Research

**Domain:** Real-time in-app notifications (ASP.NET Core SignalR + React), small teaching demo
**Researched:** 2026-10-26
**Confidence:** MEDIUM-HIGH (feature landscape from established domain knowledge of notification UIs and SignalR behavior; no external sources fetched this pass, so SignalR-specific behavior claims should be spot-checked against official docs in STACK/ARCHITECTURE research)

Framing: "users" here are two audiences. (1) The teammate watching the demo with two tabs open, who expects the UI to behave like a real notification center. (2) The teammate reading the code afterward, who expects each SignalR concept to be isolated and legible. Table stakes means "the demo feels broken or teaches the wrong thing without it." Differentiators are only worth building if they make a SignalR concept visible.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Visible connection status indicator (Connecting / Connected / Reconnecting / Disconnected) | Every real-time app shows it; without it the demo cannot show reconnect and failures look like bugs | LOW | Drive from `HubConnection` lifecycle (`onreconnecting`, `onreconnected`, `onclose`, `state`). Single small component. |
| Live notification list (newest first) with title/message/timestamp/type | Core of any notification center; a toast alone vanishes and cannot be shown to the room | LOW | In-memory React state (reducer or `useState`). Keep a shared `Notification` shape: id, kind, message, sentAt, from. |
| Toast on arrival | The "real-time" moment is the pop; this is what the audience watches for | LOW | Lightweight toast (library or ~30 lines of custom). Auto-dismiss. Do not make it block the list. |
| Broadcast send form (to everyone) | Planned scope; simplest SignalR example (`Clients.All`) | LOW | Form posts via hub method invoke (`connection.invoke`) or REST; pick one and be consistent. |
| Targeted send to a single user | Planned scope; shows `Clients.User` plus `IUserIdProvider` | MEDIUM | Needs fake login first. Recipient field + message. |
| Targeted send to a group, with join/leave | Planned scope; shows `Groups.AddToGroupAsync` / `Clients.Group` | MEDIUM | Group membership is per connection, so join/leave must be hub methods called by the client. Show current groups in the UI. |
| Fake username login (identity) | Prerequisite for targeting and for "notify the poster" | LOW-MEDIUM | Username sent as access_token query or custom header; server `IUserIdProvider` maps it to `UserIdentifier`. Show "Logged in as X". Explicitly labeled not-real-auth. |
| Server-originated notification: POST returns 202, worker waits ~10s, "Task completed" to the poster | Planned scope; the key teaching moment for `IHubContext` and why long work leaves the request | MEDIUM | `Channel<T>` + `BackgroundService`, `IHubContext<NotificationHub>`, `Clients.User(poster)`. The POST must carry the user identity (same fake login). |
| Show task lifecycle in UI (e.g. "Task accepted, id ...", then completion notification) | Without feedback the 10s gap looks like nothing happened | LOW | Optional immediate local "pending" line from the 202 response; completion arrives via SignalR, not polling. |
| Unread badge/count | Planned scope; universal notification-center affordance | LOW | Counter incremented on receive, cleared on opening the panel or "mark all read". Keep client-side. |
| Mark all read / clear (basic) | A badge that can never reset feels broken | LOW | Reset count on panel open; optionally a "Clear" button. |
| Automatic reconnect with user feedback | Planned scope; networks drop and the demo is live | LOW-MEDIUM | `withAutomaticReconnect()`; status shown in UI. Default retry delays are 0, 2, 10, 30 s then gives up, so decide what happens after `onclose` (see below). |
| Re-establish group membership after reconnect | Real gotcha: connection ID changes on reconnect, groups are lost, so the demo silently stops delivering group messages | MEDIUM | Re-join groups in `onreconnected` from client-held group list (and re-establish identity). This is a prime teaching moment, not an edge case. |
| Manual "reconnect" after automatic reconnect gives up | Once automatic retries are exhausted the connection is `Disconnected` and stays so | LOW | A button calling `start()` again, shown when state is Disconnected. |
| CORS and negotiation configured for the Vite origin | Without it nothing connects; first failure every newcomer hits | LOW | `AllowCredentials` with explicit origin (no wildcard) is required for SignalR. Document in README. |
| Two-tab try-it walkthrough in README | Stated Core Value; the demo is only as good as its repro steps | LOW | Numbered steps with expected result per tab. Include the reconnect test (stop/start server). |
| Live presentation script or slides | Stated deliverable | LOW | Not a software feature, but a tracked requirement. Order demo steps to match the code reading order. |
| Run in two commands locally | Stated constraint | LOW | `dotnet run` in `server/`, `npm run dev` in `client/`. Fixed ports documented. |

### Differentiators (Competitive Advantage)

For a teaching demo, "competitive advantage" means "makes a SignalR concept visible to the audience." Pick only those that serve the Core Value (two tabs, watch it live, understand why).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Notification type/kind styling (broadcast vs user vs group vs task) with a source badge | Lets the room see at a glance which delivery path produced each message | LOW | Server stamps `kind` field; client maps to color/label. High teaching value for tiny cost. Recommended. |
| Connection ID and current user/groups shown in a small debug panel | Makes connection identity vs user identity vs group membership concrete (one user, many connections) | LOW | Display `connection.connectionId` plus username plus joined groups. Strongly recommended; explains the reconnect-loses-groups gotcha. |
| Same user in two tabs both receive targeted/task notifications | Demonstrates that `Clients.User` fans out to all of a user's connections | LOW | Falls out of `IUserIdProvider` for free; just call it out in the walkthrough. |
| Server-side log line / on-screen "what happened" trace (e.g. "hub: Clients.Group('devs') -> 2 connections") | Ties UI event to server code for the code-reading audience | MEDIUM | Console logging via `ILogger` is cheap (LOW); an in-UI event log is the MEDIUM part. Do console logs; UI log optional. |
| Task progress with fake steps (e.g. 25/50/75/100%) before completion | Shows multiple server-to-client pushes from one background job | MEDIUM | Nice but changes the specified "wait 10s then notify" shape. Defer unless presentation needs more drama. |
| Typed hub (`Hub<INotificationClient>`) with strongly typed client interface | Idiomatic, removes magic strings, great for readers | LOW-MEDIUM | Server side only; recommended as a code-clarity feature. Mirror method names as constants on the client. |
| Simulated disconnect button (client-side `stop()` or server kill instructions) | Lets the presenter trigger the reconnect story on cue without unplugging anything | LOW | Button calls `connection.stop()` then "Reconnect"; true auto-reconnect needs the server restart or network drop, so document `Ctrl+C` / restart server in script. |
| Users-online list (presence) | Lets the sender pick a real recipient; makes targeted send feel real | MEDIUM | Needs connect/disconnect tracking in a `ConcurrentDictionary`, broadcast of presence changes. Useful for the "send to user" dropdown; otherwise free-text username is fine. |
| Missed-notification catch-up after reconnect (small in-memory buffer replayed on reconnect) | Illustrates SignalR's delivery guarantees (none by default) | HIGH | Compelling lesson but crosses the "no persistence" line and expands scope. Treat as stretch; see anti-features. |
| .NET 8 stateful reconnect | Buffers messages across brief drops, official solution to the catch-up gap | MEDIUM | Opt-in on both ends in recent versions; flag for STACK research to confirm availability and API in the pinned versions. Optional "stretch" teaching point. |
| Dark/light or polished styling | Impresses room, no teaching value | LOW | Minimal CSS only. Not a priority. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Browser Web Push / service workers / VAPID | "Push notification" in the repo name implies it | Different technology, different permissions model; already declared out of scope; would dwarf the SignalR lesson | State clearly in README: in-app only, link to Web Push as a follow-up topic |
| Mobile push (FCM/APNs) | Same naming confusion | Needs device tokens, provider accounts; out of scope | Mention in README as separate topic |
| Real authentication (JWT over SignalR, `[Authorize]` hub) | Feels "production-correct" | Access-token-via-query-string plumbing distracts from SignalR basics; already parked as research question | Fake username login with `IUserIdProvider`; call out clearly that this is NOT secure, so anyone can claim any name |
| Database persistence / notification history across restarts | "Real systems store notifications" | Adds EF/storage setup, schema, migrations; contradicts the in-memory decision | In-memory list on the client; note persistence as a "next steps" slide |
| Server-side read/unread state, mark-read sync across tabs | Real notification centers sync read state | Needs per-user server state and more hub methods; hides the main lesson | Per-tab client-side unread count; mention sync as a future step |
| Automated tests | Good engineering practice | Explicitly out of scope; "done" is a local run plus a presentation | Manual walkthrough checklist in README |
| Redis backplane / scale-out / multi-server | Natural next question about SignalR | Requires Redis, Docker, multiple instances; no value for a two-tab demo | One slide: "what changes when you scale out" |
| Azure SignalR Service | Common production hosting choice | Cloud account, cost, config | Same single slide as above |
| Notification preferences, mute, do-not-disturb, digest/batching | Standard in production notification products | Product features unrelated to transport; large surface area | Omit; mention that the transport is what is being demoed |
| Per-notification actions, deep links, rich content, attachments | Looks polished | UI scope creep with zero SignalR learning | Plain text message plus kind badge |
| Notification TTL/expiry, pagination, infinite scroll | Needed at scale | Meaningless for dozens of in-memory items | Cap list at ~50 items client-side if needed |
| Polling fallback and "compare to polling" feature | Great teaching comparison | Separate feature set; dilutes the push story | One slide on transports (WebSockets, SSE, long polling) which SignalR falls back across automatically |
| Delivery receipts / ack / retries / guaranteed delivery | Reliability is a natural worry | Needs durable state and an ack protocol; at odds with in-memory-only | State plainly: SignalR does not guarantee delivery; stateful reconnect optional (see differentiators) |
| Rate limiting, validation, XSS-hardened rendering beyond React defaults | Security hygiene | Out of scope for a demo, but one trap matters: never render message as raw HTML | Render as text via React (default); do not use `dangerouslySetInnerHTML` |
| Multiple hubs / complex group hierarchies / roles | "Realistic" structure | Hides the single-hub mental model | One `NotificationHub`, a handful of free-text group names |

## Feature Dependencies

```
Hub + CORS + React connection (status indicator)
    └──requires──> (everything below)

Fake username login (IUserIdProvider)
    ├──requires──> Connection (identity sent on negotiate/connect)
    ├──enables──> Targeted send to user
    ├──enables──> Group join/leave + group send
    └──enables──> Server-originated task notification (must reach the poster)

Broadcast send
    └──requires──> Connection + notification list + toast

Notification list + toast
    └──enables──> Unread badge (counter updates from the same receive handler)

Server-originated task
    ├──requires──> Fake username login (poster identity on POST)
    ├──requires──> Channel + BackgroundService + IHubContext
    └──enhanced by──> Task lifecycle UI (202 acknowledgment)

Automatic reconnect
    ├──requires──> Connection status indicator
    └──requires──> Group re-join on reconnect (otherwise group notifications silently stop)

Debug panel (connectionId/user/groups) ──enhances──> Reconnect lesson and targeted lesson
Users-online (presence) ──enhances──> Targeted send
Stateful reconnect / catch-up buffer ──conflicts──> "In-memory, small, simple" constraint (opt-in stretch only)
```

### Dependency Notes

- **Targeted and server-originated require fake login:** `Clients.User(...)` only works if `IUserIdProvider` returns a stable id per connection; the task worker needs the poster's id from the POST (same mechanism or a header). Matches the planned phase order (identity before server-originated).
- **Unread badge requires the list/toast receive path:** build it on the same handler so one event updates list, toast, and count; do it last or alongside reconnect polish as planned.
- **Reconnect requires group re-join:** connection ID changes after an automatic reconnect, so server-side group membership is gone. This is a correctness dependency, not polish. Re-joining must be in `onreconnected`.
- **Identity on reconnect:** with query-string username identity the new connection renegotiates with the same username, so identity is preserved without extra work; verify when planning.
- **Server-originated POST needs CORS too:** the REST endpoint is called cross-origin from Vite; the same CORS policy must cover it (separate from the hub's CORS requirements for credentials).
- **Stateful reconnect conflicts with simplicity:** treat as optional demonstration, never as part of the core.

## MVP Definition

### Launch With (v1)

Maps directly to the planned scope plus the minimum glue that makes it correct.

- [ ] Hub, CORS, React connect with visible connection status
- [ ] Notification list + toast with kind/source styling (broadcast / user / group / task)
- [ ] Broadcast send form
- [ ] Fake username login and `IUserIdProvider`
- [ ] Targeted send to user; group join/leave and send to group
- [ ] `POST /api/tasks` returns 202, background worker waits ~10s, "Task completed" sent to the poster, with a pending line in the UI after the 202
- [ ] Automatic reconnect with status feedback, group re-join on reconnect, manual reconnect button when disconnected
- [ ] Unread badge with reset on open / mark all read
- [ ] Debug panel (connectionId, user, joined groups)
- [ ] README two-tab walkthrough and a presentation script/slides

### Add After Validation (v1.x)

- [ ] Typed hub interface (`Hub<INotificationClient>`) if not already done in the first pass; cheap readability win
- [ ] Users-online (presence) list to drive the recipient dropdown, if presenter finds free-text usernames clumsy
- [ ] Simulated disconnect button for reliable on-cue reconnect demo
- [ ] Task progress steps, only if the 10s wait feels dull in rehearsal

### Future Consideration (v2+)

- [ ] .NET stateful reconnect / catch-up buffer to teach delivery guarantees
- [ ] Real JWT authentication over SignalR (already parked in `.planning/research/questions.md`)
- [ ] Persistence and server-side read state
- [ ] Backplane / scale-out discussion beyond a single slide

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Connection + status indicator | HIGH | LOW | P1 |
| Notification list + toast | HIGH | LOW | P1 |
| Broadcast | HIGH | LOW | P1 |
| Fake login + IUserIdProvider | HIGH | MEDIUM | P1 |
| Targeted user send | HIGH | MEDIUM | P1 |
| Group join/leave + send | HIGH | MEDIUM | P1 |
| Server-originated task (202 + worker) | HIGH | MEDIUM | P1 |
| Auto reconnect + status | HIGH | LOW | P1 |
| Group re-join on reconnect | HIGH | MEDIUM | P1 |
| Unread badge + reset | MEDIUM | LOW | P1 |
| README two-tab walkthrough | HIGH | LOW | P1 |
| Presentation script/slides | HIGH | LOW | P1 |
| Kind/source styling | MEDIUM | LOW | P1 (cheap, high teaching value) |
| Debug panel (connId/user/groups) | MEDIUM | LOW | P2 |
| Task pending line after 202 | MEDIUM | LOW | P1 (needed so the 10s gap is understood) |
| Typed hub | MEDIUM | LOW | P2 |
| Manual reconnect button | MEDIUM | LOW | P2 |
| Users-online presence | MEDIUM | MEDIUM | P3 |
| Simulated disconnect button | MEDIUM | LOW | P3 |
| Task progress steps | LOW | MEDIUM | P3 |
| Stateful reconnect / catch-up | LOW (for this team) | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Comparable Systems Analysis

| Feature | Production notification centers (e.g. GitHub, Slack, Novu in-app inbox) | Typical SignalR tutorials/samples (chat, stock ticker, MS Learn notification samples) | Our Approach |
|---------|--------------------------------------------------------------------------|-------------------------------------------------------------------------------------|--------------|
| Unread badge | Yes, server-synced | Rare | Client-side count only |
| Persistence/history | Yes | No | None (in-memory) |
| Toast on arrival | Yes | Sometimes | Yes |
| Targeted vs broadcast | Yes | Broadcast mostly; users/groups in chat samples | All three trigger styles |
| Server-originated (job completion) | Yes | Rarely shown | Core scenario (202 + BackgroundService) |
| Reconnect UX | Yes (silent or banner) | Often absent | Explicit status + group re-join |
| Preferences/channels | Yes | No | Out of scope |
| Delivery guarantees | Yes (persisted, retried) | None | Explicit non-goal; taught as a limitation |

Typical SignalR samples stop at "broadcast to all" chat. This demo's niche is the server-originated, identity-targeted path plus honest reconnect behavior, which is what the team will most likely need.

## Sources

- Project context: `/home/firestorm/source/push_notification_demo/.planning/PROJECT.md` and `.planning/notes/signalr-notification-demo-decisions.md` (HIGH, authoritative for scope)
- Domain knowledge of SignalR client/server behavior (connection ID changes on reconnect, groups per-connection, default reconnect delays 0/2/10/30s, `Clients.User` requiring `IUserIdProvider`, credentialed CORS requirement) (MEDIUM; established but not re-verified against live docs in this pass; confirm in STACK/ARCHITECTURE research and Microsoft Learn SignalR docs)
- General notification-center UX conventions (toast, list, unread badge, mark-all-read) as seen in common products (MEDIUM; informal survey from knowledge, no specific URLs fetched)

---
*Feature research for: real-time in-app notifications with SignalR + React (teaching demo)*
*Researched: 2026-10-26*
