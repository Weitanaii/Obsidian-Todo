import { Vault } from "obsidian";
import { Task, createTask } from "../models/Task";
import { StorageService } from "./StorageService";
import { logger } from "../utils/logger";

export interface TaskDatabase {
  tasks: Task[];
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
      logger.info("Loaded", this.tasks.length, "tasks");
    } else {
      
      this.tasks = [];
      logger.info("No existing tasks, starting fresh");
    }
    this.loaded = true;
  }

  
  getAll(): Task[] {
    this.ensureLoaded();
    return [...this.tasks];
  }

  
  getById(id: string): Task | undefined {
    this.ensureLoaded();
    return this.tasks.find((t) => t.id === id);
  }

  
  getByListId(listId: string): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.listId === listId);
  }

  
  getImportant(): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.isImportant && !t.isCompleted);
  }

  getMyDay(): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.isMyDay && !t.isCompleted);
  }

  
  getCompleted(): Task[] {
    this.ensureLoaded();
    return this.tasks.filter((t) => t.isCompleted);
  }

  
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

  
  async delete(id: string): Promise<boolean> {
    this.ensureLoaded();
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index === -1) {
      logger.warn("Task not found for delete:", id);
      return false;
    }
    
    const removed = this.tasks.splice(index, 1)[0];
    await this.save();
    logger.info("Task deleted:", removed.title);
    return true;
  }

  
  async deleteCompleted(): Promise<number> {
    this.ensureLoaded();
    const before = this.tasks.length;
    
    this.tasks = this.tasks.filter((t) => !t.isCompleted);
    const count = before - this.tasks.length;
    if (count > 0) {
      await this.save();
      logger.info("Deleted", count, "completed tasks");
    }
    return count;
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
