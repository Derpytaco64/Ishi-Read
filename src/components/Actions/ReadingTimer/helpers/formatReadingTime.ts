export interface ReadingTimeUnitLabels {
  seconds: string;
  minutes: string;
  hours: string;
}

// CLAUDE-ADDED: Mirrors the audio player's SleepTimer badge format (single largest unit) -- keeps the
// live-updating label short enough to fit under a 24px icon. Seconds tick visibly until the first
// minute, then the display coarsens the same way a stopwatch reads at a glance.
export function formatReadingTime(totalSeconds: number, units: ReadingTimeUnitLabels): string {
  if (totalSeconds < 60) return `${ totalSeconds }${ units.seconds }`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${ totalMinutes }${ units.minutes }`;

  const hours = Math.floor(totalMinutes / 60);
  return `${ hours }${ units.hours }`;
}

// CLAUDE-ADDED: Full h/m/s breakdown (no rounding to a single unit) for the "exact" state the timer
// panel and the Completed Read Times list show -- unlike the header badge, this needs every second
// represented since the panel is meant to be read precisely, not glanced at.
export function formatFullReadingTime(totalSeconds: number, units: ReadingTimeUnitLabels): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${ hours }${ units.hours }`);
  if (hours > 0 || minutes > 0) parts.push(`${ minutes }${ units.minutes }`);
  parts.push(`${ seconds }${ units.seconds }`);

  return parts.join(" ");
}

// CLAUDE-ADDED: h/m only, rounded to the nearest minute -- for the "time left in book" estimate,
// which (unlike the exact elapsed-time readouts above) is inherently approximate, so showing seconds
// would imply a precision the underlying words-per-minute estimate doesn't have.
export function formatEstimatedTime(totalSeconds: number, units: ReadingTimeUnitLabels): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${ minutes }${ units.minutes }`;

  return `${ hours }${ units.hours } ${ minutes }${ units.minutes }`;
}
