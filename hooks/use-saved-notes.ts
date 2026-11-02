"use client";

import { useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "fieldnotes-saved";
const CHANGE_EVENT = "fieldnotes-saved-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) || "[]";
}

function getServerSnapshot() {
  return "[]";
}

export function useSavedNotes() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const savedIds = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(snapshot);
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  }, [snapshot]);

  function toggleSaved(id: string) {
    const next = savedIds.includes(id)
      ? savedIds.filter((savedId) => savedId !== id)
      : [...savedIds, id];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return next;
  }

  return { savedIds, savedCount: savedIds.length, toggleSaved };
}
