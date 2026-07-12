import { useState } from "react";

import { api } from "../lib/api";
import type { Task, Worker } from "../types";
import { TERMINAL } from "../types";
import { BLUE } from "./Spinner";
import { StatusPill } from "./StatusPill";

type View = "home" | "runs";

interface Props {
  tasks: Task[];
  workers: Worker[];
  selected: string | null;
  view: View;
  collapsed: boolean;
  demoMode: boolean;
  onToggleCollapse: () => void;
  onSelect: (id: string | null) => void;
  onNavigate: (view: View) => void;
  onNewTask: () => void;
  onDelete: (id: string) => void;
  onClearCompleted: () => void;
}

export function Sidebar({
  tasks, workers, selected, view, collapsed, demoMode,
  onToggleCollapse, onSelect, onNavigate, onNewTask, onDelete, onClearCompleted,
}: Props) {
  const active = tasks.filter((t) => !TERMINAL.includes(t.status));
  const completed = tasks.filter((t) => TERMINAL.includes(t.status));
  const running = active.length;
  const [resetting, setResetting] = useState<string | null>(null);

  async function clearCompleted() {
    await api.clearCompleted();
    onClearCompleted();
  }

  async function resetWorker(name: string) {
    if (resetting) return;
    setResetting(name);
    try {
      await api.resetWorker(name);
    } catch {
      /* surfaced server-side; keep the UI quiet on failure */
    } finally {
      setResetting(null);
    }
  }

  // ── collapsed icon rail ────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside className="flex h-screen w-14 shrink-0 flex-col items-center gap-1 bg-zinc-900 py-3">
        <button
          onClick={onToggleCollapse}
          title="Expand sidebar"
          className="flex h-10 w-10 items-center justify-center rounded-sm hover:bg-zinc-850"
        >
          <FleetLogo size={26} />
        </button>
        <div className="my-1 h-px w-6 bg-zinc-850" />
        <RailButton
          title="Home"
          active={view === "home" && !selected}
          onClick={() => onNavigate("home")}
        >
          <HomeIcon />
        </RailButton>
        <RailButton
          title="Runs"
          active={view === "runs"}
          onClick={() => onNavigate("runs")}
          badge={running > 0 ? running : undefined}
        >
          <RunsIcon />
        </RailButton>
        <div className="my-1 h-px w-6 bg-zinc-850" />
        <RailButton title="New task" onClick={onNewTask} accent>
          <PlusIcon />
        </RailButton>
      </aside>
    );
  }

  // ── expanded sidebar ───────────────────────────────────────────────
  const Item = ({ t }: { t: Task }) => {
    const done = TERMINAL.includes(t.status);
    return (
      <div className="group relative">
        <button
          onClick={() => onSelect(t.id)}
          className={`w-full rounded-sm px-3 py-2 pr-9 text-left text-sm transition-colors ${
            selected === t.id ? "bg-zinc-800" : "hover:bg-zinc-850"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{t.text}</span>
            <StatusPill status={t.status} />
          </div>
          {t.worker && <div className="mt-0.5 text-[11px] text-zinc-500">{t.worker}</div>}
        </button>
        {done && (
          <button
            onClick={() => onDelete(t.id)}
            title="Delete session"
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-sm bg-zinc-850 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-red-400 group-hover:opacity-100"
          >
            <TrashIcon />
          </button>
        )}
      </div>
    );
  };

  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col bg-zinc-900 p-3 pt-8">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => onNavigate("home")}
          className="flex items-center gap-2 text-left text-lg font-semibold tracking-tight"
        >
          <FleetLogo size={24} />
          Workfleet
        </button>
        <div className="flex items-center gap-2">
          {demoMode && (
            <span
              title="Demo mode: each worker's desktop is reset to a clean baseline before every task"
              className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400"
            >
              Demo
            </span>
          )}
          <button
            onClick={onToggleCollapse}
            title="Collapse sidebar"
            className="rounded-sm p-1.5 text-zinc-500 hover:bg-zinc-850 hover:text-zinc-200"
          >
            <CollapseIcon />
          </button>
        </div>
      </div>

      {/* nav */}
      <nav className="mb-3 space-y-0.5">
        <NavItem
          label="Home"
          icon={<HomeIcon />}
          active={view === "home" && !selected}
          onClick={() => onNavigate("home")}
        />
        <NavItem
          label="Runs"
          icon={<RunsIcon />}
          active={view === "runs"}
          badge={running || undefined}
          onClick={() => onNavigate("runs")}
        />
      </nav>

      <button
        onClick={onNewTask}
        className="mb-4 rounded-sm bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
      >
        + New task
      </button>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {active.length > 0 && (
          <section>
            <h3 className="mb-1 px-1 text-[11px] font-semibold uppercase text-zinc-500">
              Active
            </h3>
            {active.map((t) => <Item key={t.id} t={t} />)}
          </section>
        )}
        {active.length > 0 && completed.length > 0 && (
          <div className="mx-1 h-px bg-zinc-850" />
        )}
        {completed.length > 0 && (
          <section>
            <div className="mb-1 flex items-center justify-between px-1">
              <h3 className="text-[11px] font-semibold uppercase text-zinc-500">
                Completed
              </h3>
              <button
                onClick={clearCompleted}
                className="text-[11px] text-zinc-600 hover:text-zinc-300"
              >
                Clear
              </button>
            </div>
            {completed.map((t) => <Item key={t.id} t={t} />)}
          </section>
        )}
      </div>

      <footer className="mt-3 shrink-0 border-t border-zinc-850 pt-2">
        <h3 className="mb-1 text-[11px] font-semibold uppercase text-zinc-500">Workers</h3>
        {workers.map((w) => (
          <div
            key={w.name}
            className="group flex items-center gap-2 py-0.5 text-xs text-zinc-400"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                w.status === "idle" ? "bg-emerald-500"
                : w.status === "busy" ? "bg-blue-500"
                : "bg-zinc-600"
              }`}
            />
            {w.name}
            {demoMode && (
              <button
                onClick={() => resetWorker(w.name)}
                disabled={resetting === w.name || w.status === "busy"}
                title="Reset this worker's desktop to the clean baseline"
                className="ml-auto text-[11px] text-zinc-600 opacity-0 transition-opacity hover:text-amber-400 disabled:text-zinc-700 group-hover:opacity-100 disabled:opacity-100"
              >
                {resetting === w.name ? "resetting…" : "reset"}
              </button>
            )}
            <span className={`text-zinc-600 ${demoMode ? "" : "ml-auto"}`}>{w.status}</span>
          </div>
        ))}
      </footer>
    </aside>
  );
}

/** Brand mark: a thin lightning-blue circle. */
function FleetLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="17" stroke={BLUE} strokeWidth="2.5" fill="none" />
    </svg>
  );
}

function NavItem({
  label, icon, active, badge, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm transition-colors ${
        active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-850 hover:text-zinc-100"
      }`}
    >
      <span className="text-zinc-500">{icon}</span>
      {label}
      {badge != null && (
        <span className="ml-auto rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
          {badge}
        </span>
      )}
    </button>
  );
}

function RailButton({
  children, title, active, accent, badge, onClick,
}: {
  children: React.ReactNode;
  title: string;
  active?: boolean;
  accent?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`relative flex h-10 w-10 items-center justify-center rounded-sm transition-colors ${
        accent
          ? "bg-zinc-100 text-zinc-900 hover:bg-white"
          : active
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-850 hover:text-zinc-100"
      }`}
    >
      {children}
      {badge != null && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-700 px-1 text-[9px] font-semibold text-zinc-100">
          {badge}
        </span>
      )}
    </button>
  );
}

/* ── icons ─────────────────────────────────────────────────────────── */
const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}
function RunsIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function CollapseIcon() {
  return (
    <svg {...iconProps} width={16} height={16}>
      <path d="M15 6l-6 6 6 6" />
      <path d="M9 6v12" opacity={0.5} />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg {...iconProps} width={13} height={13}>
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
    </svg>
  );
}
