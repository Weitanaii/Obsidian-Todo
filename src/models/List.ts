export interface TodoList {
  id: string;
  name: string;
  sortOrder: number;
  isArchived: boolean;
  isDefault: boolean;
  groupId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createList(overrides: Partial<TodoList> = {}): TodoList {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "",
    sortOrder: 0,
    isArchived: false,
    isDefault: false,
    groupId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
