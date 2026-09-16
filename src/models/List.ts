export interface TodoList {
  id: string;
  name: string;
  sortOrder: number;
  isArchived: boolean;
  isDefault: boolean;
  groupId: string | null;
  icon: string;
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
    icon: "list",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
