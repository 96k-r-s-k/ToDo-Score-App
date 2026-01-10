// src/pages/History.tsx
import { useEffect, useMemo, useState } from "react";
import type { DayISO, DayLog, Task } from "../domain/types";
import { calcScore } from "../domain/scoring";
import {
  listAvailableMonths,
  loadDayLogMap,
  loadDayLogMapForMonth,
  loadTasks,
} from "../infra/storage";
import { todayKey, isFutureDay } from "../utils/date";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type RangeKey = "7" | "30";
type Mode = "recent" | "month";
type MonthISO = `${number}-${string}`; // "YYYY-MM"

function toDayISO(d: Date): DayISO {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}` as DayISO;
}

function fmtMMDD(iso: DayISO): string {
  // "YYYY-MM-DD" -> "MM/DD"
  return iso.slice(5, 7) + "/" + iso.slice(8, 10);
}

function genRecentDays(days: number): DayISO[] {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: DayISO[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    out.push(toDayISO(d));
  }
  return out;
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

function roundScore(value: number | null | undefined): number | null {
  if (value == null) return null;
  return Math.round(value);
}

function monthLabel(m: MonthISO): string {
  // "YYYY-MM" -> "YYYY年MM月"
  const y = m.slice(0, 4);
  const mm = m.slice(5, 7);
  return `${y}年${mm}月`;
}

export default function History() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<Record<DayISO, DayLog>>({});

  // 表示モード
  const [mode, setMode] = useState<Mode>("recent");

  // デフォは直近7日、30日はオプション
  const [range, setRange] = useState<RangeKey>("7");

  // 月遡り
  const [months, setMonths] = useState<MonthISO[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<MonthISO | "">("");

  const [includeExcluded, setIncludeExcluded] = useState(false);

  useEffect(() => {
    setTasks(loadTasks());

    const ms = listAvailableMonths() as MonthISO[];
    setMonths(ms);

    // 初期の月：今月（データがあればそれ優先）/ なければ最新月
    const now = todayKey().slice(0, 7) as MonthISO;
    const initialMonth = (ms.includes(now) ? now : ms[0]) ?? now;
    setSelectedMonth(initialMonth);

    // recentは全期間マップをロード（軽い規模前提）
    setLogs(loadDayLogMap());
  }, []);

  // mode/monthが変わったら必要なものをロードし直す（月別は月だけ読む）
  useEffect(() => {
    if (mode === "recent") {
      setLogs(loadDayLogMap());
      return;
    }
    if (selectedMonth) {
      setLogs(loadDayLogMapForMonth(selectedMonth as MonthISO));
    }
  }, [mode, selectedMonth]);

  // ====== グラフデータ ======
  const chartData = useMemo(() => {
    const today = todayKey();

    // 表示対象のdatesを作る
    let dates: DayISO[] = [];

    if (mode === "recent") {
      dates = genRecentDays(range === "7" ? 7 : 30);
    } else {
      // 月別：その月に存在する日付だけ（0埋めしない）
      const ds = Object.keys(logs) as DayISO[];
      dates = ds
        .filter((d) => !isFutureDay(d, today)) // 未来は除外
        .sort((a, b) => (a < b ? -1 : 1));
    }

    // 除外の扱い：includeExcluded=falseなら null にして線を切る
    return dates.map((d) => {
      const log =
        logs[d] ??
        ({
          date: d,
          checks: {},
          excludeFromStats: false,
        } as DayLog);

      const excluded = !!log.excludeFromStats;
      const score = calcScore(tasks, log).rawScore;

      return {
        date: d,
        label: fmtMMDD(d),
        rawScore: !includeExcluded && excluded ? null : roundScore(score),
        excluded,
        updatedAt: log.updatedAt,
      };
    });
  }, [mode, range, logs, tasks, includeExcluded]);

  // ====== 一覧 ======
  const rows = useMemo(() => {
    const today = todayKey();
    let dates = (Object.keys(logs) as DayISO[]).sort((a, b) => (a < b ? 1 : -1));

    // recentのときだけ：7/30 の範囲に寄せる（一覧の整合性）
    if (mode === "recent") {
      const cut = genRecentDays(range === "7" ? 7 : 30)[0];
      dates = dates.filter((d) => d >= cut);
    }

    // 未来日除外
    dates = dates.filter((d) => !isFutureDay(d, today));

    // 除外トグル
    if (!includeExcluded) {
      dates = dates.filter((d) => !logs[d]?.excludeFromStats);
    }

    return dates.map((d) => {
      const log = logs[d];
      const scoreRes = calcScore(tasks, log);

      return {
        date: d,
        rawScore: roundScore(scoreRes.rawScore),
        showRank: scoreRes.showRank,
        rank: scoreRes.rank, // "A" | "S" | "SS" | "SSS"
        note: log?.note ?? "",
        updatedAt: log?.updatedAt,
        excludeFromStats: !!log?.excludeFromStats,
      };
    });
  }, [mode, range, logs, tasks, includeExcluded]);

  // ====== 平均など ======
  const summary = useMemo(() => {
    const today = todayKey();
    let dates = (Object.keys(logs) as DayISO[]).sort();

    // recentのときだけ範囲適用
    if (mode === "recent") {
      const cut = genRecentDays(range === "7" ? 7 : 30)[0];
      dates = dates.filter((d) => d >= cut);
    }

    const futureDays = dates.filter((d) => isFutureDay(d, today)).length;
    let statsDates = dates.filter((d) => !isFutureDay(d, today));

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
      if (score.coreIncompleteCount > 0) coreMissDays++;
    }

    return {
      avg: total / statsDates.length,
      coreMissDays,
      count: statsDates.length,
      excludedDays,
      futureDays,
    };
  }, [mode, range, logs, tasks, includeExcluded]);

  return (
    <div style={{ padding: 16, maxWidth: 920, margin: "0 auto" }}>
      <h1>History</h1>

      {/* ===== 上部コントロール ===== */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setMode("recent")}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: mode === "recent" ? "#eee" : "white",
              cursor: "pointer",
            }}
          >
            直近
          </button>
          <button
            onClick={() => setMode("month")}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: mode === "month" ? "#eee" : "white",
              cursor: "pointer",
            }}
          >
            月別
          </button>
        </div>

        {mode === "recent" ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setRange("7")}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: range === "7" ? "#eee" : "white",
                cursor: "pointer",
              }}
            >
              7日
            </button>
            <button
              onClick={() => setRange("30")}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: range === "30" ? "#eee" : "white",
                cursor: "pointer",
              }}
            >
              30日
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ opacity: 0.85 }}>月：</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value as MonthISO)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ccc" }}
            >
              {months.length === 0 ? (
                <option value="">（記録なし）</option>
              ) : (
                months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))
              )}
            </select>
          </div>
        )}

        <label style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={includeExcluded}
            onChange={(e) => setIncludeExcluded(e.target.checked)}
          />
          除外日も含める
        </label>
      </div>

      {/* ===== グラフ ===== */}
      <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>日別 rawScore 推移</div>

        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip
                formatter={(value: any) => (value == null ? "（除外）" : value)}
                labelFormatter={(label: any, payload: any) => {
                  const p = payload?.[0]?.payload;
                  return p?.date ?? label;
                }}
              />
              <Line type="monotone" dataKey="rawScore" dot={false} connectNulls={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ marginTop: 8, opacity: 0.8, fontSize: 12 }}>
          ※除外日はデフォで線を切ります（「除外日も含める」をONで表示）
        </div>
      </div>

      {/* ===== 平均など ===== */}
      <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 12 }}>
        <div style={{ fontSize: 24, fontWeight: 700 }}>
          平均 rawScore：{summary.avg.toFixed(1)}
        </div>
        <div style={{ marginTop: 6 }}>最重要未達日数：{summary.coreMissDays}</div>
        <div style={{ marginTop: 6 }}>対象日数：{summary.count}</div>
        <div style={{ marginTop: 6 }}>除外指定日数：{summary.excludedDays}</div>
      </div>

      {/* ===== 日別一覧 ===== */}
      <h2 style={{ marginTop: 18 }}>日別一覧</h2>

      {rows.length === 0 ? (
        <div style={{ opacity: 0.8 }}>まだ記録がありません（Todayでチェックを入れると蓄積されます）。</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((r) => (
            <div
              key={r.date}
              style={{
                padding: 12,
                border: "1px solid #ddd",
                borderRadius: 12,
                background: r.excludeFromStats ? "#fafafa" : "white",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 700 }}>{r.date}</div>
                <div style={{ opacity: 0.8, fontSize: 12 }}>{fmtUpdatedAt(r.updatedAt)}</div>
              </div>

              <div
                style={{
                  marginTop: 6,
                  fontSize: 18,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  rawScore：<b>{r.rawScore}</b>
                  {r.excludeFromStats ? (
                    <span style={{ marginLeft: 8, opacity: 0.7 }}>（除外）</span>
                  ) : null}
                </div>

                {r.showRank && r.rank ? (
                  <span
                    style={{
                      padding: "2px 10px",
                      borderRadius: 999,
                      border: "1px solid #ccc",
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                    title="最重要タスク全達成時のみランク表示"
                  >
                    Rank {r.rank}
                  </span>
                ) : null}
              </div>

              {r.note ? <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{r.note}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
