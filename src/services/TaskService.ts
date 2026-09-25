import { Vault } from "obsidian";
import { Task, PlanKind, TaskStatus, createTask } from "../models/Task";
import { StorageService } from "./StorageService";
import { logger } from "../utils/logger";
import { localTodayStr } from "../utils/period";
import { getNextOccurrenceDate, getPreGenerateCount, parseLocalDate, formatDateStr, extractLocalDate } from "../utils/recurrence";
import type { RecurrenceSeriesService } from "./RecurrenceSeriesService";
import { createRecurrenceSeries } from "../models/RecurrenceSeries";

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
  private recurrenceSeriesService?: RecurrenceSeriesService;

  constructor(vault: Vault, folder: string, recurrenceSeriesService?: RecurrenceSeriesService) {
    this.storage = new StorageService(vault, folder);
    this.recurrenceSeriesService = recurrenceSeriesService;
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
      // 数据迁移：为旧数据添加重复任务字段
      this.tasks = this.tasks.map(t => ({
        ...t,
        recurrenceGroupId: t.recurrenceGroupId ?? null,
        isRecurrenceTemplate: t.isRecurrenceTemplate ?? false,
        isRecurrenceSource: t.isRecurrenceSource ?? false,
        recurrenceEndDate: t.recurrenceEndDate ?? null,
      }));
      // 数据迁移：为旧数据添加 status 字段
      this.tasks = this.tasks.map(t => ({
        ...t,
        status: (t as any).status ?? "active",
      }));
      // 数据迁移：重复实例的我的一天日期应与实例截止日期同步
      this.tasks = this.tasks.map(t => {
        if (t.recurrenceGroupId && !t.isRecurrenceSource && !t.myDayDate && t.dueDate) {
          return { ...t, myDayDate: extractLocalDate(t.dueDate) };
        }
        return t;
      });

      // 数据迁移：仅修复 startDate 完全等于 dueDate 的旧 bug（startDate 被设为 dueDate 的情况）
      // 不再强制覆盖已有正确时间的实例
      this.tasks = this.tasks.map(t => {
        if (t.recurrenceGroupId && !t.isRecurrenceSource && !t.isRecurrenceTemplate && t.startDate && t.dueDate && t.startDate === t.dueDate) {
          const s = t.startDate.replace(/T\d{2}:\d{2}:\d{2}/, "T07:00:00");
          return { ...t, startDate: s };
        }
        return t;
      });
        // 数据迁移：isMyDay -> myDayDate
        this.tasks = this.tasks.map(t => {
          if ((t as any).isMyDay && !t.myDayDate) {
            const d = (t.updatedAt || t.createdAt || "").substring(0, 10);
            t.myDayDate = d || null;
          }
          delete (t as any).isMyDay;
          return t;
        });
      await this.migrateLegacyRecurrenceSources();
      logger.info("Loaded", this.tasks.length, "tasks");
    } else {
      this.tasks = [];
      logger.info("No existing tasks, starting fresh");
    }
    this.loaded = true;
    if (this.tasks.length > 0) await this.ensureRecurrenceInstances();
  }

  // ===== 查询方法（默认排除已删除）=====

  getAll(): Task[] {
    this.ensureLoaded();
    return this.tasks.filter(t => !t.isDeleted && !t.isRecurrenceTemplate);
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
    return this.tasks.filter((t) => t.listId === listId && !t.isDeleted && !t.isRecurrenceTemplate);
  }

  getMyDay(): Task[] {
    this.ensureLoaded();
    const today = localTodayStr();
    return this.tasks.filter((t) => t.myDayDate === today && !t.isDeleted && !t.isRecurrenceTemplate);
  }

  getInbox(defaultListId: string): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.listId === defaultListId && !t.isDeleted && !t.isRecurrenceTemplate);
  }

  getByPlanKindAndPeriod(kind: PlanKind, periodKey: string): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.planKind === kind && t.planPeriodKey === periodKey && !t.isDeleted && !t.isRecurrenceTemplate);
  }

  getChildrenOf(parentId: string): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.parentId === parentId && !t.isDeleted && !t.isRecurrenceTemplate);
  }

  countChildren(parentId: string): number {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.parentId === parentId && !t.isDeleted && !t.isRecurrenceTemplate).length;
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

  /** Recursively apply tags to a task and all its descendants */
  private cascadeTags(taskId: string, tags: string[]): void {
    const children = this.tasks.filter(t => t.parentId === taskId && !t.isDeleted && !t.isRecurrenceTemplate);
    for (const child of children) {
      child.tags = [...tags];
      child.updatedAt = new Date().toISOString();
      this.cascadeTags(child.id, tags);
    }
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

    // 联动更新：源任务日期变更时，重新生成未完成的重复实例
    const updated = this.tasks[index];
    if (updated.isRecurrenceSource && updated.recurrenceGroupId && (changes.startDate !== undefined || changes.dueDate !== undefined)) {
      const oldInstances = this.tasks.filter(
        t => t.recurrenceGroupId === updated.recurrenceGroupId && !t.isRecurrenceSource && !t.isCompleted && !t.isDeleted
      );
      const oldIds = new Set(oldInstances.map(inst => inst.id));
      this.tasks = this.tasks.filter(t => !oldIds.has(t.id));
      await this.generateRecurrenceInstances(updated);
    }

    // 联动更新：父任务标签变更时，同步更新所有子任务
    if (changes.tags !== undefined) {
      this.cascadeTags(id, [...(changes.tags ?? [])]);
      await this.save();
    }

    // 联动更新：设置父任务时，继承父任务标签并级联到所有后代
    if (changes.parentId !== undefined) {
      const parentTask = changes.parentId ? this.tasks.find(t => t.id === changes.parentId && !t.isDeleted) : null;
      if (parentTask) {
        const newTags = [...(parentTask.tags || [])];
        updated.tags = [...newTags];
        updated.updatedAt = new Date().toISOString();
        this.cascadeTags(id, newTags);
        await this.save();
      }
    }

    return this.tasks[index];
  }

  /** 将重复任务当前实例的时间同步到未来未完成实例，保留每个实例自己的日期。 */
  async syncRecurrenceSchedule(taskId: string, startDate: string | null, dueDate: string | null): Promise<number> {
    this.ensureLoaded();
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task || !task.recurrenceGroupId || task.isRecurrenceTemplate) return 0;
    const currentDate = this.taskLocalDate(task);
    if (!currentDate) return 0;

    const timeOf = (value: string | null, defaultTime: string): string | null => {
      if (!value) return null;
      if (!value.includes("T")) return defaultTime;
      return value.substring(value.indexOf("T"));
    };
    const startTime = timeOf(startDate, "T07:00:00");
    const dueTime = timeOf(dueDate, "T23:30:00");
    let startOffsetDays = 0;
    if (startDate && dueDate) {
      const start = parseLocalDate(startDate);
      const due = parseLocalDate(dueDate);
      startOffsetDays = Math.round((Date.UTC(start.y, start.m, start.d) - Date.UTC(due.y, due.m, due.d)) / 86400000);
    }
    let count = 0;
    for (const instance of this.tasks) {
      if (instance.id === taskId || instance.recurrenceGroupId !== task.recurrenceGroupId || instance.isRecurrenceTemplate || instance.isDeleted || instance.isCompleted) continue;
      const instanceDate = this.taskLocalDate(instance);
      if (!instanceDate || instanceDate <= currentDate) continue;
      if (startDate === null) {
        instance.startDate = null;
      } else if (startTime) {
        const dueParts = parseLocalDate(instance.dueDate || instanceDate);
        const nextStart = new Date(dueParts.y, dueParts.m, dueParts.d + startOffsetDays);
        instance.startDate = formatDateStr(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate()) + startTime;
      }
      if (dueDate === null) {
        instance.dueDate = null;
      } else if (dueTime) {
        const instanceDueDate = this.taskLocalDate(instance) || instanceDate;
        instance.dueDate = instanceDueDate + dueTime;
      }
      instance.updatedAt = new Date().toISOString();
      count++;
    }
    if (count > 0) await this.save();
    return count;
  }

  /** 将重复任务的系列属性同步到未来未完成实例，不修改每个实例自己的日期或完成状态。 */
  async syncRecurrenceProperties(taskId: string, changes: Partial<Task>): Promise<number> {
    this.ensureLoaded();
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task || !task.recurrenceGroupId || task.isRecurrenceTemplate) return 0;
    const currentDate = this.taskLocalDate(task);
    if (!currentDate) return 0;

    const propertyChanges: Partial<Task> = {};
    const syncFields: Array<keyof Task> = [
      "title", "note", "listId", "tags", "isImportant", "status",
      "relatedPaths", "relatedFolders", "planKind", "planPeriodKey", "parentId",
    ];
    for (const field of syncFields) {
      if (changes[field] !== undefined) {
        const value = changes[field];
        (propertyChanges as Record<string, unknown>)[field] = Array.isArray(value) ? [...value] : value;
      }
    }
    if (Object.keys(propertyChanges).length === 0) return 0;

    let count = 0;
    for (const instance of this.tasks) {
      if (instance.id === taskId || instance.recurrenceGroupId !== task.recurrenceGroupId || instance.isRecurrenceTemplate || instance.isDeleted || instance.isCompleted) continue;
      const instanceDate = this.taskLocalDate(instance);
      if (!instanceDate || instanceDate <= currentDate) continue;
      Object.assign(instance, propertyChanges);
      instance.updatedAt = new Date().toISOString();
      count++;
    }
    if (count > 0) await this.save();
    return count;
  }

  async complete(id: string): Promise<Task | null> {
    this.ensureLoaded();
    const task = this.tasks.find(t => t.id === id);
    if (!task) return null;

    const result = await this.update(id, {
      isCompleted: true,
      completedAt: new Date().toISOString(),
    });

    // 重复实例完成后自动补充
    if (task.recurrence && task.recurrenceGroupId && !task.isRecurrenceSource) {
      await this.replenishInstances(task.recurrenceGroupId);
    }

    return result;
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
      active: this.tasks.filter(t => !t.isDeleted && !t.isCompleted && !t.isRecurrenceTemplate).length,
      completed: this.tasks.filter(t => !t.isDeleted && t.isCompleted && !t.isRecurrenceTemplate).length,
      deleted: this.tasks.filter(t => t.isDeleted).length,
    };
  }

  // ===== 重复任务 =====

  private taskLocalDate(task: Task): string | null {
    if (task.dueDate) return extractLocalDate(task.dueDate);
    if (task.myDayDate) return task.myDayDate;
    if (task.startDate) return extractLocalDate(task.startDate);
    return null;
  }

  private async migrateLegacyRecurrenceSources(): Promise<void> {
    const today = localTodayStr();
    let changed = false;
    for (const source of this.tasks.filter((task) => task.isRecurrenceSource && !task.isRecurrenceTemplate && task.recurrence && task.recurrenceGroupId)) {
      source.isRecurrenceTemplate = true;
      changed = true;
      if (this.recurrenceSeriesService) {
        await this.recurrenceSeriesService.upsert(createRecurrenceSeries({
          id: source.recurrenceGroupId!, rule: source.recurrence!,
          startDate: this.taskLocalDate(source) || today, endDate: source.recurrenceEndDate,
          title: source.title, note: source.note, listId: source.listId,
          tags: [...source.tags], isImportant: source.isImportant,
        }));
      }
      const hasInstance = this.tasks.some((task) => task.recurrenceGroupId === source.recurrenceGroupId && !task.isRecurrenceTemplate && !task.isDeleted && this.taskLocalDate(task) !== null);
      if (!hasInstance) {
        const date = this.taskLocalDate(source) || today;
        this.tasks.push(createTask({ ...source, id: crypto.randomUUID(), isRecurrenceTemplate: false, isRecurrenceSource: false, isCompleted: false, completedAt: null, myDayDate: date, startDate: source.startDate || date + "T07:00:00", dueDate: source.dueDate || date + "T23:30:00" }));
      }
    }
    if (changed) await this.save();
  }

  /** 确保重复系列始终有当前或未来的未完成实例。 */
  private async ensureRecurrenceInstances(): Promise<void> {
    const today = localTodayStr();
    const groups = new Set(this.tasks
      .filter((task) => task.isRecurrenceSource && task.isRecurrenceTemplate && task.recurrence && task.recurrenceGroupId && !task.isDeleted)
      .map((task) => task.recurrenceGroupId as string));
    for (const groupId of groups) {
      const instances = this.tasks.filter((task) => task.recurrenceGroupId === groupId && !task.isRecurrenceTemplate && !task.isDeleted);
      const hasPending = instances.some((task) => {
        const date = this.taskLocalDate(task);
        return !task.isCompleted && !!date && date >= today;
      });
      if (!hasPending) await this.replenishInstances(groupId);
    }
  }

  /** 设置重复规则。用户任务会转为内部模板，同时生成一个带日期的可执行实例。 */
  async setRecurrence(taskId: string, recurrence: string | null, endDate?: string | null): Promise<void> {
    this.ensureLoaded();
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    // 清除重复
    if (!recurrence) {
      task.recurrence = null;
      task.isRecurrenceSource = false;
      task.recurrenceEndDate = null;
      task.recurrenceGroupId = null;
      task.updatedAt = new Date().toISOString();
      await this.save();
      return;
    }

    const today = localTodayStr();
    if (!task.startDate && !task.dueDate) {
      task.startDate = today + "T07:00:00";
      task.dueDate = today + "T23:30:00";
      task.myDayDate = today;
    } else if (!task.dueDate) {
      const startDate = extractLocalDate(task.startDate!);
      task.dueDate = startDate + "T23:30:00";
      task.myDayDate = task.myDayDate || startDate;
    } else if (!task.startDate) {
      const dueDate = extractLocalDate(task.dueDate);
      task.startDate = dueDate + "T07:00:00";
      task.myDayDate = task.myDayDate || dueDate;
    }

    // 如果已有重复组且规则变化，删除旧的未完成实例（不含 source 自身）
    if (task.recurrenceGroupId && task.recurrence !== recurrence) {
      const oldInstances = this.tasks.filter(
        t => t.recurrenceGroupId === task.recurrenceGroupId && !t.isRecurrenceSource && !t.isCompleted && !t.isDeleted
      );
      const oldIds = new Set(oldInstances.map(inst => inst.id));
        this.tasks = this.tasks.filter(t => !oldIds.has(t.id));
    }

    // 建立独立重复系列记录，任务文件只通过 recurrenceGroupId 关联系列。
    const groupId = task.recurrenceGroupId || crypto.randomUUID();
    task.recurrence = recurrence;
    task.isRecurrenceSource = true;
    task.recurrenceGroupId = groupId;
    task.recurrenceEndDate = endDate !== undefined ? endDate : task.recurrenceEndDate;
    if (this.recurrenceSeriesService) {
      await this.recurrenceSeriesService.upsert(createRecurrenceSeries({
        id: groupId,
        rule: recurrence,
        startDate: extractLocalDate(task.dueDate!),
        endDate: task.recurrenceEndDate,
        title: task.title,
        note: task.note,
        listId: task.listId,
        tags: [...task.tags],
        isImportant: task.isImportant,
      }));
    }
    task.updatedAt = new Date().toISOString();

    // 原记录仅作为内部模板，不再显示给用户；当前日期由独立实例表示。
    task.isRecurrenceTemplate = true;
    task.isRecurrenceSource = true;
    const currentInstance = createTask({
      ...task,
      id: crypto.randomUUID(),
      isRecurrenceTemplate: false,
      isRecurrenceSource: false,
      isCompleted: false,
      completedAt: null,
    });
    this.tasks.push(currentInstance);

    // 预生成未来实例（从当前实例之后开始）
    await this.generateRecurrenceInstances(task);
  }

  /**
   * 预生成重复实例
   * 从母任务的 dueDate 开始，生成 N 个未来实例
   */
  private async generateRecurrenceInstances(template: Task): Promise<void> {
    if (!template.recurrence || !template.recurrenceGroupId) return;

    const count = getPreGenerateCount(template.recurrence);

    // 用 parseLocalDate 提取本地日期，避免 UTC/本地时间不一致
    const templateDue = template.dueDate ? parseLocalDate(template.dueDate) : null;
    const baseLocal = templateDue ? new Date(templateDue.y, templateDue.m, templateDue.d) : new Date();

    // 计算 startDate 和 dueDate 的偏移（用本地日期，避免时区问题）
    let startOffsetDays = 0;
    if (template.startDate && template.dueDate) {
      const s = parseLocalDate(template.startDate);
      const e = parseLocalDate(template.dueDate);
      const sDate = new Date(s.y, s.m, s.d).getTime();
      const eDate = new Date(e.y, e.m, e.d).getTime();
      startOffsetDays = Math.round((sDate - eDate) / 86400000);
    }

    for (let i = 0; i < count; i++) {
      const nextDue = getNextOccurrenceDate(baseLocal, template.recurrence);
      baseLocal.setTime(nextDue.getTime());

      // 检查截止日期
      if (template.recurrenceEndDate) {
        const end = parseLocalDate(template.recurrenceEndDate);
        const endDate = new Date(end.y, end.m, end.d);
        if (nextDue > endDate) break;
      }

      const dueDateOnly = formatDateStr(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate());

      // 继承源任务的时间段，仅全天任务用默认值
      const isAllDayDue = !template.dueDate || !template.dueDate.includes('T') || template.dueDate.endsWith('T00:00:00') || template.dueDate.endsWith('T23:30:00');
      const dueTime = isAllDayDue ? 'T23:30:00' : template.dueDate!.substring(template.dueDate!.indexOf('T'));

      let instanceStartDate: string | null = null;
      if (template.startDate) {
        const isAllDayStart = !template.startDate.includes('T') || template.startDate.endsWith('T00:00:00') || template.startDate.endsWith('T07:00:00');
        const startTime = isAllDayStart ? 'T07:00:00' : template.startDate.substring(template.startDate.indexOf('T'));
        if (startOffsetDays !== 0) {
          const startLocal = new Date(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate() + startOffsetDays);
          instanceStartDate = formatDateStr(startLocal.getFullYear(), startLocal.getMonth(), startLocal.getDate()) + startTime;
        } else {
          instanceStartDate = dueDateOnly + startTime;
        }
      } else {
        instanceStartDate = dueDateOnly + 'T07:00:00';
      }

      const instance = createTask({
        title: template.title,
        note: template.note,
        isImportant: template.isImportant,
        listId: template.listId,
        tags: [...template.tags],
        relatedPaths: [...template.relatedPaths],
        relatedFolders: [...template.relatedFolders],
        myDayGroup: template.myDayGroup,
        myDayDate: dueDateOnly,
        recurrence: template.recurrence,
        recurrenceGroupId: template.recurrenceGroupId,
        recurrenceEndDate: template.recurrenceEndDate,
        isRecurrenceTemplate: false,
        dueDate: dueDateOnly + dueTime,
        startDate: instanceStartDate,
      });

      this.tasks.push(instance);
    }

    await this.save();
    logger.info("Generated recurrence instances for:", template.title);
  }

  /**
   * 补充重复实例（完成一个实例后调用）
   * 如果剩余未完成实例不足，从最远处继续生成
   */
  async replenishInstances(groupId: string): Promise<void> {
    this.ensureLoaded();
    const instances = this.tasks.filter(
      t => t.recurrenceGroupId === groupId && !t.isRecurrenceTemplate && !t.isDeleted
    );
    const source = this.tasks.find(
      t => t.recurrenceGroupId === groupId && t.isRecurrenceSource && !t.isDeleted
    );
    if (!source || !source.recurrence) return;

    const uncompleted = instances.filter(t => !t.isCompleted);
    const totalCount = getPreGenerateCount(source.recurrence);
    const threshold = Math.max(1, Math.floor(totalCount / 3));

    if (uncompleted.length >= threshold) return;

    // 找到最远一个实例的 dueDate 作为起点（用 parseLocalDate 兼容 UTC/本地格式）
    let latestDate: Date | null = null;
    for (const inst of instances) {
      if (inst.dueDate) {
        const ld = parseLocalDate(inst.dueDate);
        const d = new Date(ld.y, ld.m, ld.d);
        if (!latestDate || d > latestDate) latestDate = d;
      }
    }
    if (!latestDate) {
      const sourceDate = this.taskLocalDate(source);
      if (sourceDate) {
        const parsed = parseLocalDate(sourceDate);
        latestDate = new Date(parsed.y, parsed.m, parsed.d);
      } else {
        latestDate = new Date();
      }
    }
    const existingDates = new Set(
      instances.map((instance) => this.taskLocalDate(instance)).filter((date): date is string => !!date),
    );

    const needCount = totalCount - uncompleted.length;
    // 计算 startDate/dueDate 偏移（天数）
    let startOffsetDays = 0;
    if (source.startDate && source.dueDate) {
      const s = parseLocalDate(source.startDate);
      const e = parseLocalDate(source.dueDate);
      startOffsetDays = Math.round((new Date(s.y, s.m, s.d).getTime() - new Date(e.y, e.m, e.d).getTime()) / 86400000);
    }

    for (let i = 0; i < needCount; i++) {
      const nextDue = getNextOccurrenceDate(latestDate, source.recurrence);
      latestDate.setTime(nextDue.getTime());

      if (source.recurrenceEndDate) {
        const end = new Date(source.recurrenceEndDate);
        if (nextDue > end) break;
      }

      const pad = (n: number) => String(n).padStart(2, "0");
      const dueStr = nextDue.getFullYear() + "-" + pad(nextDue.getMonth() + 1) + "-" + pad(nextDue.getDate());
      if (existingDates.has(dueStr)) continue;

      // 继承源任务的时间段，仅全天任务用默认值
      const isAllDayDue = !source.dueDate || !source.dueDate.includes('T') || source.dueDate.endsWith('T00:00:00') || source.dueDate.endsWith('T23:30:00');
      const dueTime = isAllDayDue ? 'T23:30:00' : source.dueDate!.substring(source.dueDate!.indexOf('T'));

      let instanceStartDate: string | null = null;
      if (source.startDate) {
        const isAllDayStart = !source.startDate.includes('T') || source.startDate.endsWith('T00:00:00') || source.startDate.endsWith('T07:00:00');
        const startTime = isAllDayStart ? 'T07:00:00' : source.startDate.substring(source.startDate.indexOf('T'));
        if (startOffsetDays !== 0) {
          const startLocal = new Date(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate() + startOffsetDays);
          instanceStartDate = formatDateStr(startLocal.getFullYear(), startLocal.getMonth(), startLocal.getDate()) + startTime;
        } else {
          instanceStartDate = dueStr + startTime;
        }
      } else {
        instanceStartDate = dueStr + 'T07:00:00';
      }

      const instance = createTask({
        title: source.title,
        note: source.note,
        isImportant: source.isImportant,
        listId: source.listId,
        tags: [...source.tags],
        relatedPaths: [...source.relatedPaths],
        relatedFolders: [...source.relatedFolders],
        myDayGroup: source.myDayGroup,
        myDayDate: dueStr,
        recurrence: source.recurrence,
        recurrenceGroupId: groupId,
        recurrenceEndDate: source.recurrenceEndDate,
        isRecurrenceTemplate: false,
        dueDate: dueStr + dueTime,
        startDate: instanceStartDate,
      });

      this.tasks.push(instance);
      existingDates.add(dueStr);
    }

    await this.save();
    logger.info("Replenished instances for group:", groupId);
  }

  /**
   * 获取重复组的所有实例（不含母任务）
   */
  getGroupInstances(groupId: string): Task[] {
    this.ensureLoaded();
    return this.tasks.filter(
      t => t.recurrenceGroupId === groupId && !t.isRecurrenceTemplate && !t.isDeleted
    );
  }

  /** 获取所有重复系列源头任务 */
  getSources(): Task[] {
    this.ensureLoaded();
    return this.tasks.filter(t => t.isRecurrenceSource && !t.isDeleted);
  }

  /**
   * 删除整个重复系列
   * - 删除所有未完成实例（软删除）
   * - 保留已完成实例（用于统计）
   * - 删除母任务
   * @returns 删除的数量
   */
  async deleteSeries(groupId: string, taskId?: string): Promise<number> {
    this.ensureLoaded();
    const now = new Date().toISOString();
    const today = localTodayStr();
    let count = 0;

    // 删除当前及未来实例，保留过去实例（包括已完成历史）。
    for (const t of this.tasks) {
      if (t.recurrenceGroupId !== groupId || t.isDeleted) continue;
      const date = this.taskLocalDate(t);
      if (t.id === taskId || t.isRecurrenceTemplate || !date || date >= today) {
        t.isDeleted = true;
        t.deletedAt = now;
        t.updatedAt = now;
        count++;
      }
    }

    if (count > 0) await this.save();
    await this.recurrenceSeriesService?.remove(groupId);
    logger.info("Deleted series:", groupId, "removed", count);
    return count;
  }

  /**
   * 停止重复（保留已有实例，不再生成新的）
   */
  async stopRecurrence(groupId: string, fromTaskId?: string): Promise<number> {
    this.ensureLoaded();
    const now = new Date().toISOString();
    const today = localTodayStr();
    let deletedCount = 0;

    // 取消重复只删除未来实例，当前任务和过去实例保留。
    const deletedIds = new Set<string>();
    for (const t of this.tasks) {
      if (t.recurrenceGroupId !== groupId || t.isRecurrenceTemplate || t.isDeleted) continue;
      const date = this.taskLocalDate(t);
      if (date && date > today) {
        deletedIds.add(t.id);
        deletedCount++;
      }
    }

    if (deletedIds.size > 0) this.tasks = this.tasks.filter(t => !deletedIds.has(t.id));

    // 当前选中的实例变回普通任务，过去实例保留历史字段。
    const current = fromTaskId ? this.tasks.find((t) => t.id === fromTaskId && !t.isDeleted) : undefined;
    if (current) {
      current.isRecurrenceSource = false;
      current.recurrence = null;
      current.recurrenceGroupId = null;
      current.recurrenceEndDate = null;
      current.updatedAt = now;
    }
    const source = this.tasks.find((t) => t.recurrenceGroupId === groupId && t.isRecurrenceTemplate && !t.isDeleted);
    if (source) {
      source.isDeleted = true;
      source.deletedAt = now;
      source.updatedAt = now;
    }

    if (deletedCount > 0 || current || source) await this.save();
    await this.recurrenceSeriesService?.remove(groupId);
    logger.info("Stopped recurrence for group:", groupId, "deleted:", deletedCount);
    return deletedCount;
  }


  private async save(): Promise<void> {
    const db: TaskDatabase = { tasks: this.tasks };
    await this.storage.backup(DB_FILENAME);
    await this.storage.write(DB_FILENAME, db);
  }

  /** 清空 StorageService 的文件缓存（供 resetAllData 使用） */
  public clearCache(): void {
    this.storage.clearCache();
  }

    private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error("TaskService not initialized. Call init() first.");
    }
  }
}
