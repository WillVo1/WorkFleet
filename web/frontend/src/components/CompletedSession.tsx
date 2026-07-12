import { useEffect, useMemo, useRef, useState } from "react";

import { duration, fullTime } from "../lib/format";
import type { FeedEvent, Task } from "../types";
import { screenshotSrc } from "../types";
import { StatusPill } from "./StatusPill";

interface Props {
  task: Task;
  events: FeedEvent[];
  onRerun: (task: Task) => void;
}

type Tab = "overview" | "output" | "inputs" | "recording" | "code";

const TABS: { key: Tab; label: string; code?: boolean }[] = [
  { key: "overview", label: "Overview" },
  { key: "output", label: "Output" },
  { key: "inputs", label: "Inputs" },
  { key: "recording", label: "Recording" },
  { key: "code", label: "Code", code: true },
];

export function CompletedSession({ task, events, onRerun }: Props) {
  const [tab, setTab] = useState<Tab>("recording");

  // screenshot frames (fallback to the last live frame) → the "recording"
  const frames = useMemo(() => {
    const shots = events
      .filter((e) => e.kind === "screenshot" && e.image_url)
      .map((e) => e.image_url as string);
    if (shots.length) return shots;
    return task.last_screenshot_url ? [task.last_screenshot_url] : [];
  }, [events, task.last_screenshot_url]);

  const actions = useMemo(
    () => events.filter((e) => e.kind === "action"),
    [events]
  );

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-8 py-10">
        {/* title + rerun */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-zinc-50">
              {task.text}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] text-zinc-500">
              <span>
                <span className="text-zinc-600">Started:</span>{" "}
                {fullTime(task.created_at)}
              </span>
              <span>
                <span className="text-zinc-600">Finished:</span>{" "}
                {fullTime(task.finished_at)}
              </span>
            </div>
          </div>
          <button
            onClick={() => onRerun(task)}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2.5 text-[13px] font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-white"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Rerun
          </button>
        </div>

        {/* tabs */}
        <div className="mt-8 inline-flex items-center gap-1 rounded-xl border border-zinc-850 bg-zinc-950/60 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-4 py-2 text-[13.5px] font-medium transition-colors ${
                tab === t.key
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {t.code && <span className="mr-1 font-mono opacity-60">{"</>"}</span>}
              {t.label}
            </button>
          ))}
        </div>

        {/* panels */}
        <div className="mt-6">
          {tab === "overview" && <Overview task={task} />}
          {tab === "output" && <Output task={task} />}
          {tab === "inputs" && <Inputs task={task} />}
          {tab === "recording" && <Recording frames={frames} />}
          {tab === "code" && <Code actions={actions} task={task} />}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
        {label}
      </div>
      <div className="text-[14px] text-zinc-200">{children}</div>
    </div>
  );
}

function Overview({ task }: { task: Task }) {
  const ok = task.status === "succeeded" || task.status === "done_unverified";
  return (
    <div className="space-y-5">
      {task.verification && (
        <div className="rounded-xl border border-zinc-850 bg-zinc-950/50 px-4 py-3 text-[13.5px] text-zinc-300">
          {ok ? "✓ " : "✗ "}
          {task.verification}
        </div>
      )}
      <div className="grid grid-cols-2 gap-5 rounded-xl border border-zinc-850 bg-zinc-950/50 p-5 sm:grid-cols-3">
        <Field label="Status">
          <StatusPill status={task.status} />
        </Field>
        <Field label="Duration">{duration(task.created_at, task.finished_at)}</Field>
        <Field label="Worker">{task.worker ?? "—"}</Field>
        <Field label="Steps">{task.steps || "—"}</Field>
        <Field label="Cost">
          {task.cost_usd > 0 ? `$${task.cost_usd.toFixed(3)}` : "—"}
        </Field>
        <Field label="Preset">{task.preset ?? "—"}</Field>
      </div>
    </div>
  );
}

function Output({ task }: { task: Task }) {
  const text = task.answer || task.outcome;
  if (!text) return <Empty>No output was produced by this run.</Empty>;
  return (
    <div className="rounded-xl border border-zinc-850 bg-zinc-950/50 p-5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-500">
        Answer
      </div>
      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-100">
        {text}
      </p>
    </div>
  );
}

function Inputs({ task }: { task: Task }) {
  return (
    <div className="space-y-5 rounded-xl border border-zinc-850 bg-zinc-950/50 p-5">
      <Field label="Task">{task.text}</Field>
      {task.preset && <Field label="Preset">{task.preset}</Field>}
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
          Prompt
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-zinc-850 bg-black/40 p-3.5 font-mono text-[12.5px] leading-relaxed text-zinc-300">
          {task.prompt || "—"}
        </pre>
      </div>
    </div>
  );
}

/**
 * The agent captures a screenshot per step (there is no server-side video), so
 * the "recording" is those frames played back like a video — play/pause,
 * auto-advance, and a scrubbable timeline.
 */
function Recording({ frames }: { frames: string[] }) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const single = frames.length <= 1;

  useEffect(() => {
    if (!playing || single) return;
    timer.current = setInterval(() => {
      setIdx((i) => {
        if (i >= frames.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 900);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, single, frames.length]);

  if (frames.length === 0)
    return <Empty>No recording is available for this run.</Empty>;

  const toggle = () => {
    if (single) return;
    // restart from the top if we're paused at the end
    if (!playing && idx >= frames.length - 1) setIdx(0);
    setPlaying((p) => !p);
  };

  return (
    <div>
      <div className="mb-2 text-[13px] text-zinc-500">
        {single ? "Recording" : `Frame ${idx + 1} of ${frames.length}`}
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-850 bg-black">
        <div className="flex items-center justify-center">
          <img
            src={screenshotSrc(frames[idx])}
            alt={`recording frame ${idx + 1}`}
            className="max-h-[62vh] w-full object-contain"
          />
        </div>
        {/* transport bar */}
        <div className="flex items-center gap-3 border-t border-zinc-850 bg-zinc-950 px-3 py-2.5">
          <button
            onClick={toggle}
            disabled={single}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900 transition-colors hover:bg-white disabled:opacity-40"
            title={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={idx}
            disabled={single}
            onChange={(e) => {
              setPlaying(false);
              setIdx(Number(e.target.value));
            }}
            className="h-1 flex-1 cursor-pointer accent-[#00BFFF] disabled:opacity-40"
          />
          <span className="w-14 shrink-0 text-right font-mono text-[11px] text-zinc-500">
            {idx + 1}/{frames.length}
          </span>
        </div>
      </div>
    </div>
  );
}

function Code({ actions, task }: { actions: FeedEvent[]; task: Task }) {
  if (actions.length === 0)
    return <Empty>No actions were recorded for this run.</Empty>;
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-850 bg-black/50">
      <div className="border-b border-zinc-850 px-4 py-2 font-mono text-[11px] text-zinc-500">
        {actions.length} steps · {task.worker ?? "agent"}
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-zinc-300">
        {actions
          .map((a, i) => {
            const call = a.tool
              ? `${a.tool}(${a.args ? JSON.stringify(a.args) : ""})`
              : a.text ?? "";
            return `${String(i + 1).padStart(2, " ")}  ${call}`;
          })
          .join("\n")}
      </pre>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-850 px-4 py-10 text-center text-[13px] text-zinc-600">
      {children}
    </div>
  );
}
