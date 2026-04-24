/** Assistant replies shorter than this render immediately (no typewriter). */
export const ASSISTANT_STREAM_MIN_LENGTH = 380;

/**
 * How many characters to add this frame. Ramps up so long answers do not take minutes.
 */
export function nextRevealIncrement(visible: number, total: number): number {
  const remaining = total - visible;
  if (remaining <= 0) return 0;
  const adaptive = Math.max(2, Math.floor(visible / 42) + 3);
  return Math.min(remaining, Math.min(adaptive, 96));
}
