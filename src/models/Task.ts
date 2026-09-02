/**
 * 任务数据模型
 * 定义任务（Task）和子任务（SubTask）的数据结构
 * 以及任务工厂函数 createTask()，用于创建带默认值的新任务
 * 数据最终会序列化为 JSON 存储到 todo/database.json
 */

/** 任务优先级：低 / 中 / 高 */
export type Priority = "low" | "medium" | "high";

/** 四象限分类：Q1 紧急且重要 / Q2 重要不紧急 / Q3 紧急不重要 / Q4 不紧急不重要 */
export type PriorityQuadrant = "Q1" | "Q2" | "Q3" | "Q4";

/** 子任务（Steps），每个任务可包含多个子任务，支持单独勾选完成 */
export interface SubTask {
  id: string;
  title: string;
  isCompleted: boolean;
  /** 排序权值，数值越小越靠前，支持拖拽调整顺序 */
  sortOrder: number;
}

/**
 * 任务数据结构
 * 对应 Microsoft To-Do 中的 Task 实体，覆盖所有核心字段
 * 序列化后存储在 todo/database.json 的 tasks 数组中
 */
export interface Task {
  /** 唯一标识符，使用 crypto.randomUUID() 生成 */
  id: string;
  /** 任务标题 */
  title: string;
  /** 任务备注，支持 Markdown 格式，可包含 Obsidian 内链 [[page]] */
  note: string;
  /** 是否已完成 */
  isCompleted: boolean;
  /** 是否标记为重要（星标） */
  isImportant: boolean;
  /** 开始日期，ISO 8601 格式或 null */
  startDate: string | null;
  /** 截止日期，ISO 8601 格式或 null */
  dueDate: string | null;
  /** 提醒时间，ISO 8601 格式或 null */
  reminder: string | null;
  /** 重复规则，如 daily / weekly / monthly，null 表示不重复 */
  recurrence: string | null;
  /** 所属列表 ID，关联 TodoList.id */
  listId: string;
  /** 标签数组，如 ["工作", "紧急"] */
  tags: string[];
  /** 优先级：low / medium / high */
  priority: Priority;
  /** 四象限分类，用于优先级方法论视图 */
  priorityQuadrant: PriorityQuadrant | null;
  /** 子任务列表（Steps） */
  steps: SubTask[];
  /** 排序权值，数值越小越靠前 */
  sortOrder: number;
  /** 关联的 Obsidian 页面、文件夹或 Markdown 文件路径 */
  relatedPaths: string[];
  /** 附件链接 */
  attachments: string[];
  /** 创建时间，ISO 8601 格式 */
  createdAt: string;
  /** 最后更新时间，ISO 8601 格式 */
  updatedAt: string;
  /** 完成时间，ISO 8601 格式，未完成时为 null */
  completedAt: string | null;
}

/**
 * 任务工厂函数
 * 创建一个带完整默认值的新任务对象
 * 调用方可通过 overrides 覆盖任意字段
 *
 * @param overrides - 可选的部分字段覆盖，未提供的字段使用默认值
 * @returns 一个完整的新 Task 对象
 *
 * @example
 * // 创建一个简单的任务
 * const task = createTask({ title: "买菜", listId: "inbox" });
 *
 * @example
 * // 创建一个重要的紧急任务
 * const task = createTask({
 *   title: "提交报告",
 *   isImportant: true,
 *   dueDate: "2026-09-05",
 *   priority: "high",
 * });
 */
export function createTask(overrides: Partial<Task> = {}): Task {
  // 用同一个时间戳，确保 createdAt 和 updatedAt 一致
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "",
    note: "",
    isCompleted: false,
    isImportant: false,
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
    // 用展开运算符覆盖默认值，overrides 中的字段优先
    ...overrides,
  };
}
