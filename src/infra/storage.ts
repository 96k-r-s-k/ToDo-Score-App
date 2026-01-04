// src/infra/storage.ts
import type { DayISO, DayLog, Task } from "../domain/types";

const KEYS = {
  tasks: "tasks_v1",
  dayLogs: "daylogs_v1", // { [date]: DayLog } で保存
} as const;

// JSON.parse は壊れたデータで落ちるので、落ちない版を作る
function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// --- Tasks ---
export function loadTasks(): Task[] {
  const data = safeJsonParse<Task[]>(localStorage.getItem(KEYS.tasks));
  return Array.isArray(data) ? data : [];
}

export function saveTasks(tasks: Task[]): void {
  localStorage.setItem(KEYS.tasks, JSON.stringify(tasks));
}

// --- DayLogs ---
type DayLogMap = Record<DayISO, DayLog>;

export function loadDayLogMap(): DayLogMap {
  const data = safeJsonParse<DayLogMap>(localStorage.getItem(KEYS.dayLogs));
  return data && typeof data === "object" ? data : {};
}

export function saveDayLogMap(map: DayLogMap): void {
  localStorage.setItem(KEYS.dayLogs, JSON.stringify(map));
}

export function getDayLog(date: DayISO): DayLog {
  const map = loadDayLogMap();
  return (
    map[date] ?? {
      date,
      checks: {},
      note: "",
      excludeFromStats: false, // ★デフォルトは除外しない
    }
  );
}


export function upsertDayLog(log: DayLog): void {
  const map = loadDayLogMap();
  const prev = map[log.date];
  const now = Date.now();

  map[log.date] = {
    ...log,
    createdAt: prev?.createdAt ?? log.createdAt ?? now,
    updatedAt: now,
  };

  saveDayLogMap(map);
}


export function deleteDayLog(date: DayISO): void {
  const map = loadDayLogMap();
  if (map[date]) {
    delete map[date];
    saveDayLogMap(map);
  }
}

