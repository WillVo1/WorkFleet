import type { FeedEvent, Preset, Task, Worker } from "../types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  config: () => fetch("/api/config").then((r) => json<{ demo_mode: boolean; nemoclaw_active: boolean }>(r)),
  presets: () => fetch("/api/presets").then((r) => json<Preset[]>(r)),
  workers: () => fetch("/api/workers").then((r) => json<Worker[]>(r)),
  refreshWorkers: () =>
    fetch("/api/workers/refresh", { method: "POST" }).then((r) => json<Worker[]>(r)),
  resetWorker: (name: string) =>
    fetch(`/api/workers/${encodeURIComponent(name)}/reset`, { method: "POST" }).then((r) =>
      json<{ reset: boolean; summary: string }>(r)
    ),
  tasks: () => fetch("/api/tasks").then((r) => json<Task[]>(r)),
  task: (id: string) =>
    fetch(`/api/tasks/${id}`).then((r) => json<{ task: Task; events: FeedEvent[] }>(r)),
  createTask: (text: string, preset: string | null) =>
    fetch("/api/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, preset }),
    }).then((r) => json<Task>(r)),
  stopTask: (id: string) => fetch(`/api/tasks/${id}/stop`, { method: "POST" }),
  clearCompleted: () => fetch("/api/tasks/clear-completed", { method: "POST" }),
  transcribe: (audio: Blob) =>
    fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": audio.type || "audio/wav" },
      body: audio,
    }).then((r) => json<{ text: string }>(r)),
};
