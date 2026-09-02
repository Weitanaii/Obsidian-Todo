import { Vault } from "obsidian";
import { Task, createTask } from "../models/Task";
import { StorageService } from "./StorageService";
import { logger } from "../utils/logger";

/**
 * 任务服务 - 任务数据的增删改查
 *
 * 职责：管理所有任务的内存数据和持久化
 * 设计意图：
 *   - 所有任务操作都通过此服务进行，不直接操作 StorageService
 *   - 内存中维护一份完整的任务列表，读取时直接返回副本，写入时自动持久化
 *   - 每次写入前先备份，防止数据损坏无法恢复
 */

/** database.json 的数据结构 */
export interface TaskDatabase {
  tasks: Task[];
}

const DB_FILENAME = "database.json";

export class TaskService {
  private storage: StorageService;
  // 内存中的任务列表，所有读写都操作这个数组，定期持久化到磁盘
  private tasks: Task[] = [];
  // 防止在 init() 完成前调用其他方法导致读到空数据
  private loaded = false;

  /**
   * @param vault - Obsidian Vault 实例
   * @param folder - 数据存储的 Vault 文件夹路径
   */
  constructor(vault: Vault, folder: string) {
    this.storage = new StorageService(vault, folder);
  }

  /**
   * 初始化：创建目录 + 从 database.json 加载数据到内存
   * 必须在使用其他方法前调用
   */
  async init(): Promise<void> {
    await this.storage.init();
    const db = await this.storage.read<TaskDatabase>(DB_FILENAME);
    if (db && db.tasks) {
      this.tasks = db.tasks;
      logger.info("Loaded", this.tasks.length, "tasks");
    } else {
      // 首次运行或文件损坏，从空列表开始
      this.tasks = [];
      logger.info("No existing tasks, starting fresh");
    }
    this.loaded = true;
  }

  /**
   * 获取所有任务
   * 返回副本而非引用，防止外部直接修改内存数据绕过持久化
   */
  getAll(): Task[] {
    this.ensureLoaded();
    return [...this.tasks];
  }

  /** 根据 ID 获取单个任务，不存在返回 undefined */
  getById(id: string): Task | undefined {
    this.ensureLoaded();
    return this.tasks.find((t) => t.id === id);
  }

  /** 根据列表 ID 获取该列表下的所有任务 */
  getByListId(listId: string): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.listId === listId);
  }

  /** 获取所有标记为重要且未完成的任务 */
  getImportant(): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.isImportant && !t.isCompleted);
  }

  getMyDay(): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.isMyDay && !t.isCompleted);
  }

  /** 获取所有已完成的任务 */
  getCompleted(): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.isCompleted);
  }

  /**
   * 创建新任务
   * 用 createTask() 工厂函数生成带默认值的任务对象，再用 fields 覆盖指定字段
   *
   * @param fields - 任务字段，至少需要 title 和 listId
   * @returns 创建后的完整任务对象（含自动生成的 id 和时间戳）
   */
  async create(fields: Partial<Task>): Promise<Task> {
    this.ensureLoaded();
    const task = createTask(fields);
    this.tasks.push(task);
    await this.save();
    logger.info("Task created:", task.title);
    return task;
  }

  /**
   * 更新任务的部分字段
   * 使用展开运算符合并，updatedAt 自动更新为当前时间
   *
   * @param id - 任务 ID
   * @param changes - 要更新的字段，只传需要改的
   * @returns 更新后的任务，如果任务不存在返回 null
   */
  async update(id: string, changes: Partial<Task>): Promise<Task | null> {
    this.ensureLoaded();
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index === -1) {
      logger.warn("Task not found:", id);
      return null;
    }
    // 合并变更，updatedAt 自动更新
    this.tasks[index] = {
      ...this.tasks[index],
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
    logger.info("Task updated:", id);
    return this.tasks[index];
  }

  /**
   * 标记任务完成
   * 同时设置 isCompleted 和 completedAt，保持两个字段同步
   */
  async complete(id: string): Promise<Task | null> {
    return this.update(id, {
      isCompleted: true,
      completedAt: new Date().toISOString(),
    });
  }

  /** 取消任务完成状态，清除 completedAt */
  async uncomplete(id: string): Promise<Task | null> {
    return this.update(id, {
      isCompleted: false,
      completedAt: null,
    });
  }

  /**
   * 删除任务
   * @param id - 任务 ID
   * @returns 是否删除成功，任务不存在返回 false
   */
  async delete(id: string): Promise<boolean> {
    this.ensureLoaded();
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index === -1) {
      logger.warn("Task not found for delete:", id);
      return false;
    }
    // splice 返回被删除的元素，用于日志
    const removed = this.tasks.splice(index, 1)[0];
    await this.save();
    logger.info("Task deleted:", removed.title);
    return true;
  }

  /**
   * 批量删除所有已完成的任务
   * @returns 实际删除的数量
   */
  async deleteCompleted(): Promise<number> {
    this.ensureLoaded();
    const before = this.tasks.length;
    // 用 filter 保留未完成的，等效于删除已完成的
    this.tasks = this.tasks.filter((t) => !t.isCompleted);
    const count = before - this.tasks.length;
    if (count > 0) {
      await this.save();
      logger.info("Deleted", count, "completed tasks");
    }
    return count;
  }

  /**
   * 持久化到 database.json
   * 先备份再写入，确保即使写入失败也有上一份数据可恢复
   */
  private async save(): Promise<void> {
    const db: TaskDatabase = { tasks: this.tasks };
    await this.storage.backup(DB_FILENAME);
    await this.storage.write(DB_FILENAME, db);
  }

  /** 防御性检查，确保 init() 已完成 */
  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error("TaskService not initialized. Call init() first.");
    }
  }
}
