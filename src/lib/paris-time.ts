// The game runs on French time: the back-office types dates as they read on a
// clock in Paris.

function parisOffset(instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute')) - instant;
}

/** "2026-10-21T09:30" (a datetime-local field) read as a time in Paris; null if malformed. */
export function fromParisDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // Twice, for the hours around a daylight saving change
  let instant = wall - parisOffset(wall);
  instant = wall - parisOffset(instant);
  return new Date(instant);
}

/** The value a datetime-local field shows for this instant, in Paris. */
export function toParisDateTime(date: Date): string {
  const wall = new Date(date.getTime() + parisOffset(date.getTime()));
  return wall.toISOString().slice(0, 16);
}
