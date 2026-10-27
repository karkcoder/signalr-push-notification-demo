# Roadmap: SignalR Notification Demo

## Overview

A teammate should be able to clone the repo, run two commands, open two browser tabs, and watch every kind of notification arrive live, then understand from the code why it works. The journey follows the order a viewer learns SignalR. First, a running server and React client that connect and show a broadcast arriving in every tab. Next, identity, so a notification can reach one user or one group. Then the server-originated case, where a POST returns 202 and a background worker notifies the poster about 10 seconds later. After that, reconnect and unread polish so the demo survives a server restart mid-presentation. Last, the README walkthrough and presentation script. Every phase ends in something demonstrable with two tabs.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Connection & Broadcast** - Fresh clone connects, shows live status, and a broadcast reaches every open tab
- [ ] **Phase 2: Identity, Targeted & Groups** - Fake per-tab username, send to one user or a group, debug panel
- [ ] **Phase 3: Server-Originated Task** - POST returns 202, a background worker notifies the poster about 10s later
- [ ] **Phase 4: Reconnect & Unread Polish** - Survives server restarts with groups restored, plus unread badge and manual reconnect
- [ ] **Phase 5: Walkthrough & Presentation** - Two-tab README walkthrough and a presentation script covering the demo and its limits

## Phase Details

### Phase 1: Connection & Broadcast
**Goal**: A teammate can start the server and client from a fresh clone, see a live "Connected" status, and watch a broadcast sent from one tab arrive as a toast and list entry in every open tab.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: CONN-01, CONN-02, CONN-03, CONN-04, BCST-01, BCST-02, BCST-03
**Success Criteria** (what must be TRUE):
  1. From a fresh clone, following the README setup (the stated .NET 10 and Node versions, the PATH note, then one command each for server and client), the client page shows "Connected".
  2. The connection status on screen visibly reflects connecting, connected, reconnecting, and disconnected, and a client started before the server moves to "Connected" on its own once the server comes up, with no page refresh.
  3. Sending a message from one tab shows exactly one toast and one newest-first list entry in every open tab, including the sender's, even in React dev mode (no duplicate connections or toasts).
  4. Every notification in the list and toast carries a kind label (broadcast now; the label set already covers user, group, and task for later phases).
**Plans**: TBD
**UI hint**: yes

### Phase 2: Identity, Targeted & Groups
**Goal**: Users can pick a fake username per tab and send notifications to one user or to a group, with only the intended recipients' tabs receiving them.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: TRGT-01, TRGT-02, TRGT-03, TRGT-04
**Success Criteria** (what must be TRUE):
  1. User can pick a username in a tab, and it is kept per tab (surviving a reload of that tab) so two tabs can be two different users.
  2. A message sent to a username reaches every tab of that user (two tabs, same name, both receive) and no tab of any other user.
  3. User can join and leave a group, and a message sent to the group reaches only tabs currently in it; after leaving, that tab stops receiving.
  4. A debug panel in each tab shows its connectionId, username, and joined groups, and updates as they change.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Server-Originated Task
**Goal**: Users can start a background task whose request returns immediately and whose "Task completed" notification arrives about 10 seconds later, only to the user who started it.
**Mode:** mvp
**Depends on**: Phase 2 (the completion must reach the posting user, which needs identity)
**Requirements**: TASK-01, TASK-02, TASK-03, TASK-04
**Success Criteria** (what must be TRUE):
  1. User can start a task, and the UI immediately shows a "task accepted" line, without waiting for the work to finish.
  2. About 10 seconds after starting, "Task completed" (labeled as a task notification) appears in the starting user's tabs only; other users' tabs receive nothing.
  3. Starting several tasks in quick succession makes each one complete about 10 seconds after its own start, not queued one after another.
  4. A task that fails is logged and the server keeps running, so later tasks still complete normally.
**Plans**: TBD
**UI hint**: yes

### Phase 4: Reconnect & Unread Polish
**Goal**: The demo survives a server restart mid-presentation with group delivery restored, and users can see how many notifications they have not read.
**Mode:** mvp
**Depends on**: Phase 2 (groups to re-join), Phase 1 (the receive path the badge counts)
**Requirements**: RSLN-01, RSLN-02, RSLN-03, RSLN-04
**Success Criteria** (what must be TRUE):
  1. After the server is stopped and restarted, including being down for over a minute, the client reconnects by itself with no page refresh and no retry limit.
  2. After that reconnect, a message sent to a group the tab had joined is received again, without the user re-joining by hand.
  3. An unread badge shows how many new notifications arrived, grows as more arrive, and mark-all-read clears it to zero.
  4. A manual reconnect button is available and brings a disconnected client back to "Connected".
**Plans**: TBD
**UI hint**: yes

### Phase 5: Walkthrough & Presentation
**Goal**: Teammates can follow the README to try every notification type with two tabs, and the author can present the demo live from a script that covers what it shows and where it stops.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: DOCS-01, DOCS-02
**Success Criteria** (what must be TRUE):
  1. The README has a numbered two-tab walkthrough covering broadcast, user, group, and task notifications, with the expected result stated at each step and a server-restart test at the end.
  2. A reader who follows the README steps from a fresh clone reaches every stated expected result without outside help.
  3. A short presentation script or slides walk the demo in the same order as the code, and cover its limits (no delivery guarantee, spoofable fake identity, in-memory state lost on restart, scale-out needing a backplane, JWT auth as the follow-up).
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Connection & Broadcast | 0/TBD | Not started | - |
| 2. Identity, Targeted & Groups | 0/TBD | Not started | - |
| 3. Server-Originated Task | 0/TBD | Not started | - |
| 4. Reconnect & Unread Polish | 0/TBD | Not started | - |
| 5. Walkthrough & Presentation | 0/TBD | Not started | - |
