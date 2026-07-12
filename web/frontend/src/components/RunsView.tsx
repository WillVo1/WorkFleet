import type { Task } from "../types";
import { screenshotSrc, TERMINAL } from "../types";
import { StatusPill } from "./StatusPill";

interface Props {
  tasks: Task[];
  onSelect: (id: string) => void;
  onNewTask: () => void;
}

/** Runs tab: active runs only, as a grid of live tiles (up to 4 columns). */
export function RunsView({ tasks, onSelect }: Props) {
  const active = tasks.filter((t) => !TERMINAL.includes(t.status));

  if (active.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-zinc-600">
        No active runs.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 p-6 lg:grid-cols-2 2xl:grid-cols-3">
      {active.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 text-left transition-all hover:border-zinc-700 hover:ring-2 hover:ring-zinc-800"
        >
          <div className="relative aspect-[16/10] bg-black">
            {t.last_screenshot_url ? (
              <img
                src={screenshotSrc(t.last_screenshot_url)}
                alt="agent desktop"
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <div className="flex h-full items-center justify-center gap-1.5 text-[12px] text-zinc-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-600" />
                connecting…
              </div>
            )}
            <div className="absolute left-2.5 top-2.5 rounded-md bg-black/70 px-2 py-1 backdrop-blur">
              <StatusPill status={t.status} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
            <span className="truncate text-[13px] text-zinc-200">{t.text}</span>
            <span className="shrink-0 font-mono text-[10.5px] text-zinc-600">
              {t.steps > 0 && `${t.steps} · $${t.cost_usd.toFixed(3)}`}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
