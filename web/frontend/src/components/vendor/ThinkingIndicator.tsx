import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

interface ThinkingIndicatorProps {
  /** Whether the thinking state is currently active. */
  active: boolean;
  /** When hosted inside an assistant turn's content flow (e.g. the ToolSteps
   *  activity slot), match the active tool-step row's `4px 0` padding and drop
   *  the standalone top margin so "Thinking" lines up with the active tool row. */
  inline?: boolean;
}

const wrapperStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "5px",
  padding: "2px 0",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--og2-secondary-text, #a1a1aa)",
  marginTop: "2px",
};

const inlineWrapperStyle: CSSProperties = {
  padding: "4px 0",
  marginTop: 0,
};

// Solid pulsing text — no gradient. Uses a simple opacity animation to signal
// in-flight work.
export const shimmerStyle: CSSProperties = {
  display: "inline-block",
  color: "var(--og2-secondary-text, #a1a1aa)",
  willChange: "opacity",
  animation: "og2-shimmer 1.2s ease-in-out infinite",
  lineHeight: "inherit",
};

export const SHIMMER_KEYFRAMES = `
  @keyframes og2-shimmer {
    0%, 100% { opacity: 0.4; }
    50%      { opacity: 1; }
  }
`;

/**
 * Thinking indicator — a shimmer "Thinking" text.
 *
 * Detached placement (fresh turn) debounces by 900ms to avoid flashing for
 * fast responses. Inline placement shows immediately: it only ever renders
 * mid-turn, after the turn has already produced a step or text, so work is
 * provably in flight and there is no fast-response to guard against. Debouncing
 * there would just leave a dead gap between a finished step and the shimmer,
 * making the completed-steps row above appear to bounce.
 *
 * All styles are fully inline with CSS-variable hooks so the color
 * adapts to dark/light mode via --og2-secondary-text.
 */
export function ThinkingIndicator({ active, inline }: ThinkingIndicatorProps) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (active) {
      if (inline) {
        setShow(true);
      } else {
        timerRef.current = setTimeout(() => setShow(true), 900);
      }
    } else {
      setShow(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active, inline]);

  if (!show) return null;
  return (
    <>
      <style>{SHIMMER_KEYFRAMES}</style>
      <div style={inline ? { ...wrapperStyle, ...inlineWrapperStyle } : wrapperStyle}>
        <span style={shimmerStyle}>Thinking</span>
      </div>
    </>
  );
}
