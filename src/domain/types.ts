// src/domain/types.ts

// タスクID（ただの文字列だけど意味を明確にする）
export type TaskId = string;

// タスクの設計図
export type Task = {
  id: TaskId;
  title: string;       // 表示名
  points: number;      // 加点用スコア
  isCore: boolean;     // 最重要タスクか
  isActive: boolean;   // 使っているか
};

// 日付（YYYY-MM-DD 形式）
export type DayISO = `${number}-${number}-${number}`;

// 1日の記録
export type DayLog = {
  date: DayISO;
  checks: Record<TaskId, boolean>;
  note?: string;
  excludeFromStats?: boolean; // false or undefined = 集計に含める

  // ★追加：透明性
  createdAt?: number; // ms
  updatedAt?: number; // ms
};

