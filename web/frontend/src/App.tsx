import { useCallback, useEffect, useState } from "react";

import { FleetTree } from "./components/FleetTree";
import { NewTask } from "./components/NewTask";
import { RunsView } from "./components/RunsView";
import { SessionView } from "./components/SessionView";
import { Sidebar } from "./components/Sidebar";
import { useFleet } from "./hooks/useFleet";
import { api } from "./lib/api";
import type { Task } from "./types";

type View = "home" | "runs";

export default function App() {
  const { tasks, events, workers, demoMode, loadTaskDetail, resync } = useFleet();
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [collapsed, setCollapsed] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  // hydrate full event history when a task is opened
  useEffect(() => {
    if (selected) loadTaskDetail(selected);
  }, [selected, loadTaskDetail]);

  const taskList = Object.values(tasks).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  const selectedTask = selected ? tasks[selected] : null;

  const navigate = useCallback((v: View) => {
    setView(v);
    setSelected(null);
  }, []);

  const rerun = useCallback(async (task: Task) => {
    const fresh = await api.createTask(task.text, task.preset);
    setSelected(fresh.id);
  }, []);

  const deleteTask = useCallback(
    async (id: string) => {
      await api.deleteTask(id);
      setSelected((cur) => (cur === id ? null : cur));
      resync();
    },
    [resync]
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        tasks={taskList}
        workers={workers}
        selected={selected}
        view={view}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        demoMode={demoMode}
        onSelect={setSelected}
        onNavigate={navigate}
        onNewTask={() => setNewTaskOpen(true)}
        onDelete={deleteTask}
        onClearCompleted={() => {
          setSelected(null);
          resync();
        }}
      />

      {selectedTask ? (
        <SessionView
          task={selectedTask}
          events={events[selectedTask.id] ?? []}
          onRerun={rerun}
        />
      ) : view === "runs" ? (
        <main className="min-w-0 flex-1 overflow-y-auto">
          <RunsView
            tasks={taskList}
            onSelect={setSelected}
            onNewTask={() => setNewTaskOpen(true)}
          />
        </main>
      ) : (
        <main className="min-w-0 flex-1 overflow-hidden">
          <FleetTree
            tasks={taskList}
            workers={workers}
            onSelect={setSelected}
            onNewTask={() => setNewTaskOpen(true)}
          />
        </main>
      )}

      <NewTask
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        onCreated={(id) => setSelected(id)}
      />
    </div>
  );
}
