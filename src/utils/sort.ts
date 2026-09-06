import type { Task } from "../models/Task";

export type SortField = "manual" | "importance" | "dueDate" | "createdAt" | "title";

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
    case "manual":
      return sign * (a.sortOrder - b.sortOrder);

    case "importance":
      return sign * (Number(b.isImportant) - Number(a.isImportant));

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
    return compareValues(a, b, config.secondary.field, config.secondary.direction);
  });
}