export type MyDayGroup = "allday" | "morning" | "noon" | "afternoon" | "evening";

export type PlanKind = "life" | "year" | "quarter" | "month" | "week";

export interface Task {
  id: string;
  title: string;
  note: string;
  isCompleted: boolean;
  isImportant: boolean;
  isMyDay: boolean;
  myDayGroup: MyDayGroup;
  startDate: string | null;
  dueDate: string | null;
  recurrence: string | null;
  listId: string;
  tags: string[];
  relatedPaths: string[];
  relatedFolders: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  parentId?: string;
  planKind?: PlanKind;
  planPeriodKey?: string;
}

export function createTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "",
    note: "",
    isCompleted: false,
    isImportant: false,
    isMyDay: false,
    myDayGroup: "allday",
    startDate: null,
    dueDate: null,
    recurrence: null,
    listId: "",
    tags: [],
    relatedPaths: [],
    relatedFolders: [],
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...overrides,
  };
}
