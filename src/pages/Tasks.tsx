// src/pages/Tasks.tsx
import { useEffect, useMemo, useState } from "react";
import type { Task, TaskId } from "../domain/types";
import { loadTasks, saveTasks } from "../infra/storage";

type DraftTask = {
  id?: TaskId;
  title: string;
  points: number;
  isCore: boolean;
  isActive: boolean;
};

function newDraft(): DraftTask {
  return { title: "", points: 1, isCore: false, isActive: true };
}

function cloneTaskToDraft(t: Task): DraftTask {
  return {
    id: t.id,
    title: t.title,
    points: t.points,
    isCore: t.isCore,
    isActive: t.isActive,
  };
}

function clampPoints(n: number): number {
  const v = Number.isFinite(n) ? Math.round(n) : 1;
  return Math.min(10, Math.max(1, v));
}

function normalizePoints(d: DraftTask): number {
  // 最重要は点数を使わない（合計100配分のため）
  if (d.isCore) return 0;

  // 加点は整数 1〜10 に固定
  return clampPoints(d.points);
}

function makeId(): TaskId {
  return `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState<DraftTask>(newDraft());
  const [editingId, setEditingId] = useState<TaskId | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setTasks(loadTasks());
  }, []);

  const activeCount = useMemo(() => tasks.filter((t) => t.isActive).length, [tasks]);
  const coreActiveCount = useMemo(
    () => tasks.filter((t) => t.isActive && t.isCore).length,
    [tasks]
  );

  const coreList = useMemo(() => tasks.filter((t) => t.isCore), [tasks]);
  const otherList = useMemo(() => tasks.filter((t) => !t.isCore), [tasks]);

  function persist(next: Task[]) {
    setTasks(next);
    saveTasks(next);
  }

  function resetForm() {
    setDraft(newDraft());
    setEditingId(null);
    setError("");
  }

  function startEdit(t: Task) {
    setDraft(cloneTaskToDraft(t));
    setEditingId(t.id);
    setError("");
  }

  function remove(id: TaskId) {
    const next = tasks.filter((t) => t.id !== id);
    persist(next);
    if (editingId === id) resetForm();
  }

  function toggleActive(id: TaskId) {
    const target = tasks.find((t) => t.id === id);
    if (!target) return;

    // OFF→ON になる時だけ制限チェック（最重要が5つ超えるのを防ぐ）
    const willActivate = !target.isActive;
    if (willActivate && target.isCore) {
      const others = tasks.filter((t) => t.id !== id);
      const coreActiveCountNow = others.filter((t) => t.isActive && t.isCore).length;
      if (coreActiveCountNow >= 5) {
        setError(
          "最重要タスクは運用中で最大5つまでです。どれかを最重要解除するか、別の最重要を休止してください。"
        );
        return;
      }
    }

    setError("");
    const next = tasks.map((t) => (t.id === id ? { ...t, isActive: !t.isActive } : t));
    persist(next);
  }

  function canEnableCoreActive(excludeId?: TaskId): boolean {
    const others = excludeId ? tasks.filter((t) => t.id !== excludeId) : tasks;
    const coreActiveCountNow = others.filter((t) => t.isActive && t.isCore).length;
    return coreActiveCountNow < 5;
  }

  // ★追加：↑↓で並べ替え（同一グループ内：最重要同士 / 加点同士）
  function moveTask(id: TaskId, dir: -1 | 1) {
    const current = tasks.find((t) => t.id === id);
    if (!current) return;

    // 表示が「最重要」と「加点」で分かれているので、移動は同グループ内のみ
    const group = tasks.filter((t) => t.isCore === current.isCore);

    const pos = group.findIndex((t) => t.id === id);
    const nextPos = pos + dir;
    if (pos < 0 || nextPos < 0 || nextPos >= group.length) return;

    // group内の隣のタスクのid
    const neighborId = group[nextPos].id;

    // 元のtasks配列上で swap する
    const idxA = tasks.findIndex((t) => t.id === id);
    const idxB = tasks.findIndex((t) => t.id === neighborId);
    if (idxA < 0 || idxB < 0) return;

    const next = tasks.slice();
    [next[idxA], next[idxB]] = [next[idxB], next[idxA]];

    persist(next);
  }

  function submit() {
    const title = draft.title.trim();
    if (!title) return;

    // 最重要を運用中でONにするなら、最大5制限チェック
    if (draft.isCore && draft.isActive) {
      const ok = canEnableCoreActive(editingId ?? undefined);
      if (!ok) {
        setError(
          "最重要タスクは運用中で最大5つまでです。どれかを最重要解除するか、非アクティブにしてください。"
        );
        return;
      }
    }

    const points = normalizePoints(draft);

    if (editingId) {
      const next = tasks.map((t) =>
        t.id === editingId
          ? { ...t, title, points, isCore: draft.isCore, isActive: draft.isActive }
          : t
      );
      persist(next);
      resetForm();
      return;
    }

    const newTask: Task = {
      id: makeId(),
      title,
      points,
      isCore: draft.isCore,
      isActive: draft.isActive,
    };

    persist([newTask, ...tasks]);
    resetForm();
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <h1>Tasks</h1>

      <div style={{ opacity: 0.8, marginBottom: 12 }}>
        タスク数（運用中）：{activeCount} / 最重要（運用中）：{coreActiveCount}
      </div>

      <div style={{ padding: 12, border: "1px solid #ccc", borderRadius: 8, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>{editingId ? "タスク編集" : "タスク追加"}</h2>

        {error && (
          <div style={{ padding: 10, border: "1px solid #f2c", borderRadius: 8, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>タスク名</span>
            <input
              value={draft.title}
              onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
              placeholder="例：水を飲む"
              style={{ padding: 8 }}
            />
          </label>

          {/* 最重要 */}
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.isCore}
              onChange={(e) => {
                const nextIsCore = e.target.checked;

                // ONにする時だけ制限チェック（運用中なら枠を消費する）
                if (nextIsCore && draft.isActive) {
                  const ok = canEnableCoreActive(editingId ?? undefined);
                  if (!ok) {
                    setError(
                      "最重要タスクは運用中で最大5つまでです。どれかを最重要解除するか、非アクティブにしてください。"
                    );
                    return;
                  }
                }

                setError("");
                setDraft((p) => ({
                  ...p,
                  isCore: nextIsCore,
                  points: nextIsCore ? 0 : clampPoints(p.points),
                }));
              }}
            />
            <span>最重要タスク（今日の土台 / 最大5・運用中）</span>
          </label>

          {/* 点数：加点のみ 1〜10 */}
          <label style={{ display: "grid", gap: 4, opacity: draft.isCore ? 0.6 : 1 }}>
            <span>点数（加点タスクのみ有効 / 1〜10）</span>

            <select
              value={draft.isCore ? 1 : clampPoints(draft.points)}
              disabled={draft.isCore}
              onChange={(e) => setDraft((p) => ({ ...p, points: clampPoints(Number(e.target.value)) }))}
              style={{ padding: 8 }}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>

            {draft.isCore && (
              <small>最重要タスクは「個数に応じて合計100点」なので点数は使いません。</small>
            )}
          </label>

          {/* 運用中 */}
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => {
                const nextActive = e.target.checked;

                // OFF→ON になる時だけ制限チェック（最重要が運用中になる場合）
                if (nextActive && draft.isCore) {
                  const ok = canEnableCoreActive(editingId ?? undefined);
                  if (!ok) {
                    setError(
                      "最重要タスクは運用中で最大5つまでです。どれかを最重要解除するか、非アクティブにしてください。"
                    );
                    return;
                  }
                }

                setError("");
                setDraft((p) => ({ ...p, isActive: nextActive }));
              }}
            />
            <span>運用中</span>
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submit} style={{ padding: "8px 12px" }}>
              {editingId ? "更新" : "追加"}
            </button>
            <button onClick={resetForm} style={{ padding: "8px 12px" }}>
              クリア
            </button>
          </div>

          <small style={{ opacity: 0.7 }}>※タスク名が空だと追加/更新しません（入力ミス防止）</small>
        </div>
      </div>

      <h2>タスク一覧</h2>

      {tasks.length === 0 ? (
        <div style={{ opacity: 0.8 }}>まだタスクがありません。上から追加してください。</div>
      ) : (
        <>
          {/* ===== 最重要 ===== */}
          <h3 style={{ marginTop: 10 }}>最重要</h3>
          {coreList.length === 0 ? (
            <div style={{ opacity: 0.8 }}>最重要タスクがありません。</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {coreList.map((t) => {
                const idx = coreList.findIndex((x) => x.id === t.id);
                const canUp = idx > 0;
                const canDown = idx < coreList.length - 1;

                return (
                  <li
                    key={t.id}
                    style={{
                      padding: 10,
                      borderBottom: "1px solid #eee",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <strong style={{ opacity: t.isActive ? 1 : 0.5 }}>{t.title}</strong>
                      <span style={{ marginLeft: "auto", opacity: 0.7 }}>最重要</span>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        disabled={!canUp}
                        onClick={() => moveTask(t.id, -1)}
                        style={{ padding: "6px 10px" }}
                      >
                        ↑
                      </button>
                      <button
                        disabled={!canDown}
                        onClick={() => moveTask(t.id, 1)}
                        style={{ padding: "6px 10px" }}
                      >
                        ↓
                      </button>

                      <button onClick={() => startEdit(t)} style={{ padding: "6px 10px" }}>
                        編集
                      </button>
                      <button onClick={() => toggleActive(t.id)} style={{ padding: "6px 10px" }}>
                        {t.isActive ? "休止" : "復帰"}
                      </button>
                      <button onClick={() => remove(t.id)} style={{ padding: "6px 10px" }}>
                        削除
                      </button>
                    </div>

                    <small style={{ opacity: 0.6 }}>id: {t.id}</small>
                  </li>
                );
              })}
            </ul>
          )}

          {/* ===== 加点タスク ===== */}
          <h3 style={{ marginTop: 18 }}>加点タスク</h3>
          {otherList.length === 0 ? (
            <div style={{ opacity: 0.8 }}>加点タスクがありません。</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {otherList.map((t) => {
                const idx = otherList.findIndex((x) => x.id === t.id);
                const canUp = idx > 0;
                const canDown = idx < otherList.length - 1;

                return (
                  <li
                    key={t.id}
                    style={{
                      padding: 10,
                      borderBottom: "1px solid #eee",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <strong style={{ opacity: t.isActive ? 1 : 0.5 }}>{t.title}</strong>
                      <span style={{ marginLeft: "auto", opacity: 0.7 }}>{`+${t.points}`}</span>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        disabled={!canUp}
                        onClick={() => moveTask(t.id, -1)}
                        style={{ padding: "6px 10px" }}
                      >
                        ↑
                      </button>
                      <button
                        disabled={!canDown}
                        onClick={() => moveTask(t.id, 1)}
                        style={{ padding: "6px 10px" }}
                      >
                        ↓
                      </button>

                      <button onClick={() => startEdit(t)} style={{ padding: "6px 10px" }}>
                        編集
                      </button>
                      <button onClick={() => toggleActive(t.id)} style={{ padding: "6px 10px" }}>
                        {t.isActive ? "休止" : "復帰"}
                      </button>
                      <button onClick={() => remove(t.id)} style={{ padding: "6px 10px" }}>
                        削除
                      </button>
                    </div>

                    <small style={{ opacity: 0.6 }}>id: {t.id}</small>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
