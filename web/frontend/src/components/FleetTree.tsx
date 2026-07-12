import { useEffect, useRef, useState } from "react";

import { api } from "../lib/api";
import { MicRecorder } from "../lib/recorder";
import type { Preset, Task, Worker } from "../types";
import { screenshotSrc, TERMINAL } from "../types";
import { BLUE } from "./Spinner";
import { StatusPill } from "./StatusPill";

interface Props {
  tasks: Task[];
  workers: Worker[];
  onSelect: (id: string) => void;
  onNewTask: () => void;
}

/* Stage coordinate system — the branch SVG uses this viewBox, and node cards
   are positioned in the same px space so branches land exactly on them. */
const W = 1000;
const H = 560;
const ORIGIN = { x: 500, y: 410 }; // top-center of the laptop screen
const CARD = { w: 304, h: 200 };
const ANCHOR_Y = 220; // where a branch meets the bottom of its card
const SLOTS = [168, 500, 832].map((cx) => ({
  cx,
  left: cx - CARD.w / 2,
  top: ANCHOR_Y - CARD.h,
  branch: `M${ORIGIN.x},${ORIGIN.y} C ${ORIGIN.x},340 ${cx},310 ${cx},${ANCHOR_Y}`,
}));

type MicState = "idle" | "recording" | "transcribing";

/** Home hero: replica "screens" grow out of your computer as a tree. */
export function FleetTree({ tasks, workers, onSelect, onNewTask }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [mic, setMic] = useState<MicState>("idle");
  const recorderRef = useRef<MicRecorder | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.presets().then(setPresets);
  }, []);

  const active = tasks
    .filter((t) => !TERMINAL.includes(t.status))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const capacity = workers.length || SLOTS.length;
  const occupied = Math.min(active.length, capacity);
  const full = occupied >= capacity;

  async function dispatch(override?: string) {
    const body = (override ?? text).trim();
    if (busy || full || !body) return;
    setBusy(true);
    try {
      await api.createTask(body, null); // WebSocket pushes the new task → fills a slot
      setText("");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMic() {
    if (mic === "idle") {
      try {
        const rec = new MicRecorder();
        await rec.start();
        recorderRef.current = rec;
        setMic("recording");
      } catch {
        /* mic unavailable — silently no-op for the demo */
      }
      return;
    }
    if (mic === "recording") {
      setMic("transcribing");
      try {
        const wav = await recorderRef.current!.stop();
        const { text: transcript } = await api.transcribe(wav);
        if (transcript) setText((p) => (p ? `${p.trimEnd()} ${transcript}` : transcript));
      } catch {
        /* transcription failed — no-op */
      } finally {
        recorderRef.current = null;
        setMic("idle");
        inputRef.current?.focus();
      }
    }
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden px-6">
      {/* ambient glow for depth */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 40%, rgba(0,191,255,0.06), transparent 70%)",
        }}
      />

      {/* headline */}
      <div className="relative z-10 pt-12 text-center">
        <h1 className="bg-gradient-to-b from-white via-white to-zinc-500 bg-clip-text text-[42px] font-semibold leading-[1.05] tracking-[-0.02em] text-transparent">
          Clones your computer
        </h1>
        <p className="mt-3.5 text-[16px] font-medium tracking-tight text-zinc-400">
          Files, apps,{" "}
          <span
            className="bg-gradient-to-r bg-clip-text text-transparent"
            style={{ backgroundImage: `linear-gradient(90deg, ${BLUE}, #7dd3fc)` }}
          >
            everything.
          </span>
        </p>
      </div>

      {/* centered hero: tree + command bar */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">

      {/* ── the tree stage ─────────────────────────────────────────── */}
      <div className="relative" style={{ width: W, height: H, maxWidth: "100%" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="pointer-events-none absolute inset-0 h-full w-full"
          fill="none"
        >
          {SLOTS.map((s, i) => {
            const filled = i < occupied;
            return (
              <path
                key={i}
                d={s.branch}
                pathLength={100}
                className={filled ? "fleet-branch" : undefined}
                stroke={filled ? BLUE : "#27272a"}
                strokeWidth={filled ? 2 : 1.5}
                strokeLinecap="round"
                strokeDasharray={filled ? undefined : "5 7"}
                opacity={filled ? 0.9 : 1}
              />
            );
          })}
          <Laptop />
        </svg>

        {SLOTS.map((s, i) => {
          const task = active[i];
          const style = {
            position: "absolute" as const,
            left: s.left,
            top: s.top,
            width: CARD.w,
            height: CARD.h,
          };
          if (!task) return <GhostSlot key={i} style={style} />;
          return (
            <button
              key={task.id}
              onClick={() => onSelect(task.id)}
              style={style}
              className="fleet-node group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70 text-left shadow-xl shadow-black/40 backdrop-blur transition-all hover:border-zinc-600 hover:ring-2 hover:ring-zinc-800"
            >
              <div className="relative h-[162px] w-full bg-black">
                {task.last_screenshot_url ? (
                  <img
                    src={screenshotSrc(task.last_screenshot_url)}
                    alt="replica desktop"
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center gap-1.5 text-[11px] text-zinc-600">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-600" />
                    connecting…
                  </div>
                )}
                <div className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 backdrop-blur">
                  <StatusPill status={task.status} />
                </div>
              </div>
              <div className="flex items-center gap-2 px-2.5 py-2">
                <span className="truncate text-[12px] text-zinc-200">{task.text}</span>
                {task.steps > 0 && (
                  <span className="ml-auto shrink-0 font-mono text-[9.5px] text-zinc-600">
                    {task.steps}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── command card ───────────────────────────────────────────── */}
      <div className="relative z-10 mt-5 w-full max-w-2xl">
        {/* blue glow radiating straight from the card edges (no gap) */}
        <div
          className={`relative rounded-[22px] border bg-zinc-900/80 backdrop-blur transition-colors ${
            full ? "border-zinc-800" : "border-zinc-700 focus-within:border-zinc-500"
          }`}
          style={{
            boxShadow:
              "0 0 24px rgba(0,191,255,0.45), 0 0 64px rgba(0,191,255,0.25), 0 20px 40px rgba(0,0,0,0.5)",
          }}
        >
          <input
            ref={inputRef}
            value={text}
            disabled={full || busy}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "Enter") dispatch();
            }}
            placeholder={
              full ? "Fleet full — free a replica to dispatch more" : "What should we work on next?"
            }
            className="w-full bg-transparent px-5 pt-4 text-[15px] text-zinc-100 placeholder:text-zinc-500 outline-none disabled:cursor-not-allowed"
          />

          {/* toolbar */}
          <div className="flex items-center gap-2 px-3 pb-3 pt-3">
            <button
              onClick={onNewTask}
              title="More options"
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            >
              <PlusIcon />
            </button>

            <div
              className={`flex items-center gap-1.5 rounded-full bg-zinc-800/70 px-3 py-1.5 text-[13px] font-medium ${
                full ? "text-amber-400/90" : "text-zinc-200"
              }`}
            >
              <MonitorIcon size={15} />
              Computer
              <span className="ml-0.5 text-[12px] font-normal text-zinc-400">
                {occupied}/{capacity}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={toggleMic}
                disabled={mic === "transcribing" || busy}
                title={mic === "recording" ? "Stop dictation" : "Dictate"}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:opacity-60 ${
                  mic === "recording"
                    ? "animate-pulse border-red-500 bg-red-500/20 text-red-400"
                    : "border-zinc-700 bg-zinc-800 text-zinc-200 hover:border-zinc-500 hover:text-white"
                }`}
              >
                {mic === "transcribing" ? <MiniSpinner /> : <WaveIcon />}
              </button>

              <button
                onClick={() => dispatch()}
                disabled={full || busy || !text.trim()}
                title="Dispatch task"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
              >
                <ArrowUpIcon />
              </button>
            </div>
          </div>
        </div>

        {/* ── suggestions: stacked, popping out of the bar's top-left ── */}
        {presets.length > 0 && focused && (
          <div className="absolute bottom-full left-0 mb-3 flex flex-col items-start gap-2">
            {presets.slice(0, 4).map((p, i, arr) => (
              <button
                key={p.key}
                onClick={() => dispatch(p.label)}
                disabled={full || busy}
                style={{ animationDelay: `${(arr.length - 1 - i) * 45}ms` }}
                className="fleet-pop group flex max-w-sm items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/80 py-2.5 pl-4 pr-4 text-left shadow-lg shadow-black/40 backdrop-blur transition-all hover:-translate-y-px hover:border-zinc-700 hover:bg-zinc-900 disabled:opacity-50"
              >
                <span className="truncate text-[13px] text-zinc-300 transition-colors group-hover:text-zinc-100">
                  {p.label}
                </span>
                <span className="ml-auto shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100">
                  <ArrowUpRightIcon />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

/** Empty branch endpoint: a dim dashed frame so the 3-slot cap reads upfront. */
function GhostSlot({ style }: { style: React.CSSProperties }) {
  return (
    <div
      style={style}
      className="flex items-center justify-center rounded-xl border border-dashed border-zinc-800/80"
    >
      <div className="flex flex-col items-center gap-1.5 text-zinc-700">
        <MonitorIcon />
        <span className="text-[10px] uppercase tracking-wide">idle</span>
      </div>
    </div>
  );
}

/** Your computer — the root the tree grows from. */
function Laptop() {
  return (
    <g>
      {/* screen lid */}
      <rect x={433} y={410} width={134} height={96} rx={9} fill="#0e0e10" stroke="#3f3f46" strokeWidth={1.8} />
      {/* webcam */}
      <circle cx={500} cy={415} r={1.2} fill="#52525b" />
      {/* screen glass */}
      <rect x={441} y={419} width={118} height={72} rx={3} fill="#141417" stroke="#26262b" strokeWidth={1} />

      {/* keyboard deck — its top edge meets the screen bottom, so they're joined */}
      <path
        d="M433 506 H567 L591 524 Q594 528 589 528 H411 Q406 528 409 524 Z"
        fill="#1b1b1e"
        stroke="#3f3f46"
        strokeWidth={1.4}
      />
      {/* keyboard hint + thumb scoop */}
      <rect x={460} y={511} width={80} height={7} rx={2} fill="#26262b" />
      <path d="M486 528 Q500 533 514 528" fill="none" stroke="#3f3f46" strokeWidth={1.5} />
    </g>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function MonitorIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...iconProps}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width={18} height={18} {...iconProps} strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width={17} height={17} {...iconProps} strokeWidth={2.2}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg width={15} height={15} {...iconProps} strokeWidth={2}>
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

/** Waveform glyph for the dictation button (matches the reference's voice control). */
function WaveIcon() {
  return (
    <svg width={17} height={17} {...iconProps} strokeWidth={2}>
      <path d="M4 11v2M8 8v8M12 5v14M16 8v8M20 11v2" />
    </svg>
  );
}

function MiniSpinner() {
  return (
    <svg className="animate-spin" width={16} height={16} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
