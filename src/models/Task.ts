export type Priority = "low" | "medium" | "high";

export type MyDayGroup = "allday" | "morning" | "noon" | "afternoon" | "evening";

export type PlanKind = "life" | "year" | "quarter" | "month" | "week";

export interface SubTask {
  id: string;
  title: string;
  isCompleted: boolean;
  sortOrder: number;
}

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
  reminder: string | null;
  recurrence: string | null;
  listId: string;
  tags: string[];
  priority: Priority;
  steps: SubTask[];
  sortOrder: number;
  relatedPaths: string[];
  relatedFolders: string[];
  attachments: string[];
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
    reminder: null,
    recurrence: null,
    listId: "",
    tags: [],
    priority: "medium",
    steps: [],
    sortOrder: 0,
    relatedPaths: [],
    relatedFolders: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...overrides,
  };
}