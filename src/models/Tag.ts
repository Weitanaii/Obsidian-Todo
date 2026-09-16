export interface DomainTag {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createTag(overrides: Partial<DomainTag> = {}): DomainTag {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "",
    color: "#6B7280",
    icon: "tag",
    sortOrder: 0,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const DEFAULT_DOMAIN_TAGS: Partial<DomainTag>[] = [
  { name: "重要紧急", color: "#E74C3C", icon: "alarm-clock", sortOrder: 0, isDefault: true },
  { name: "重要不紧急", color: "#4A90D9", icon: "calendar-check", sortOrder: 1, isDefault: true },
  { name: "不重要紧急", color: "#F5A623", icon: "bell", sortOrder: 2, isDefault: true },
  { name: "不重要不紧急", color: "#95A5A6", icon: "coffee", sortOrder: 3, isDefault: true },
  { name: "事业", color: "#4A90D9", icon: "briefcase", sortOrder: 4, isDefault: true },
  { name: "财富", color: "#F5A623", icon: "piggy-bank", sortOrder: 5, isDefault: true },
  { name: "健康", color: "#E74C3C", icon: "heart-pulse", sortOrder: 6, isDefault: true },
  { name: "心理", color: "#9B59B6", icon: "activity", sortOrder: 7, isDefault: true },
  { name: "学习", color: "#2ECC71", icon: "book-open", sortOrder: 8, isDefault: true },
  { name: "家庭", color: "#1ABC9C", icon: "home", sortOrder: 9, isDefault: true },
  { name: "社交", color: "#3498DB", icon: "users", sortOrder: 10, isDefault: true },
  { name: "兴趣", color: "#E67E22", icon: "palette", sortOrder: 11, isDefault: true },
  { name: "娱乐", color: "#F39C12", icon: "popcorn", sortOrder: 12, isDefault: true },
  { name: "杂务", color: "#95A5A6", icon: "clipboard-list", sortOrder: 13, isDefault: true },
];
