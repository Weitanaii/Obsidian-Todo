import { Vault } from "obsidian";
import { Task, PlanKind, createTask } from "../models/Task";
import { StorageService } from "./StorageService";
import { logger } from "../utils/logger";
import { localTodayStr } from "../utils/period";

export interface TaskDatabase {
  tasks: Task[];
}

export interface TaskStats {
  total: number;
  active: number;
  completed: number;
  deleted: number;
}

const DB_FILENAME = "database.json";

export class TaskService {
  private storage: StorageService;
  private tasks: Task[] = [];
  private loaded = false;

  constructor(vault: Vault, folder: string) {
    this.storage = new StorageService(vault, folder);
  }

  async init(): Promise<void> {
    await this.storage.init();
    const db = await this.storage.read<TaskDatabase>(DB_FILENAME);
    if (db && db.tasks) {
      this.tasks = db.tasks;
      // 数据迁移：为旧数据添加软删除字段
      this.tasks = this.tasks.map(t => ({
        ...t,
        isDeleted: t.isDeleted ?? false,
        deletedAt: t.deletedAt ?? null,
      }));
        // 数据迁移：isMyDay -> myDayDate
        this.tasks = this.tasks.map(t => {
          if ((t as any).isMyDay && !t.myDayDate) {
            const d = (t.updatedAt || t.createdAt || "").substring(0, 10);
            t.myDayDate = d || null;
          }
          delete (t as any).isMyDay;
          return t;
        });
      logger.info("Loaded", this.tasks.length, "tasks");
    } else {
      this.tasks = [];
      logger.info("No existing tasks, starting fresh");
    }
    this.loaded = true;
  }

  // ===== 查询方法（默认排除已删除）=====

  getAll(): Task[] {
    this.ensureLoaded();
    return this.tasks.filter(t => !t.isDeleted);
  }

  getAllIncludingDeleted(): Task[] {
    this.ensureLoaded();
    return [...this.tasks];
  }

  getById(id: string): Task | undefined {
    this.ensureLoaded();
    return this.tasks.find((t) => t.id === id);
  }

  getByListId(listId: string): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.listId === listId && !t.isDeleted);
  }

  getMyDay(): Task[] {
    this.ensureLoaded();
    const today = localTodayStr();
    return this.tasks.filter((t) => t.myDayDate === today && !t.isDeleted);
  }

  getInbox(defaultListId: string): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.listId === defaultListId && !t.isDeleted);
  }

  getByPlanKindAndPeriod(kind: PlanKind, periodKey: string): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.planKind === kind && t.planPeriodKey === periodKey && !t.isDeleted);
  }

  getChildrenOf(parentId: string): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.parentId === parentId && !t.isDeleted);
  }

  countChildren(parentId: string): number {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.parentId === parentId && !t.isDeleted).length;
  }

  getParentOf(taskId: string): Task | undefined {
    this.ensureLoaded();
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task || !task.parentId) return undefined;
    return this.tasks.find((t) => t.id === task.parentId);
  }

  // ===== 回收站相关 =====

  getDeleted(): Task[] {
    this.ensureLoaded();
    return this.tasks.filter(t => t.isDeleted);
  }

  // ===== CRUD 操作 =====

  async create(fields: Partial<Task>): Promise<Task> {
    this.ensureLoaded();
    const task = createTask(fields);
    this.tasks.push(task);
    await this.save();
    logger.info("Task created:", task.title);
    return task;
  }

  async update(id: string, changes: Partial<Task>): Promise<Task | null> {
    this.ensureLoaded();
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index === -1) {
      logger.warn("Task not found:", id);
      return null;
    }
    this.tasks[index] = {
      ...this.tasks[index],
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
    logger.info("Task updated:", id);
    return this.tasks[index];
  }

  async complete(id: string): Promise<Task | null> {
    return this.update(id, {
      isCompleted: true,
      completedAt: new Date().toISOString(),
    });
  }

  async uncomplete(id: string): Promise<Task | null> {
    return this.update(id, {
      isCompleted: false,
      completedAt: null,
    });
  }

  // 软删除
  async delete(id: string): Promise<boolean> {
    this.ensureLoaded();
    const task = this.tasks.find((t) => t.id === id);
    if (!task) {
      logger.warn("Task not found for delete:", id);
      return false;
    }
    const now = new Date().toISOString();
    task.isDeleted = true;
    task.deletedAt = now;
    task.updatedAt = now;
    // 软删除子任务
    const children = this.tasks.filter((t) => t.parentId === id && !t.isDeleted);
    for (const child of children) {
      await this.delete(child.id);
    }
    await this.save();
    logger.info("Task soft deleted:", task.title);
    return true;
  }

  // 恢复任务
  async restore(id: string): Promise<boolean> {
    this.ensureLoaded();
    const task = this.tasks.find((t) => t.id === id);
    if (!task || !task.isDeleted) {
      logger.warn("Task not found or not deleted:", id);
      return false;
    }
    task.isDeleted = false;
    task.deletedAt = null;
    task.updatedAt = new Date().toISOString();
    await this.save();
    logger.info("Task restored:", task.title);
    return true;
  }

  // 清空回收站
  async emptyTrash(): Promise<number> {
    this.ensureLoaded();
    const deletedTasks = this.tasks.filter(t => t.isDeleted);
    const count = deletedTasks.length;
    this.tasks = this.tasks.filter(t => !t.isDeleted);
    if (count > 0) {
      await this.save();
      logger.info("Trash emptied:", count, "tasks removed");
    }
    return count;
  }
  // 彻底删除任务（硬删除）
  async hardDelete(id: string): Promise<boolean> {
    this.ensureLoaded();
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index === -1) {
      logger.warn("Task not found for hard delete:", id);
      return false;
    }
    const removed = this.tasks.splice(index, 1)[0];
    await this.save();
    logger.info("Task hard deleted:", removed.title);
    return true;
  }


  // 清空所有任务
  async clearAll(): Promise<number> {
    this.ensureLoaded();
    const count = this.tasks.length;
    this.tasks = [];
    if (count > 0) {
      await this.save();
      logger.info("All tasks cleared:", count);
    }
    return count;
  }

  // 获取数据统计
  getStats(): TaskStats {
    this.ensureLoaded();
    return {
      total: this.tasks.length,
      active: this.tasks.filter(t => !t.isDeleted && !t.isCompleted).length,
      completed: this.tasks.filter(t => !t.isDeleted && t.isCompleted).length,
      deleted: this.tasks.filter(t => t.isDeleted).length,
    };
  }

  private async save(): Promise<void> {
    const db: TaskDatabase = { tasks: this.tasks };
    await this.storage.backup(DB_FILENAME);
    await this.storage.write(DB_FILENAME, db);
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error("TaskService not initialized. Call init() first.");
    }
  }
}
