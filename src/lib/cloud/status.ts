import { useSyncExternalStore } from "react";

export interface SyncStatus {
  state: "off" | "signedOut" | "syncing" | "synced" | "offline" | "error";
  email: string;
  error: string;
}

let status: SyncStatus = { state: "off", email: "", error: "" };
const subs = new Set<() => void>();

export function setSync(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  subs.forEach((f) => f());
}
export const getSync = () => status;
export const useSync = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => status);

export const syncLabel = (s: SyncStatus) =>
  ({
    off: "",
    signedOut: "Not signed in",
    syncing: "Syncing…",
    synced: "Synced",
    offline: "Offline · will sync later",
    error: "Sync problem",
  })[s.state];
