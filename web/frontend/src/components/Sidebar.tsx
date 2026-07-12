import { api } from "../lib/api";
import type { Task } from "../types";
import { TERMINAL } from "../types";
import { BLUE } from "./Spinner";
import { StatusPill } from "./StatusPill";

type View = "home" | "runs";

interface Props {
  tasks: Task[];
  selected: string | null;
  view: View;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: (id: string | null) => void;
  onNavigate: (view: View) => void;
  onNewTask: () => void;
  onClearCompleted: () => void;
}

export function Sidebar({
  tasks, selected, view, collapsed,
  onToggleCollapse, onSelect, onNavigate, onNewTask, onClearCompleted,
}: Props) {
  const active = tasks.filter((t) => !TERMINAL.includes(t.status));
  const completed = tasks.filter((t) => TERMINAL.includes(t.status));
  const running = active.length;

  async function clearCompleted() {
    await api.clearCompleted();
    onClearCompleted();
  }

  // ── collapsed icon rail ────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside className="flex h-screen w-14 shrink-0 flex-col items-center gap-1 border-r border-zinc-850 bg-zinc-950 py-3">
        <button
          onClick={onToggleCollapse}
          title="Expand sidebar"
          className="flex h-10 w-10 items-center justify-center rounded-sm hover:bg-zinc-900"
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
  const Item = ({ t }: { t: Task }) => (
    <button
      onClick={() => onSelect(t.id)}
      className={`w-full rounded-sm px-3 py-2 text-left text-sm transition-colors ${
        selected === t.id ? "bg-zinc-800" : "hover:bg-zinc-900"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{t.text}</span>
        <StatusPill status={t.status} />
      </div>
      {t.worker && <div className="mt-0.5 text-[11px] text-zinc-500">{t.worker}</div>}
    </button>
  );

  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col border-r border-zinc-850 bg-zinc-950 p-3">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => onNavigate("home")}
          className="flex items-center gap-2 text-left text-lg font-semibold tracking-tight"
        >
          <FleetLogo size={24} />
          Workfleet
        </button>
        <button
          onClick={onToggleCollapse}
          title="Collapse sidebar"
          className="rounded-sm p-1.5 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
        >
          <CollapseIcon />
        </button>
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
        active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
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
          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
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
