export interface RecurrenceSeries {
  id: string;
  rule: string;
  startDate: string;
  endDate: string | null;
  title: string;
  note: string;
  listId: string;
  tags: string[];
  isImportant: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createRecurrenceSeries(overrides: Partial<RecurrenceSeries> = {}): RecurrenceSeries {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    rule: "daily",
    startDate: "",
    endDate: null,
    title: "",
    note: "",
    listId: "",
    tags: [],
    isImportant: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
