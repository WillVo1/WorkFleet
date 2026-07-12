export const BLUE = "#00BFFF";

/** Spinning blue arrow — shown while a task is loading / running. */
export function RunSpinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={BLUE}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-spin"
      style={{ animationDuration: "1.1s" }}
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.99 6.57 2.6L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}
