import { Vault } from "obsidian";
import { TodoList, createList } from "../models/List";
import { StorageService } from "./StorageService";
import { logger } from "../utils/logger";

export interface ListStore {
  lists: TodoList[];
}

const STORE_FILENAME = "lists.json";

export class ListService {
  private storage: StorageService;
  
  private lists: TodoList[] = [];
  private loaded = false;
  
  private defaultListName: string;

  
  constructor(vault: Vault, folder: string, defaultListName: string) {
    this.storage = new StorageService(vault, folder);
    this.defaultListName = defaultListName;
  }

  
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
    
    await this.ensureDefaultList();
    this.loaded = true;
  }

  
  getActive(): TodoList[] {
    this.ensureLoaded();
    return this.lists
      .filter((l) => !l.isArchived)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  
  getById(id: string): TodoList | undefined {
    this.ensureLoaded();
    return this.lists.find((l) => l.id === id);
  }

  
  getDefault(): TodoList | undefined {
    this.ensureLoaded();
    return this.lists.find((l) => l.isDefault);
  }

  
  async create(fields: Partial<TodoList>): Promise<TodoList> {
    this.ensureLoaded();
    const list = createList(fields);
    this.lists.push(list);
    await this.save();
    logger.info("List created:", list.name);
    return list;
  }

  
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

  
  async rename(id: string, newName: string): Promise<TodoList | null> {
    return this.update(id, { name: newName });
  }

  
  async delete(id: string): Promise<boolean> {
    this.ensureLoaded();
    const list = this.lists.find((l) => l.id === id);
    if (!list) {
      logger.warn("List not found for delete:", id);
      return false;
    }
    
    if (list.isDefault) {
      logger.warn("Cannot delete default list");
      return false;
    }
    this.lists = this.lists.filter((l) => l.id !== id);
    await this.save();

    // Readback verification: ensure file on disk matches memory
    try {
      this.storage.clearCache();
      const store = await this.storage.read<ListStore>(STORE_FILENAME);
      if (store && store.lists.some((l) => l.id === id)) {
        logger.error("Readback verification failed: deleted list still in file, retrying write");
        await this.save();
      }
    } catch (e) {
      logger.error("Readback verification error:", e);
    }

    logger.info("List deleted:", list.name);
    return true;
  }

  
  

  private async save(): Promise<void> {
    const store: ListStore = { lists: this.lists };
    await this.storage.write(STORE_FILENAME, store);
  }

  
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

  
  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error("ListService not initialized. Call init() first.");
    }
  }
}
