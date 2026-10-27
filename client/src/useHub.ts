import { useCallback, useEffect, useRef, useState } from "react";
import { HubConnection, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { toast } from "sonner";
import { HUB_PATH, LIST_CAP, SERVER, kindLabel } from "./types";
import type { AppNotification, Status } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useHub(username: string) {
  const [status, setStatus] = useState<Status>("connecting");
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [missed, setMissed] = useState(false);
  const [groups, setGroups] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0); // bumping this builds a brand new connection

  const connRef = useRef<HubConnection | null>(null);
  const groupsRef = useRef<string[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  // One connection per username. The effect is written to survive React StrictMode, which
  // runs mount -> cleanup -> mount in development: start() is deferred by one macrotask and
  // cancelled in cleanup, so only the second mount ever opens a real connection.
  useEffect(() => {
    let cancelled = false;
    const url = `${SERVER}${HUB_PATH}?username=${encodeURIComponent(username)}`;
    const connection = new HubConnectionBuilder()
      .withUrl(url)
      // The default policy gives up after ~40s. A demo should keep trying forever.
      .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (ctx) => Math.min(1000 * 2 ** ctx.previousRetryCount, 10000) })
      .configureLogging(LogLevel.Information)
      .build();
    connRef.current = connection;

    // The server's one outbound event. Every kind of notification arrives here.
    connection.on("ReceiveNotification", (n: AppNotification) => {
      if (seenRef.current.has(n.id)) return; // a repeated id is ignored
      seenRef.current.add(n.id);
      setItems((prev) => [n, ...prev].slice(0, LIST_CAP));
      setUnread((u) => u + 1);
      // Reusing the notification id as the toast id means a stray duplicate can't stack two toasts.
      toast(kindLabel(n.kind), { id: n.id, description: n.message, duration: 5000 });
    });

    // Group membership belongs to a connection id, and a reconnect gets a new one.
    const rejoinGroups = async () => {
      for (const g of groupsRef.current) {
        try { await connection.invoke("JoinGroup", g); } catch { /* shown on next user action */ }
      }
    };

    connection.onreconnecting(() => setStatus("reconnecting"));
    connection.onreconnected(async () => {
      setConnectionId(connection.connectionId ?? null);
      await rejoinGroups();
      setMissed(true);
      setStatus("connected");
    });
    connection.onclose(() => { if (!cancelled) setStatus("disconnected"); });

    const run = async () => {
      setStatus("connecting");
      // withAutomaticReconnect does not cover a failed first start(), so retry it ourselves.
      while (!cancelled) {
        try { await connection.start(); break; } catch { if (!cancelled) await sleep(2000); }
      }
      if (cancelled) return;
      setConnectionId(connection.connectionId ?? null);
      await rejoinGroups();
      setStatus("connected");
    };

    let started: Promise<void> = Promise.resolve();
    const timer = setTimeout(() => { started = run(); }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      connection.off("ReceiveNotification");
      // Wait for any in-flight start() to settle before stopping, or SignalR logs an error.
      void started.finally(() => connection.stop());
    };
  }, [username, attempt]);

  const invoke = useCallback(async (method: string, ...args: unknown[]) => {
    const c = connRef.current;
    if (!c) throw new Error("Not connected.");
    await c.invoke(method, ...args);
  }, []);

  const join = useCallback(async (group: string) => {
    const g = group.trim().toLowerCase();
    await invoke("JoinGroup", g);
    if (!groupsRef.current.includes(g)) {
      groupsRef.current = [...groupsRef.current, g];
      setGroups(groupsRef.current);
    }
  }, [invoke]);

  const leave = useCallback(async (group: string) => {
    await invoke("LeaveGroup", group);
    groupsRef.current = groupsRef.current.filter((x) => x !== group);
    setGroups(groupsRef.current);
  }, [invoke]);

  const markAllRead = useCallback(() => { setUnread(0); setMissed(false); }, []);
  const reconnect = useCallback(() => setAttempt((a) => a + 1), []);

  return { status, connectionId, items, unread, missed, groups, invoke, join, leave, markAllRead, reconnect };
}
