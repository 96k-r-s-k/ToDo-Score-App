// src/pages/Today.tsx
import { useEffect, useMemo, useState } from "react";
import type { DayISO, Task } from "../domain/types";
import { calcScore } from "../domain/scoring";
import { getDayLog, loadTasks, saveTasks, upsertDayLog, deleteDayLog } from "../infra/storage";

function toDayISO(date: Date): DayISO {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}` as DayISO;
}

// 初回用：タスクが無いときに仮で入れる
function seedTasksIfEmpty(tasks: Task[]): Task[] {
  if (tasks.length > 0) return tasks;

  const now = Date.now();
  return [
    { id: `t_${now}_1`, title: "水を飲む", isCore: true, isActive: true, points: 0 },
    { id: `t_${now}_2`, title: "外に出る（1分）", isCore: true, isActive: true, points: 0 },
    { id: `t_${now}_3`, title: "本を1ページ読む", isCore: true, isActive: true, points: 0 },
    { id: `t_${now}_4`, title: "ストレッチ", isCore: false, isActive: true, points: 10 },
    { id: `t_${now}_5`, title: "片付け1つ", isCore: false, isActive: true, points: 5 },
  ];
}

//type DayLogDraft = {
//  checks: Record<string, boolean>;
//  note: string;
//  excludeFromStats: boolean;
//};


function isEmptyDayLog(log: { checks: Record<string, boolean>; note?: string; excludeFromStats?: boolean }): boolean {
  if (log.excludeFromStats) return false;
  if ((log.note ?? "").trim().length > 0) return false;
  return !Object.values(log.checks ?? {}).some(Boolean);
}

function persistDayLog(date: DayISO, log: { checks: Record<string, boolean>; note: string; excludeFromStats: boolean }) {
  if (isEmptyDayLog(log)) {
    deleteDayLog(date);
  } else {
    upsertDayLog({ date, ...log } as any);
  }
}


function addDaysISO(base: DayISO, delta: number): DayISO {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + delta);
  return toDayISO(dt);
}

export default function Today() {
  const todayISO = useMemo(() => toDayISO(new Date()), []);

  // 未来も選べる（制限しない）
  const [selectedDay, setSelectedDay] = useState<DayISO>(todayISO);

  const isFuture = selectedDay > todayISO;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  const [note, setNote] = useState("");
  const [excludeFromStats, setExcludeFromStats] = useState(false);


  // 初期ロード（選択日が変わるたびに、その日のログを復元）
  useEffect(() => {

    const loadedTasks = seedTasksIfEmpty(loadTasks());
    setTasks(loadedTasks);
    saveTasks(loadedTasks);

    const log = getDayLog(selectedDay);
    setChecks(log.checks);
    setNote(log.note ?? "");
    setExcludeFromStats(!!log.excludeFromStats);

  }, [selectedDay]);

  const score = useMemo(() => {
    // 未来日はスコアを「出さない」方針なので、計算しても表示には使わない
    return calcScore(tasks, { date: selectedDay, checks, note, excludeFromStats });
  }, [tasks, checks, selectedDay, note, excludeFromStats]);

  function toggle(taskId: string) {
    if (isFuture) return; // ★未来はチェック不可

    const nextChecks = { ...checks, [taskId]: !checks[taskId] };
    setChecks(nextChecks);

    // そのまま保存（空なら削除）
    persistDayLog(selectedDay, { checks: nextChecks, note, excludeFromStats });
  }


  const coreTasks = tasks.filter((t) => t.isActive && t.isCore);
  const bonusTasks = tasks.filter((t) => t.isActive && !t.isCore);

  const labelDay =
    selectedDay === todayISO
      ? `${selectedDay}（今日）`
      : isFuture
      ? `${selectedDay}（未来）`
      : `${selectedDay}（過去）`;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1>Today</h1>

      {/* 日付セレクタ */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 ,flexWrap: "wrap" }}>
        <button
          onClick={() => setSelectedDay(addDaysISO(selectedDay, -1))}
          style={{ padding: "6px 10px" }}
        >
          ◀ 前日
        </button>

        <input
          type="date"
          value={selectedDay}
          onChange={(e) => setSelectedDay(e.target.value as DayISO)}
          style={{ padding: "6px 10px" }}
        />

        <button
          onClick={() => setSelectedDay(todayISO)}
          style={{ padding: "6px 10px" }}
        >
          今日
        </button>

        <button
          onClick={() => setSelectedDay(addDaysISO(selectedDay, 1))}
          style={{ padding: "6px 10px" }}
        >
          翌日 ▶
        </button>
      </div>

      <p style={{ marginTop: 0, opacity: 0.8 }}>{labelDay}</p>

      {/* スコアカード */}
      <div style={{ padding: 12, border: "1px solid #ccc", marginBottom: 16 }}>
        {isFuture ? (
          <div style={{ opacity: 0.85 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>未来日</div>
            <div>チェック（達成）は当日以降に入力できます。</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 24 }}>
              {score.showRank ? `${score.rank} ${score.rawScore.toFixed(1)}` : score.rawScore.toFixed(1)}
            </div>
            <div>最重要未達数：{score.coreIncompleteCount}</div>
          </>
        )}
      </div>

      {/* メモ＋除外 */}
      <div style={{ padding: 12, border: "1px solid #ccc", marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>ひとことメモ</h2>

        <textarea
          value={note}
          onChange={(e) => {
            const nextNote = e.target.value;
            setNote(nextNote);

            // 未来日でも保存OK（チェックは現状のまま）
            persistDayLog(selectedDay, { checks, note: nextNote, excludeFromStats });
          }}
          placeholder="例：出張、体調不良、予定が詰まっていた、など"
          rows={4}
          style={{ width: "100%", padding: 8, resize: "vertical", fontSize: 16 }}
        />

        <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
          <input
            type="checkbox"
            checked={excludeFromStats}
            onChange={(e) => {
              const nextExclude = e.target.checked;
              setExcludeFromStats(nextExclude);

              // 未来日でも保存OK
              persistDayLog(selectedDay, { checks, note, excludeFromStats: nextExclude });
            }}
            style={{ padding: "6px 10px", fontSize: 16 }}
          />
          <span>この日を平均などの集計から除外する</span>
        </label>

        <small style={{ opacity: 0.7 }}>
          ※ 未来日もメモと除外は設定できます（チェックは当日以降）。
        </small>
      </div>

      <h2>最重要タスク（今日の土台）</h2>
      <ul style={{ opacity: isFuture ? 0.6 : 1 }}>
        {coreTasks.map((t) => (
          <li key={t.id}>
            <label>
              <input
                type="checkbox"
                checked={!!checks[t.id]}
                onChange={() => toggle(t.id)}
                disabled={isFuture}
              />
              {t.title}
            </label>
          </li>
        ))}
      </ul>

      <h2>加点タスク（余力）</h2>
      <ul style={{ opacity: isFuture ? 0.6 : 1 }}>
        {bonusTasks.map((t) => (
          <li key={t.id}>
            <label>
              <input
                type="checkbox"
                checked={!!checks[t.id]}
                onChange={() => toggle(t.id)}
                disabled={isFuture}
              />
              {t.title} (+{t.points})
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
