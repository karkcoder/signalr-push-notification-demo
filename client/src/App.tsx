import { useState } from "react";
import type { FormEvent } from "react";
import { Toaster } from "sonner";
import { useHub } from "./useHub";
import { MAX_LENGTH, SERVER, kindLabel } from "./types";
import type { Status } from "./types";
import "./App.css";

const STATUS_TEXT: Record<Status, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected",
};

// sessionStorage (not localStorage) so every tab can be a different user.
function loadName(): string {
  try { return sessionStorage.getItem("userKey") ?? ""; } catch { return ""; }
}
function saveName(name: string) {
  try { sessionStorage.setItem("userKey", name); } catch { /* storage unavailable */ }
}

// The server rejects bad input with a HubException; SignalR wraps its text in a long prefix.
function reason(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  const i = text.indexOf("HubException:");
  return i >= 0 ? text.slice(i + "HubException:".length).trim() : text;
}

type Target = "all" | "user" | "tenant";

export default function App() {
  const [userKey, setUserKey] = useState(loadName);
  const [keyInput, setKeyInput] = useState(userKey);
  const hub = useHub(userKey);

  const [target, setTarget] = useState<Target>("all");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const [tenantInput, setTenantInput] = useState("");
  const [tenantError, setTenantError] = useState("");

  const [pending, setPending] = useState<string[]>([]);
  const [taskError, setTaskError] = useState("");

  const connected = hub.status === "connected";

  function login(e: FormEvent) {
    e.preventDefault();
    const name = keyInput.trim().toLowerCase();
    saveName(name);
    setUserKey(name); // a new user key means a new connection
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!connected || !text || sending) return;
    setSending(true);
    setError("");
    try {
      if (target === "all") await hub.invoke("SendBroadcast", text);
      else if (target === "user") await hub.invoke("SendToUser", recipient, text);
      else await hub.invoke("SendToTenant", recipient, text);
      setMessage("");
    } catch (err) {
      setError(`Message not sent. ${reason(err)}`);
    } finally {
      setSending(false);
    }
  }

  async function tenantAction(action: "join" | "leave") {
    setTenantError("");
    try {
      if (action === "join") await hub.join(tenantInput);
      else await hub.leave(tenantInput.trim().toLowerCase());
      setTenantInput("");
    } catch (err) {
      setTenantError(reason(err));
    }
  }

  // Server-originated: the POST returns 202 immediately; "Task completed" arrives ~10s later over SignalR.
  async function startTask() {
    setTaskError("");
    try {
      const res = await fetch(`${SERVER}/api/tasks`, { method: "POST", headers: { "X-User-Key": userKey } });
      if (res.status !== 202) throw new Error((await res.json().catch(() => null))?.error ?? `Server answered ${res.status}`);
      const { taskId } = await res.json();
      setPending((p) => [...p, taskId]);
      setTimeout(() => setPending((p) => p.filter((id) => id !== taskId)), 15000);
    } catch (err) {
      setTaskError(reason(err));
    }
  }

  const targetPlaceholder = target === "user" ? "user key" : "tenant key";

  return (
    <main>
      <Toaster position="top-right" visibleToasts={3} closeButton />
      <header>
        <h1>SignalR notifications</h1>
        <div className="header-right">
          <span className={`pill ${hub.status}`} role="status">
            <span className="dot" aria-hidden="true" />
            {STATUS_TEXT[hub.status]}
          </span>
          {hub.unread > 0 && <span className="badge" aria-label={`${hub.unread} unread`}>{hub.unread}</span>}
        </div>
      </header>

      {hub.status === "connecting" && (
        <p className="hint">Can't reach the server yet. Retrying every 2 seconds. Is it running on {SERVER}?</p>
      )}
      {hub.status === "disconnected" && (
        <p className="hint">
          Connection closed. <button onClick={hub.reconnect}>Reconnect</button>
        </p>
      )}
      {hub.missed && <p className="hint">You were disconnected for a moment, so you may have missed notifications.</p>}

      <section className="card">
        <h2>Who are you?</h2>
        <form onSubmit={login} className="row">
          <label htmlFor="name">User key (demo only, not real login)</label>
          <input id="name" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="alice" maxLength={30} />
          <button type="submit">Set key</button>
        </form>
        <p className="muted">{userKey ? <>Your user key in this tab is <strong>{userKey}</strong>.</> : "No user key yet: you can still receive broadcasts."}</p>
      </section>

      <section className="card">
        <h2>Send a notification</h2>
        <form onSubmit={send}>
          <div className="radios" role="radiogroup" aria-label="Send to">
            {(["all", "user", "tenant"] as Target[]).map((t) => (
              <label key={t}>
                <input type="radio" name="target" checked={target === t} onChange={() => setTarget(t)} />
                {t === "all" ? "Everyone" : t === "user" ? "One user" : "A tenant"}
              </label>
            ))}
          </div>
          {target !== "all" && (
            <input aria-label={targetPlaceholder} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={targetPlaceholder} />
          )}
          <label htmlFor="msg">Message</label>
          <div className="row">
            <input id="msg" value={message} maxLength={MAX_LENGTH} onChange={(e) => setMessage(e.target.value)} placeholder="Hello team" />
            <button type="submit" className="primary" disabled={!connected || !message.trim() || sending}>
              {sending ? "Sending…" : target === "all" ? "Send broadcast" : "Send"}
            </button>
          </div>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        {!connected && <p className="muted">Sending is off until the status says Connected.</p>}
      </section>

      <section className="card">
        <h2>Tenants</h2>
        <div className="row">
          <input aria-label="Tenant key" value={tenantInput} onChange={(e) => setTenantInput(e.target.value)} placeholder="tenant key" />
          <button onClick={() => tenantAction("join")} disabled={!connected || !tenantInput.trim()}>Join</button>
          <button onClick={() => tenantAction("leave")} disabled={!connected || !tenantInput.trim()}>Leave</button>
        </div>
        {tenantError && <p className="error" role="alert">{tenantError}</p>}
        <p className="muted">Joined: {hub.tenants.length ? hub.tenants.join(", ") : "none"}. Tenants are re-joined automatically after a reconnect.</p>
      </section>

      <section className="card">
        <h2>Background task</h2>
        <p className="muted">POST returns right away. The server waits about 10 seconds, then notifies only you.</p>
        <button onClick={startTask} disabled={!userKey}>Start task</button>
        {!userKey && <span className="muted"> Set a user key first.</span>}
        {taskError && <p className="error" role="alert">{taskError}</p>}
        {pending.map((id) => <p key={id} className="muted">Task {id} accepted, working…</p>)}
      </section>

      <section className="card debug">
        <h2>Debug</h2>
        <dl>
          <dt>connectionId</dt><dd>{hub.connectionId ?? "—"}</dd>
          <dt>userKey</dt><dd>{userKey || "—"}</dd>
          <dt>tenants</dt><dd>{hub.tenants.join(", ") || "—"}</dd>
        </dl>
      </section>

      <section className="card">
        <div className="list-head">
          <h2>Notifications</h2>
          <button onClick={hub.markAllRead} disabled={hub.unread === 0}>Mark all read</button>
        </div>
        {hub.items.length === 0 ? (
          <p className="muted"><strong>No notifications yet.</strong> Open this page in a second tab and send one.</p>
        ) : (
          <ol className="list">
            {hub.items.map((n) => (
              <li key={n.id}>
                <div className="meta">
                  <span className={`kind ${n.kind}`}>{kindLabel(n.kind)}</span>
                  {n.from && <span> from {n.from}</span>}
                  {n.tenantKey && <span> in {n.tenantKey}</span>}
                  <time dateTime={n.sentAt}>
                    {new Date(n.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </time>
                </div>
                <div className="body">{n.message}</div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
