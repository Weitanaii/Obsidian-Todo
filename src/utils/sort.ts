import type { Task, MyDayGroup } from "../models/Task";

export type SortField = "importance" | "dueDate" | "createdAt" | "title";

export type SortDirection = "asc" | "desc";

export interface SortKey {
  field: SortField;
  direction: SortDirection;
}

export interface SortConfig {
  primary: SortKey;
  secondary: SortKey;
}

function compareValues(a: Task, b: Task, field: SortField, dir: SortDirection): number {
  const sign = dir === "asc" ? 1 : -1;
  switch (field) {
    case "importance":
      return sign * (Number(a.isImportant) - Number(b.isImportant));

    case "dueDate": {
      const aHas = a.dueDate ? 1 : 0;
      const bHas = b.dueDate ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      if (!a.dueDate && !b.dueDate) return 0;
      return sign * (new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
    }

    case "createdAt":
      return sign * (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    case "title":
      return sign * a.title.localeCompare(b.title, "zh");

    default:
      return 0;
  }
}

export function sortTasks(tasks: Task[], config: SortConfig): Task[] {
  return tasks.slice().sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    const primary = compareValues(a, b, config.primary.field, config.primary.direction);
    if (primary !== 0) return primary;
    // Star tiebreaker: starred tasks come first within same group
    if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1;
    return compareValues(a, b, config.secondary.field, config.secondary.direction);
  });
}

// Determine My Day group based on task time
export function getMyDayGroupFromTime(startDate: string | null, dueDate: string | null): MyDayGroup {
  // Check if it's an "allday" task: dueDate ends at 23:59
  if (dueDate) {
    const due = new Date(dueDate);
    if (!isNaN(due.getTime()) && due.getHours() === 23 && due.getMinutes() === 59) {
      return "allday";
    }
  }

  // Use dueDate time if available, otherwise startDate
  const timeStr = dueDate || startDate;
  if (!timeStr) return "allday";

  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return "allday";

  const hours = date.getHours();
  if (hours >= 6 && hours < 12) return "morning";
  if (hours >= 12 && hours < 14) return "noon";
  if (hours >= 14 && hours < 18) return "afternoon";
  if (hours >= 18 && hours < 24) return "evening";
  return "allday"; // 0:00 - 5:59
}
