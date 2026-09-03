export type Priority = "low" | "medium" | "high";

export type PriorityQuadrant = "Q1" | "Q2" | "Q3" | "Q4";

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
  
  startDate: string | null;
  
  dueDate: string | null;
  
  reminder: string | null;
  
  recurrence: string | null;
  
  listId: string;
  
  tags: string[];
  
  priority: Priority;
  
  priorityQuadrant: PriorityQuadrant | null;
  
  steps: SubTask[];
  
  sortOrder: number;
  
  relatedPaths: string[];
  
  attachments: string[];
  
  createdAt: string;
  
  updatedAt: string;
  
  completedAt: string | null;
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
    startDate: null,
    dueDate: null,
    reminder: null,
    recurrence: null,
    listId: "",
    tags: [],
    priority: "medium",
    priorityQuadrant: null,
    steps: [],
    sortOrder: 0,
    relatedPaths: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    
    ...overrides,
  };
}
