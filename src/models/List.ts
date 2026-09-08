export interface TodoList {
  
  id: string;
  
  name: string;
  
  icon: string;
  
  color: string | null;
  
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
    icon: "list",
    color: null,
    sortOrder: 0,
    isArchived: false,
    isDefault: false,
    groupId: null,
    createdAt: now,
    updatedAt: now,
    
    ...overrides,
  };
}
