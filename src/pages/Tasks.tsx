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
  return { title: "", points: 10, isCore: false, isActive: true };
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

function normalizePoints(d: DraftTask): number {
  // 最重要は点数を使わない（合計100配分のため）
  // UI上も混乱を避けるため 0 に寄せる
  if (d.isCore) return 0;

  // 加点は 0 以上の整数にしておく（最小0）
  const n = Number.isFinite(d.points) ? Math.floor(d.points) : 0;
  return Math.max(0, n);
}

function makeId(): TaskId {
  return `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState<DraftTask>(newDraft());
  const [editingId, setEditingId] = useState<TaskId | null>(null);

  useEffect(() => {
    setTasks(loadTasks());
  }, []);

  const activeCount = useMemo(() => tasks.filter((t) => t.isActive).length, [tasks]);
  const coreActiveCount = useMemo(
    () => tasks.filter((t) => t.isActive && t.isCore).length,
    [tasks]
  );

  function persist(next: Task[]) {
    setTasks(next);
    saveTasks(next);
  }

  function resetForm() {
    setDraft(newDraft());
    setEditingId(null);
  }

  function startEdit(t: Task) {
    setDraft(cloneTaskToDraft(t));
    setEditingId(t.id);
  }

  function remove(id: TaskId) {
    const next = tasks.filter((t) => t.id !== id);
    persist(next);
    if (editingId === id) resetForm();
  }

  function toggleActive(id: TaskId) {
    const next = tasks.map((t) => (t.id === id ? { ...t, isActive: !t.isActive } : t));
    persist(next);
  }

  function submit() {
    const title = draft.title.trim();
    if (!title) return;

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

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.isCore}
              onChange={(e) => setDraft((p) => ({ ...p, isCore: e.target.checked }))}
            />
            <span>最重要タスク（今日の土台）</span>
          </label>

          <label style={{ display: "grid", gap: 4, opacity: draft.isCore ? 0.6 : 1 }}>
            <span>点数（加点タスクのみ有効）</span>
            <input
              type="number"
              value={draft.isCore ? 0 : draft.points}
              disabled={draft.isCore}
              onChange={(e) => setDraft((p) => ({ ...p, points: Number(e.target.value) }))}
              style={{ padding: 8 }}
            />
            {draft.isCore && (
              <small>最重要タスクは「個数に応じて合計100点」なので点数は使いません。</small>
            )}
          </label>

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => setDraft((p) => ({ ...p, isActive: e.target.checked }))}
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

          <small style={{ opacity: 0.7 }}>
            ※タスク名が空だと追加/更新しません（入力ミス防止）
          </small>
        </div>
      </div>

      <h2>タスク一覧</h2>

      {tasks.length === 0 ? (
        <div style={{ opacity: 0.8 }}>まだタスクがありません。上から追加してください。</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {tasks.map((t) => (
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
                <strong style={{ opacity: t.isActive ? 1 : 0.5 }}>
                  {t.title}
                </strong>
                <span style={{ marginLeft: "auto", opacity: 0.7 }}>
                  {t.isCore ? "最重要" : `+${t.points}`}
                </span>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
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

              <small style={{ opacity: 0.6 }}>
                id: {t.id}
              </small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
