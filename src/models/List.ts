/**
 * 列表数据模型
 * 定义任务列表（TodoList）的数据结构和工厂函数
 * 列表是任务的容器，类似 Microsoft To-Do 中的「清单」
 * 数据最终会序列化为 JSON 存储到 todo/lists.json
 */

/**
 * 任务列表数据结构
 * 每个任务通过 listId 关联到一个列表
 * 支持排序、归档、默认列表等管理能力
 */
export interface TodoList {
  /** 唯一标识符 */
  id: string;
  /** 列表名称，如「工作」「购物清单」 */
  name: string;
  /** Obsidian 图标标识符，侧边栏导航中显示 */
  icon: string;
  /** 列表颜色，十六进制色值或 null 使用默认色 */
  color: string | null;
  /** 排序权值，数值越小越靠前 */
  sortOrder: number;
  /** 是否已归档，归档后不在主界面显示 */
  isArchived: boolean;
  /** 是否为默认列表，每个用户只能有一个默认列表 */
  isDefault: boolean;
  /** 创建时间，ISO 8601 格式 */
  createdAt: string;
  /** 最后更新时间，ISO 8601 格式 */
  updatedAt: string;
}

/**
 * 列表工厂函数
 * 创建一个带完整默认值的新列表对象
 * 调用方可通过 overrides 覆盖任意字段
 *
 * @param overrides - 可选的部分字段覆盖，未提供的字段使用默认值
 * @returns 一个完整的新 TodoList 对象
 *
 * @example
 * // 创建一个普通列表
 * const list = createList({ name: "工作" });
 *
 * @example
 * // 创建默认列表
 * const list = createList({ name: "Tasks", isDefault: true });
 */
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
    createdAt: now,
    updatedAt: now,
    // 用展开运算符覆盖默认值，overrides 中的字段优先
    ...overrides,
  };
}
