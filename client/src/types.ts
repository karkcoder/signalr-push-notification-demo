// Mirrors AppNotification on the server. Named AppNotification because
// `Notification` is already a browser global (the Web Push API this demo is NOT about).
export type Kind = "broadcast" | "user" | "group" | "task";

export interface AppNotification {
  id: string;
  kind: Kind | string;
  message: string;
  from: string | null;
  group: string | null;
  sentAt: string;
}

export type Status = "connecting" | "connected" | "reconnecting" | "disconnected";

const KIND_LABELS: Record<string, string> = {
  broadcast: "Broadcast",
  user: "Direct",
  group: "Group",
  task: "Task",
};

export function kindLabel(kind: string | undefined): string {
  return kind && Object.hasOwn(KIND_LABELS, kind) ? KIND_LABELS[kind] : (kind || "Notification");
}

export const SERVER = "http://localhost:5080";
export const HUB_PATH = "/hubs/notifications";
export const MAX_LENGTH = 280;
export const LIST_CAP = 50;
