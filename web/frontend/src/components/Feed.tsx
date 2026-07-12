import { useEffect, useState } from "react";

import { useTypewriter } from "../hooks/useTypewriter";
import type { FeedEvent } from "../types";
import { SHIMMER_KEYFRAMES, shimmerStyle } from "./vendor/ThinkingIndicator";

interface Props {
  events: FeedEvent[];
  running: boolean;
}

interface Step {
  thought?: FeedEvent;
  action?: FeedEvent;
  thinkMs?: number;
}

/** Group the flat event stream into agent steps (thought -> action). */
function toSteps(events: FeedEvent[]): { steps: Step[]; answer?: FeedEvent } {
  const steps: Step[] = [];
  let answer: FeedEvent | undefined;
  let cur: Step | null = null;

  const flush = () => {
    if (cur) steps.push(cur);
    cur = null;
  };

  for (const e of events) {
    if (e.kind === "thinking") {
      flush();
      cur = { thought: e };
    } else if (e.kind === "action") {
      if (!cur) cur = {};
      cur.action = e;
      if (cur.thought) {
        cur.thinkMs = Date.parse(e.ts) - Date.parse(cur.thought.ts);
      }
      flush();
    } else if (e.kind === "answer") {
      answer = e;
    }
  }
  flush();
  return { steps, answer };
}

const secs = (ms?: number) =>
  ms && ms > 0 ? `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s` : "";


function Thought({ text, ms, live }: { text: string; ms?: number; live: boolean }) {
  const [open, setOpen] = useState(live);
  const shown = useTypewriter(text, live);

  useEffect(() => setOpen(live), [live]);

  if (live) {
    return (
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-400">
        {shown}
        <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-zinc-500" />
      </p>
    );
  }
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="group inline-flex items-center gap-1.5 text-[12px] text-zinc-500 hover:text-zinc-300"
      >
        Thought{secs(ms) && ` for ${secs(ms)}`}
        <svg
          viewBox="0 0 12 12"
          className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M4.5 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-zinc-500">
          {text}
        </p>
      )}
    </div>
  );
}

export function Feed({ events, running }: Props) {
  const { steps, answer } = toSteps(events);

  return (
    <div className="space-y-5">
      <style>{SHIMMER_KEYFRAMES}</style>
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        const liveThought = running && isLast && !s.action;
        return (
          <div key={i} className="relative">
            {s.thought && (
              <Thought text={s.thought.text ?? ""} ms={s.thinkMs} live={liveThought} />
            )}
            {s.action && (
              <div className="mt-1.5 text-[13.5px] text-zinc-100">
                <span className="font-medium">{s.action.text}</span>
              </div>
            )}
          </div>
        );
      })}

      {answer && (
        <div className="ml-5 rounded-lg border border-emerald-800/60 bg-emerald-500/5 px-3.5 py-2.5">
          <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-emerald-500">
            Answer
          </div>
          <div className="text-[13.5px] text-emerald-100">{answer.text}</div>
        </div>
      )}

      {running && !answer && steps.length > 0 && steps[steps.length - 1].action && (
        <div>
          <span style={shimmerStyle}>thinking</span>
        </div>
      )}
    </div>
  );
}
