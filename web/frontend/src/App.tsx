import { useEffect, useState } from "react";

import { HomeGrid } from "./components/HomeGrid";
import { NewTask } from "./components/NewTask";
import { SessionView } from "./components/SessionView";
import { Sidebar } from "./components/Sidebar";
import { useFleet } from "./hooks/useFleet";

export default function App() {
  const { tasks, events, workers, demoMode, loadTaskDetail, resync } = useFleet();
  const [selected, setSelected] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  // hydrate full event history when a task is opened
  useEffect(() => {
    if (selected) loadTaskDetail(selected);
  }, [selected, loadTaskDetail]);

  const taskList = Object.values(tasks).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  const selectedTask = selected ? tasks[selected] : null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        tasks={taskList}
        workers={workers}
        selected={selected}
        demoMode={demoMode}
        onSelect={setSelected}
        onNewTask={() => setNewTaskOpen(true)}
        onClearCompleted={() => {
          setSelected(null);
          resync();
        }}
      />
      {selectedTask ? (
        <SessionView task={selectedTask} events={events[selectedTask.id] ?? []} />
      ) : (
        <main className="min-w-0 flex-1 overflow-y-auto">
          <HomeGrid tasks={taskList} workers={workers} onSelect={setSelected} />
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
