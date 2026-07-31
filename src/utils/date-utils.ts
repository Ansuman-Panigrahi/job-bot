/**
 * Convert relative posted-date string from job portals to a Date object.
 */
export function parsePostedDate(raw: string): Date | null {
  const now = new Date();
  const lowered = raw.trim().toLowerCase();

  if (lowered === 'today' || lowered === 'few hours ago' || lowered === 'just now') {
    return now;
  }

  // "<n> day(s) ago"
  const dayMatch = lowered.match(/^(\d+)\s+day[s]?\s+ago$/);
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10);
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  // "<n> week(s) ago"
  const weekMatch = lowered.match(/^(\d+)\s+week[s]?\s+ago$/);
  if (weekMatch) {
    const weeks = parseInt(weekMatch[1], 10);
    return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
  }

  // "<n>+ weeks ago"
  const plusWeeksMatch = lowered.match(/^(\d+)\+\s*weeks?\s+ago$/);
  if (plusWeeksMatch) {
    const weeks = parseInt(plusWeeksMatch[1], 10);
    return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
  }

  // "<n> month(s) ago"
  const monthMatch = lowered.match(/^(\d+)\s+month[s]?\s+ago$/);
  if (monthMatch) {
    const months = parseInt(monthMatch[1], 10);
    return new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000);
  }

  return null;
}

/**
 * Check if the given date is within the allowed limit (in days).
 * If limitDays is <= 0, returns true (no filter).
 */
export function isFresh(date: Date | null, limitDays: number): boolean {
  if (limitDays <= 0) {
    return true;
  }
  if (!date) {
    // If we can't parse the date, assume it's NOT fresh to be safe.
    return false;
  }
  const cutoff = new Date(Date.now() - limitDays * 24 * 60 * 60 * 1000);
  return date.getTime() >= cutoff.getTime();
}
