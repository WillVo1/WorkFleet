import { useEffect, useRef } from "react";

import { api } from "../lib/api";
import type { FeedEvent, Task } from "../types";
import { screenshotSrc, TERMINAL } from "../types";
import { CompletedSession } from "./CompletedSession";
import { Feed } from "./Feed";
import { StatusPill } from "./StatusPill";

interface Props {
  task: Task;
  events: FeedEvent[];
  onRerun: (task: Task) => void;
}

export function SessionView({ task, events, onRerun }: Props) {
  const running = !TERMINAL.includes(task.status);
  const feedRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  // detect if the user manually scrolled up so we don't fight them
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      userScrolledUp.current = !atBottom;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // scroll to bottom whenever the feed content grows in height
  useEffect(() => {
    const content = contentRef.current;
    const scroller = feedRef.current;
    if (!content || !scroller) return;
    const ro = new ResizeObserver(() => {
      if (!userScrolledUp.current) {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
      }
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  // finished tasks render the tabbed report instead of the live split view
  if (!running) {
    return <CompletedSession task={task} events={events} onRerun={onRerun} />;
  }

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-zinc-850 px-6 py-3">
        <h1 className="truncate text-[13.5px] font-medium text-zinc-100">{task.text}</h1>
        <StatusPill status={task.status} />
        <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-zinc-500">
          {task.worker && <span>{task.worker}</span>}
          {task.steps > 0 && <span>{task.steps} steps</span>}
          {task.cost_usd > 0 && <span>${task.cost_usd.toFixed(3)}</span>}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* live view: newest frame */}
        <div className="flex w-[62%] items-start justify-center bg-black p-5">
          {task.last_screenshot_url ? (
            <div className="flex flex-col items-end gap-3">
              <img
                src={screenshotSrc(task.last_screenshot_url)}
                alt="live desktop"
                className="max-h-full max-w-full rounded-lg border border-zinc-850 shadow-2xl"
              />
              {running && (
                <button
                  onClick={() => api.stopTask(task.id)}
                  className="rounded-sm border border-zinc-700 px-3 py-1 text-[12px] text-zinc-300 transition-colors hover:border-red-800 hover:bg-red-950/40 hover:text-red-300"
                >
                  Stop
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-[13px] text-zinc-600">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-600" />
                {task.status === "queued_remote"
                  ? "waiting for a free session slot…"
                  : "connecting to the agent…"}
              </div>
              {running && (
                <button
                  onClick={() => api.stopTask(task.id)}
                  className="rounded-sm border border-zinc-700 px-3 py-1 text-[12px] text-zinc-300 transition-colors hover:border-red-800 hover:bg-red-950/40 hover:text-red-300"
                >
                  Stop
                </button>
              )}
            </div>
          )}
        </div>

        {/* streaming agent feed */}
        <div
          ref={feedRef}
          className="min-h-0 w-[38%] overflow-y-auto border-l border-zinc-850 px-5 py-4"
        >
          <div ref={contentRef}>
            <Feed events={events} running={running && task.status === "running"} />
          </div>
        </div>
      </div>
    </div>
  );
}
