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
  { name: "事业", color: "#4A90D9", icon: "briefcase", sortOrder: 0, isDefault: true },
  { name: "财富", color: "#F5A623", icon: "wallet", sortOrder: 1, isDefault: true },
  { name: "健康", color: "#E74C3C", icon: "heart", sortOrder: 2, isDefault: true },
  { name: "亲密关系", color: "#9B59B6", icon: "users", sortOrder: 3, isDefault: true },
  { name: "自我成长", color: "#2ECC71", icon: "trending-up", sortOrder: 4, isDefault: true },
  { name: "兴趣", color: "#1ABC9C", icon: "palette", sortOrder: 5, isDefault: true },
];
