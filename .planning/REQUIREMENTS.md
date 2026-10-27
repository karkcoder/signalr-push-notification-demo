# Requirements: SignalR Notification Demo

**Defined:** 2026-10-26
**Core Value:** A teammate can open two browser tabs and watch every notification type arrive live, and understand from the code why it works.

## v1 Requirements

### Connection

- [ ] **CONN-01**: Fresh clone runs with two commands and shows "Connected" in the client
- [ ] **CONN-02**: User sees live connection status (connecting, connected, reconnecting, disconnected)
- [ ] **CONN-03**: Client keeps retrying if the server starts after the client
- [ ] **CONN-04**: README states the .NET 10 / Node versions and the PATH note

### Broadcast

- [ ] **BCST-01**: User can send a message that every open tab receives
- [ ] **BCST-02**: Each notification appears as a toast and in a newest-first list
- [ ] **BCST-03**: Notifications show a kind label (broadcast, user, group, task)

### Targeted

- [ ] **TRGT-01**: User can pick a username, kept per tab so two tabs can be two users
- [ ] **TRGT-02**: User can send to one username, and only that user's tabs receive it
- [ ] **TRGT-03**: User can join and leave a group, and send to a group's members only
- [ ] **TRGT-04**: A debug panel shows connectionId, username and joined groups

### Server-originated

- [ ] **TASK-01**: User can start a task, and the request returns immediately with a "task accepted" line
- [ ] **TASK-02**: About 10 seconds later, only the poster's tabs get "Task completed"
- [ ] **TASK-03**: Several quick tasks each finish about 10 seconds after their own start
- [ ] **TASK-04**: One failing task does not stop the server

### Resilience

- [ ] **RSLN-01**: After a server restart the client reconnects, with no retry limit
- [ ] **RSLN-02**: After reconnecting, group messages work again because the client re-joins its groups
- [ ] **RSLN-03**: An unread badge counts new notifications, and mark-all-read clears it
- [ ] **RSLN-04**: A manual reconnect button is available

### Delivery

- [ ] **DOCS-01**: README has a numbered two-tab walkthrough, including the restart test
- [ ] **DOCS-02**: A short presentation script or slides cover the demo and its limits

## v2 Requirements

### Extras

- **EXTR-01**: Users-online list
- **EXTR-02**: Simulated-disconnect button
- **EXTR-03**: Task progress steps

## Out of Scope

| Feature | Reason |
|---------|--------|
| Browser Web Push / service workers | Demo is in-app only |
| Mobile push (FCM/APNs) | Not what the team needs to learn here |
| JWT auth over SignalR | Separate topic, parked in research questions |
| Persistence / database | In-memory keeps the demo small |
| Stateful reconnect / catch-up buffer | Group behavior unverified; conflicts with in-memory simplicity |
| Scale-out backplane | One slide in the presentation only |
| Automated tests | Not requested; done is a local run plus a presentation |

## Decisions Carried From Research

- Notification payload field is `kind`; the connection query parameter is `username`
- Task channel is bounded
- The sender sees their own broadcast toast (single handler)
- CORS uses an explicit origin with credentials
- The client re-joins groups on reconnect

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONN-01 | Phase 1 | Pending |
| CONN-02 | Phase 1 | Pending |
| CONN-03 | Phase 1 | Pending |
| CONN-04 | Phase 1 | Pending |
| BCST-01 | Phase 1 | Pending |
| BCST-02 | Phase 1 | Pending |
| BCST-03 | Phase 1 | Pending |
| TRGT-01 | Phase 2 | Pending |
| TRGT-02 | Phase 2 | Pending |
| TRGT-03 | Phase 2 | Pending |
| TRGT-04 | Phase 2 | Pending |
| TASK-01 | Phase 3 | Pending |
| TASK-02 | Phase 3 | Pending |
| TASK-03 | Phase 3 | Pending |
| TASK-04 | Phase 3 | Pending |
| RSLN-01 | Phase 4 | Pending |
| RSLN-02 | Phase 4 | Pending |
| RSLN-03 | Phase 4 | Pending |
| RSLN-04 | Phase 4 | Pending |
| DOCS-01 | Phase 5 | Pending |
| DOCS-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 21 total (corrected from 19: CONN 4, BCST 3, TRGT 4, TASK 4, RSLN 4, DOCS 2)
- Mapped to phases: 21
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-26*
*Last updated: 2026-10-26 after roadmap creation (traceability filled, v1 count corrected to 21)*
