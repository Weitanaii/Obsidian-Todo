import type { PlanKind } from "../models/Task";

export function getISOWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function getISOWeekYear(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  return date.getUTCFullYear();
}

export function getISOWeekRange(year: number, week: number): { start: Date; end: Date } {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return { start: weekStart, end: weekEnd };
}

export function currentPeriodKey(kind: PlanKind): string {
  const now = new Date();
  const y = now.getFullYear();
  switch (kind) {
    case "year": return String(y);
    case "quarter": return y + "-Q" + (Math.floor(now.getMonth() / 3) + 1);
    case "month": return y + "-" + String(now.getMonth() + 1).padStart(2, "0");
    case "week": return getISOWeekYear(now) + "-W" + String(getISOWeekNumber(now)).padStart(2, "0");
  }
}

export function periodLabel(kind: PlanKind, key: string): string {
  switch (kind) {
    case "year": return key + "\u5e74\u8ba1\u5212";
    case "quarter": {
      const parts = key.split("-Q");
      return parts[0] + " Q" + parts[1] + " \u8ba1\u5212";
    }
    case "month": {
      const mp = key.split("-");
      return mp[0] + "." + mp[1] + " \u6708\u5ea6\u8ba1\u5212";
    }
    case "week": {
      const wp = key.split("-W");
      return wp[0] + " W" + wp[1] + " \u5468\u8ba1\u5212";
    }
  }
}

export function subGroupLabel(kind: PlanKind, key: string): string {
  switch (kind) {
    case "quarter": {
      const qn = key.split("-Q")[1];
      return "Q" + qn + " \u5b63\u5ea6\u8ba1\u5212";
    }
    case "week": {
      const wn = key.split("-W")[1];
      return "W" + wn + " \u5468\u8ba1\u5212";
    }
    default: return periodLabel(kind, key);
  }
}

export function currentSubPeriodKeys(kind: PlanKind): string[] {
  const now = new Date();
  if (kind === "year") {
    const y = String(now.getFullYear());
    return [y + "-Q1", y + "-Q2", y + "-Q3", y + "-Q4"];
  }
  if (kind === "month") {
    const y = now.getFullYear();
    const m = now.getMonth();
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    const weekSet = new Set<string>();
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      const wy = getISOWeekYear(d);
      const wn = getISOWeekNumber(d);
      weekSet.add(wy + "-W" + String(wn).padStart(2, "0"));
    }
    return Array.from(weekSet).sort();
  }
  return [];
}

export function periodKeySort(kind: PlanKind, keys: string[]): string[] {
  return keys.slice().sort((a, b) => {
    if (kind === "year" || kind === "month") {
      return b.localeCompare(a);
    }
    const numA = parseInt(a.split("-")[1].substring(1), 10);
    const numB = parseInt(b.split("-")[1].substring(1), 10);
    return numA - numB;
  });
}
export function getSubPeriodKeysForParent(kind: PlanKind, parentKey: string): string[] {
  if (kind === "year") {
    const y = parentKey;
    return [y + "-Q1", y + "-Q2", y + "-Q3", y + "-Q4"];
  }
  if (kind === "month") {
    const parts = parentKey.split("-");
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    const weekSet = new Set<string>();
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      const wy = getISOWeekYear(d);
      const wn = getISOWeekNumber(d);
      weekSet.add(wy + "-W" + String(wn).padStart(2, "0"));
    }
    return Array.from(weekSet).sort();
  }
  return [];
}
