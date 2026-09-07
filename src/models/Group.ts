export interface ListGroup {
  id: string;
  name: string;
  sortOrder: number;
  isCollapsed: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createGroup(overrides: Partial<ListGroup> = {}): ListGroup {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "",
    sortOrder: 0,
    isCollapsed: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
