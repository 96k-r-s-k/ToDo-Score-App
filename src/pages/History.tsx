// src/pages/History.tsx
import { useEffect, useMemo, useState } from "react";
import type { DayISO, DayLog, Task } from "../domain/types";
import { calcScore } from "../domain/scoring";
import { loadDayLogMap, loadTasks } from "../infra/storage";
import { todayKey, isFutureDay } from "../utils/date";


type RangeKey = "7" | "30" | "90" | "all";

function isoToDate(iso: DayISO): Date {
  // "YYYY-MM-DD" を Date に（ローカル時刻）
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toDayISO(date: Date): DayISO {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}` as DayISO;
}

function cutoffISO(days: number): DayISO {
  const now = new Date();
  const cut = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  cut.setDate(cut.getDate() - (days - 1));
  return toDayISO(cut);
}

function fmtUpdatedAt(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}


function hasAnyInput(log?: DayLog): boolean {
  if (!log) return false;

  // 1) メモ
  const memo = (log as any).note;
  if (typeof memo === "string" && memo.trim().length > 0) return true;

  // 2) 除外フラグ（明示的操作）
  if ((log as any).excludeFromStats === true) return true;

  // 3) チェック（完了が1つでも）
  // プロパティ名が app によって違うので、よくある候補を見て拾う
  const checks =
    (log as any).checks ??
    (log as any).doneMap ??
    (log as any).doneByTaskId ??
    (log as any).results;

  if (checks && typeof checks === "object") {
    for (const v of Object.values(checks as Record<string, unknown>)) {
      if (v === true) return true;
    }
  }

  return false;
}


export default function History() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<Record<DayISO, DayLog>>({});
  const [range, setRange] = useState<RangeKey>("30");
  const [includeExcluded, setIncludeExcluded] = useState(false);

  // 初期ロード（タブ切替で再読み込みしたいので、mount時に読み直す）
  useEffect(() => {
    setTasks(loadTasks());
    setLogs(loadDayLogMap());
  }, []);

  const rows = useMemo(() => {
    let dates = Object.keys(logs) as DayISO[];
    dates = dates.filter((d) => hasAnyInput(logs[d]));

    dates.sort((a, b) => isoToDate(b).getTime() - isoToDate(a).getTime());

    let filtered = dates;
    // 除外フィルター（デフォルトは含める設計にしたいなら、ここは後で反転させる）
    if (!includeExcluded) {
      filtered = filtered.filter((d) => !logs[d]?.excludeFromStats);
    }

    // 期間フィルター（★filteredを維持したまま絞る）
    if (range !== "all") {
      const days = Number(range);
      const cut = cutoffISO(days);
      filtered = filtered.filter((d) => d >= cut);
    }

    return filtered.map((date) => {
      const log = logs[date];
      const score = calcScore(tasks, log);
      return { date, score, updatedAt: log?.updatedAt };
    });
  }, [logs, tasks, range, includeExcluded]);



  const summary = useMemo(() => {
  // まず「入力がある日」だけにする（rowsと同じ基準）
  let dates = (Object.keys(logs) as DayISO[]).filter((d) => hasAnyInput(logs[d]));

  // 期間フィルター
  if (range !== "all") {
    const days = Number(range);
    const cut = cutoffISO(days);
    dates = dates.filter((d) => d >= cut);
  }

  // 未来日カウント（透明性）
  const today = todayKey();
  const futureDays = dates.filter((d) => isFutureDay(d, today)).length;

  // ★集計対象日：未来日除外
  let statsDates = dates.filter((d) => !isFutureDay(d, today));

  // ★除外トグル（平均に含めないがデフォ）
  if (!includeExcluded) {
    statsDates = statsDates.filter((d) => !logs[d]?.excludeFromStats);
  }

  const excludedDays = dates.filter((d) => logs[d]?.excludeFromStats).length;

  if (statsDates.length === 0) {
    return { avg: 0, coreMissDays: 0, count: 0, excludedDays, futureDays };
  }

  let total = 0;
  let coreMissDays = 0;

  for (const d of statsDates) {
    const log = logs[d];
    const score = calcScore(tasks, log);
    total += score.rawScore;
    if (score.coreIncompleteCount > 0) coreMissDays += 1;
  }

  return {
    avg: total / statsDates.length,
    coreMissDays,
    count: statsDates.length,
    excludedDays,
    futureDays,
  };
}, [logs, tasks, range, includeExcluded]);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <h1>History</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>期間</span>
          <select value={range} onChange={(e) => setRange(e.target.value as RangeKey)} style={{ padding: "6px 10px", fontSize: 16 }}>
            <option value="7">直近7日</option>
            <option value="30">直近30日</option>
            <option value="90">直近90日</option>
            <option value="all">全期間</option>
          </select>
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={includeExcluded}
            onChange={(e) => setIncludeExcluded(e.target.checked)}
          />
          <span>集計から除外した日も含める</span>
        </label>

        <button
          onClick={() => {
            // 手動リフレッシュ（LocalStorage再読み込み）
            setTasks(loadTasks());
            setLogs(loadDayLogMap());
          }}
          style={{ padding: "6px 10px" }}
        >
          更新
        </button>
      </div>

      <div style={{ padding: 12, border: "1px solid #ccc", borderRadius: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 14, opacity: 0.8 }}>対象日数：{summary.count}</div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>
          平均 rawScore：{summary.avg.toFixed(1)}
        </div>
        <div style={{ marginTop: 6 }}>
          最重要未達日数：{summary.coreMissDays}
        </div>
        <div style={{ marginTop: 6 }}>
          除外指定日数：{summary.excludedDays}
        </div>
      </div>

      <h2>日別一覧</h2>

      {rows.length === 0 ? (
        <div style={{ opacity: 0.8 }}>まだ記録がありません（Todayでチェックを入れると蓄積されます）。</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((r) => (
            <li
              key={r.date}
              style={{
                padding: 10,
                borderBottom: "1px solid #eee",
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ width: 110, fontFamily: "monospace" }}>{r.date}</div>

              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {r.score.showRank
                ? `${r.score.rank} ${r.score.rawScore.toFixed(1)}`
                : r.score.rawScore.toFixed(1)}
              </div>

              <div style={{ fontSize: 12, opacity: 0.55 }}>
                {r.updatedAt ? `更新: ${fmtUpdatedAt(r.updatedAt)}` : ""}
              </div>
              <div style={{ marginLeft: "auto", opacity: 0.75 }}>
                最重要未達：{r.score.coreIncompleteCount}
              </div>


            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 14, opacity: 0.65, fontSize: 12 }}>
        ※ 現状は「現在のタスク定義」で過去ログを再計算します。将来、日次にタスクスナップショットを保存すると過去スコアがブレません。
      </div>
    </div>
  );
}
