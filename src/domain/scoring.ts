// src/domain/scoring.ts
import type { DayLog, Task } from "./types";

export type Rank = "A" | "S" | "SS" | "SSS";

export type ScoreResult = {
  rawScore: number;             // 内部スコア（表示スコアもこれ）
  coreTotal: number;            // 最重要タスク数（運用中）
  coreDone: number;             // 達成した最重要タスク数
  coreIncompleteCount: number;  // 未達の最重要タスク数
  showRank: boolean;            // ランク表示するか
  rank?: Rank;                  // showRank=true のときのみ
};

function activeTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.isActive);
}

function coreTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.isActive && t.isCore);
}

function bonusTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.isActive && !t.isCore);
}

function countDone(tasks: Task[], checks: DayLog["checks"]): number {
  let n = 0;
  for (const t of tasks) {
    if (checks[t.id]) n += 1;
  }
  return n;
}

function sumBonusPoints(tasks: Task[], checks: DayLog["checks"]): number {
  let total = 0;
  for (const t of tasks) {
    if (checks[t.id]) total += t.points;
  }
  return total;
}

export function calcRank(score: number): Rank {
  if (score >= 150) return "SSS";
  if (score >= 120) return "SS";
  if (score >= 101) return "S";
  return "A"; // 100点が基本
}

/**
 * スコア計算ルール（確定仕様）
 * - 最重要タスクがN個 → 1個あたり 100/N 点（合計100）
 * - rawScore = (達成core数 * 100/N) + (達成bonusのpoints合計)
 * - ランク表示は「最重要全達成」のときのみ
 */
export function calcScore(tasks: Task[], dayLog: DayLog): ScoreResult {
  const actives = activeTasks(tasks);

  const cores = coreTasks(actives);
  const bonuses = bonusTasks(actives);

  const coreTotal = cores.length;

  // 最重要が0件だと割り算できないので、運用上は0件を避けるが安全に処理する
  const coreUnit = coreTotal > 0 ? 100 / coreTotal : 0;

  const coreDone = countDone(cores, dayLog.checks);
  const coreIncompleteCount = coreTotal - coreDone;

  const bonusScore = sumBonusPoints(bonuses, dayLog.checks);

  // 最重要は「個数に応じて合計100」にする（小数になる可能性あり）
  const coreScore = coreDone * coreUnit;

  // 内部スコア（努力は残す）
  const rawScore = coreScore + bonusScore;

  const showRank = coreTotal > 0 && coreIncompleteCount === 0;
  const rank = showRank ? calcRank(rawScore) : undefined;

  return {
    rawScore,
    coreTotal,
    coreDone,
    coreIncompleteCount,
    showRank,
    rank,
  };
}
