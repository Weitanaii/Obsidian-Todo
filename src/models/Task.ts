export type MyDayGroup = "allday" | "morning" | "noon" | "afternoon" | "evening";

export type PlanKind = "life" | "year" | "quarter" | "month" | "week";

export interface Task {
  id: string;
  title: string;
  note: string;
  isCompleted: boolean;
  isImportant: boolean;
  myDayDate: string | null;
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

  // 软删除字段
  isDeleted: boolean;
  deletedAt: string | null;

  // 重复任务字段
  recurrenceGroupId: string | null;
  isRecurrenceTemplate: boolean;
  isRecurrenceSource: boolean;
  recurrenceEndDate: string | null;
}

export function createTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "",
    note: "",
    isCompleted: false,
    isImportant: false,
    myDayDate: null,
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
    isDeleted: false,
    deletedAt: null,
    recurrenceGroupId: null,
    isRecurrenceTemplate: false,
    isRecurrenceSource: false,
    recurrenceEndDate: null,
    ...overrides,
  };
}
