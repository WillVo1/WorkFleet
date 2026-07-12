import type { TaskStatus } from "../types";
import { RunSpinner } from "./Spinner";

/** `spin` states show the blue running spinner; everything else is neutral grey. */
const STYLES: Record<TaskStatus, { label: string; spin?: boolean }> = {
  queued_local: { label: "Queued" },
  queued_remote: { label: "Waiting for slot" },
  running: { label: "Running", spin: true },
  verifying: { label: "Verifying", spin: true },
  succeeded: { label: "Done" },
  done_unverified: { label: "Done" },
  failed: { label: "Error" },
  cancelled: { label: "Stopped" },
};

export function StatusPill({ status }: { status: TaskStatus }) {
  const s = STYLES[status];
  if (s.spin) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
        <RunSpinner size={12} />
        {s.label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
      {s.label}
    </span>
  );
}
