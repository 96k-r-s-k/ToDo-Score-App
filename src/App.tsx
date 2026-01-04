import { useState } from "react";
import Today from "./pages/Today";
import Tasks from "./pages/Tasks";
import History from "./pages/History";

type Tab = "today" | "tasks" | "history";

export default function App() {
  const [tab, setTab] = useState<Tab>("today");

  return (
    <div>
      <nav style={{ display: "flex", gap: 8, padding: 12, borderBottom: "1px solid #eee" }}>
        <button onClick={() => setTab("today")} style={{ padding: "8px 12px" }}>
          Today
        </button>
        <button onClick={() => setTab("tasks")} style={{ padding: "8px 12px" }}>
          Tasks
        </button>
        <button onClick={() => setTab("history")} style={{ padding: "8px 12px" }}>
          History
        </button>
      </nav>

      <div style={{ display: tab === "today" ? "block" : "none" }}>
        <Today />
      </div>
      <div style={{ display: tab === "tasks" ? "block" : "none" }}>
        <Tasks />
      </div>
      <div style={{ display: tab === "history" ? "block" : "none" }}>
        <History />
      </div>
    </div>
  );
}
