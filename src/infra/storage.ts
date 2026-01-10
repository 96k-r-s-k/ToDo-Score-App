// src/infra/storage.ts
import type { DayISO, DayLog, Task } from "../domain/types";

const KEYS = {
  tasks: "tasks_v1",
  dayLogsV1: "daylogs_v1", // 旧： { [date]: DayLog }
  dayLogsV1Backup: "daylogs_v1_backup", // 移行後の保険
} as const;

const V2_PREFIX = "daylogs_v2_"; // 新： daylogs_v2_YYYY-MM

type DayLogMap = Record<DayISO, DayLog>;
type MonthISO = `${number}-${string}`; // "YYYY-MM"（厳密型にしすぎると扱いづらいので緩め）

// JSON.parse は壊れたデータで落ちるので、落ちない版を作る
function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// "YYYY-MM-DD" -> "YYYY-MM"
function toMonthISO(day: DayISO): MonthISO {
  return day.slice(0, 7) as MonthISO;
}

function v2Key(month: MonthISO): string {
  return `${V2_PREFIX}${month}`;
}

function loadMonthMap(month: MonthISO): DayLogMap {
  const data = safeJsonParse<DayLogMap>(localStorage.getItem(v2Key(month)));
  return data && typeof data === "object" ? data : {};
}

function saveMonthMap(month: MonthISO, map: DayLogMap): void {
  localStorage.setItem(v2Key(month), JSON.stringify(map));
}

function listV2Months(): MonthISO[] {
  const months: MonthISO[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith(V2_PREFIX)) {
      months.push(k.slice(V2_PREFIX.length) as MonthISO);
    }
  }
  // 文字列で降順ソート（YYYY-MMなのでこれでOK）
  months.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return months;
}

// v1があればv2へ分割保存して移行（v1はbackupとして残す）
let migratedOnce = false;
function migrateV1ToV2IfNeeded(): void {
  if (migratedOnce) return;
  migratedOnce = true;

  const v1Raw = localStorage.getItem(KEYS.dayLogsV1);
  if (!v1Raw) return;

  const v1 = safeJsonParse<DayLogMap>(v1Raw);
  if (!v1 || typeof v1 !== "object") return;

  // backupをまだ作ってなければ作る（保険）
  if (!localStorage.getItem(KEYS.dayLogsV1Backup)) {
    localStorage.setItem(KEYS.dayLogsV1Backup, v1Raw);
  }

  // 月ごとに振り分けてv2へ
  const bucket: Record<string, DayLogMap> = {};
  for (const [date, log] of Object.entries(v1) as Array<[DayISO, DayLog]>) {
    const month = toMonthISO(date);
    bucket[month] ??= {};
    bucket[month][date] = log;
  }

  for (const [month, map] of Object.entries(bucket) as Array<[MonthISO, DayLogMap]>) {
    // 既存v2があればマージ（v2優先で上書きしない。v1を足すだけ）
    const current = loadMonthMap(month);
    const merged = { ...map, ...current }; // currentが勝つ
    saveMonthMap(month, merged);
  }

  // v1は残すと二重管理になるので消す（backupがあるから復元可能）
  localStorage.removeItem(KEYS.dayLogsV1);
}

// --- Tasks ---
export function loadTasks(): Task[] {
  const data = safeJsonParse<Task[]>(localStorage.getItem(KEYS.tasks));
  const tasks = Array.isArray(data) ? data : [];

  // --- 正規化 ---
  let changed = false;

  // 1) points を整数・1〜10に固定（最重要は0固定）
  const normalized = tasks.map((t) => {
    let next = t;

    if (t.isCore) {
      if (t.points !== 0) {
        next = { ...next, points: 0 };
        changed = true;
      }
    } else {
      const p = Math.round(Number(t.points));
      const clamped = Math.min(10, Math.max(1, isFinite(p) ? p : 1));
      if (t.points !== clamped) {
        next = { ...next, points: clamped };
        changed = true;
      }
    }
    return next;
  });

  // 2) 運用中の最重要は最大5つまで
  let coreCount = 0;
  const limited = normalized.map((t) => {
    if (t.isActive && t.isCore) {
      coreCount++;
      if (coreCount > 5) {
        changed = true;
        return { ...t, isCore: false };
      }
    }
    return t;
  });

  if (changed) {
    localStorage.setItem(KEYS.tasks, JSON.stringify(limited));
  }

  return limited;
}


export function saveTasks(tasks: Task[]): void {
  localStorage.setItem(KEYS.tasks, JSON.stringify(tasks));
}

// --- DayLogs (互換API：全期間マップとしてロード) ---
export function loadDayLogMap(): DayLogMap {
  migrateV1ToV2IfNeeded();

  const months = listV2Months();
  const merged: DayLogMap = {};

  for (const m of months) {
    const mm = loadMonthMap(m);
    for (const [d, log] of Object.entries(mm) as Array<[DayISO, DayLog]>) {
      merged[d] = log;
    }
  }
  return merged;
}

// 互換API：全期間マップを渡されたら、月ごとに保存し直す
export function saveDayLogMap(map: DayLogMap): void {
  migrateV1ToV2IfNeeded();

  const bucket: Record<string, DayLogMap> = {};
  for (const [date, log] of Object.entries(map) as Array<[DayISO, DayLog]>) {
    const month = toMonthISO(date);
    bucket[month] ??= {};
    bucket[month][date] = log;
  }

  // 今あるv2キーも考慮しつつ上書き保存（該当月だけ）
  for (const [month, mm] of Object.entries(bucket) as Array<[MonthISO, DayLogMap]>) {
    saveMonthMap(month, mm);
  }
}

// ★追加：月の一覧（Historyのセレクト用）
export function listAvailableMonths(): MonthISO[] {
  migrateV1ToV2IfNeeded();
  return listV2Months();
}

// ★追加：特定月のデータだけ取得
export function loadDayLogMapForMonth(month: MonthISO): DayLogMap {
  migrateV1ToV2IfNeeded();
  return loadMonthMap(month);
}

export function getDayLog(date: DayISO): DayLog {
  migrateV1ToV2IfNeeded();

  const month = toMonthISO(date);
  const map = loadMonthMap(month);

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
  migrateV1ToV2IfNeeded();

  const month = toMonthISO(log.date);
  const map = loadMonthMap(month);

  const prev = map[log.date];
  const now = Date.now();

  map[log.date] = {
    ...log,
    createdAt: prev?.createdAt ?? log.createdAt ?? now,
    updatedAt: now,
  };

  saveMonthMap(month, map);
}

export function deleteDayLog(date: DayISO): void {
  migrateV1ToV2IfNeeded();

  const month = toMonthISO(date);
  const map = loadMonthMap(month);

  if (map[date]) {
    delete map[date];
    saveMonthMap(month, map);
  }
}
