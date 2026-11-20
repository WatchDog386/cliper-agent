/*
 * Active hours for a campaign: "only look for videos between 06:00 and 22:00 UTC".
 * Hours are compared in UTC so a server and its users agree on the window. The window may wrap
 * midnight (22 → 2 means late evening through the small hours). Pure functions, unit-tested.
 */

/** Whether `now` falls inside the campaign's window. No window set (or a full-day one): always. */
export function inRunWindow(fromHour: number | null | undefined, toHour: number | null | undefined, now = new Date()): boolean {
  if (fromHour == null || toHour == null || fromHour === toHour) return true;
  const h = now.getUTCHours();
  return fromHour < toHour ? h >= fromHour && h < toHour : h >= fromHour || h < toHour;
}

/** `now` when already inside the window, otherwise the next moment the window opens. */
export function nextWindowStart(fromHour: number | null | undefined, toHour: number | null | undefined, now = new Date()): Date {
  if (inRunWindow(fromHour, toHour, now)) return now;
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(fromHour ?? 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** "06:00–22:00 UTC" in words, or null when the campaign runs whenever it is due. */
export function describeWindow(fromHour: number | null | undefined, toHour: number | null | undefined): string | null {
  if (fromHour == null || toHour == null || fromHour === toHour) return null;
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return `${hh(fromHour)}–${hh(toHour)} UTC`;
}
