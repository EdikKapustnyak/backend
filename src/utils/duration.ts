const UNIT_TO_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Parses simple duration strings like "15m", "7d", "30s" into milliseconds.
 * Falls back to 0 if the format is not recognized.
 */
export function durationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) return 0;

  const [, valueStr, unit] = match;
  const value = Number(valueStr);
  const unitMs = UNIT_TO_MS[unit as string] ?? 0;
  return value * unitMs;
}
