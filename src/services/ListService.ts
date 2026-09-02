import { Vault } from "obsidian";
import { TodoList, createList } from "../models/List";
import { StorageService } from "./StorageService";
import { logger } from "../utils/logger";

/**
 * 列表服务 - 列表数据的增删改查
 *
 * 职责：管理所有任务列表的内存数据和持久化
 * 设计意图：
 *   - 列表是任务的容器，每个任务通过 listId 关联到一个列表
 *   - 首次运行时自动创建一个默认列表，保证用户始终有地方放任务
 *   - 删除列表时不级联删除任务，调用方需要自行处理（如移动到默认列表）
 */

/** lists.json 的数据结构 */
export interface ListStore {
  lists: TodoList[];
}

const STORE_FILENAME = "lists.json";

export class ListService {
  private storage: StorageService;
  // 内存中的列表数据
  private lists: TodoList[] = [];
  private loaded = false;
  // 从用户设置读取的默认列表名称，首次运行时用于自动创建
  private defaultListName: string;

  /**
   * @param vault - Obsidian Vault 实例
   * @param folder - 数据存储的 Vault 文件夹路径
   * @param defaultListName - 默认列表名称，来自用户设置
   */
  constructor(vault: Vault, folder: string, defaultListName: string) {
    this.storage = new StorageService(vault, folder);
    this.defaultListName = defaultListName;
  }

  /**
   * 初始化：创建目录 + 加载数据 + 确保默认列表存在
   * 即使 lists.json 不存在或为空，初始化后也保证至少有一个默认列表
   */
  async init(): Promise<void> {
    await this.storage.init();
    const store = await this.storage.read<ListStore>(STORE_FILENAME);
    if (store && store.lists) {
      this.lists = store.lists;
      logger.info("Loaded", this.lists.length, "lists");
    } else {
      this.lists = [];
      logger.info("No existing lists, starting fresh");
    }
    // 确保至少有一个默认列表，首次运行时自动创建
    await this.ensureDefaultList();
    this.loaded = true;
  }

  /** 获取所有列表（返回副本） */
  getAll(): TodoList[] {
    this.ensureLoaded();
    return [...this.lists];
  }

  /**
   * 获取未归档的活跃列表
   * 按 sortOrder 排序，数值越小越靠前
   */
  getActive(): TodoList[] {
    this.ensureLoaded();
    return this.lists
      .filter((l) => !l.isArchived)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /** 根据 ID 获取单个列表 */
  getById(id: string): TodoList | undefined {
    this.ensureLoaded();
    return this.lists.find((l) => l.id === id);
  }

  /** 获取默认列表，每个用户只有一个默认列表 */
  getDefault(): TodoList | undefined {
    this.ensureLoaded();
    return this.lists.find((l) => l.isDefault);
  }

  /**
   * 创建新列表
   * @param fields - 列表字段，至少需要 name
   * @returns 创建后的完整列表对象
   */
  async create(fields: Partial<TodoList>): Promise<TodoList> {
    this.ensureLoaded();
    const list = createList(fields);
    this.lists.push(list);
    await this.save();
    logger.info("List created:", list.name);
    return list;
  }

  /**
   * 更新列表的部分字段
   * @param id - 列表 ID
   * @param changes - 要更新的字段
   * @returns 更新后的列表，不存在返回 null
   */
  async update(id: string, changes: Partial<TodoList>): Promise<TodoList | null> {
    this.ensureLoaded();
    const index = this.lists.findIndex((l) => l.id === id);
    if (index === -1) {
      logger.warn("List not found:", id);
      return null;
    }
    this.lists[index] = {
      ...this.lists[index],
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
    logger.info("List updated:", id);
    return this.lists[index];
  }

  /**
   * 重命名列表
   * @param id - 列表 ID
   * @param newName - 新名称
   */
  async rename(id: string, newName: string): Promise<TodoList | null> {
    return this.update(id, { name: newName });
  }

  /**
   * 归档列表（不删除，只是从活跃列表中隐藏）
   * 归档后列表下的任务仍然存在，可通过取消归档恢复
   * @param id - 列表 ID
   */
  async archive(id: string): Promise<TodoList | null> {
    return this.update(id, { isArchived: true });
  }

  /** 取消归档，列表重新出现在活跃列表中 */
  async unarchive(id: string): Promise<TodoList | null> {
    return this.update(id, { isArchived: false });
  }

  /**
   * 删除列表
   * 注意：不会删除列表下的任务，调用方需要自行处理（如移动到默认列表）
   * 禁止删除默认列表，防止用户没有地方放任务
   *
   * @param id - 列表 ID
   * @returns 是否删除成功
   */
  async delete(id: string): Promise<boolean> {
    this.ensureLoaded();
    const list = this.lists.find((l) => l.id === id);
    if (!list) {
      logger.warn("List not found for delete:", id);
      return false;
    }
    // 禁止删除默认列表，这是用户最后的兜底
    if (list.isDefault) {
      logger.warn("Cannot delete default list");
      return false;
    }
    this.lists = this.lists.filter((l) => l.id !== id);
    await this.save();
    logger.info("List deleted:", list.name);
    return true;
  }

  /** 持久化到 lists.json */
  private async save(): Promise<void> {
    const store: ListStore = { lists: this.lists };
    await this.storage.write(STORE_FILENAME, store);
  }

  /**
   * 确保存在默认列表
   * 首次运行时 lists.json 不存在，自动创建一个默认列表
   * 后续运行时如果默认列表被误删，也会自动补回
   */
  private async ensureDefaultList(): Promise<void> {
    const hasDefault = this.lists.some((l) => l.isDefault);
    if (!hasDefault) {
      const defaultList = createList({
        name: this.defaultListName,
        isDefault: true,
        icon: "inbox",
      });
      this.lists.push(defaultList);
      await this.save();
      logger.info("Default list created:", defaultList.name);
    }
  }

  /** 防御性检查，确保 init() 已完成 */
  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error("ListService not initialized. Call init() first.");
    }
  }
}
