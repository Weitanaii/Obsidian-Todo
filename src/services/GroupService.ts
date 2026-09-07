import { Vault } from "obsidian";
import { ListGroup, createGroup } from "../models/Group";
import { StorageService } from "./StorageService";
import { logger } from "../utils/logger";

export interface GroupStore {
  groups: ListGroup[];
}

const STORE_FILENAME = "groups.json";

export class GroupService {
  private storage: StorageService;
  private groups: ListGroup[] = [];
  private loaded = false;

  constructor(vault: Vault, folder: string) {
    this.storage = new StorageService(vault, folder);
  }

  async init(): Promise<void> {
    await this.storage.init();
    const store = await this.storage.read<GroupStore>(STORE_FILENAME);
    if (store && store.groups) {
      this.groups = store.groups;
      logger.info("Loaded", this.groups.length, "groups");
    } else {
      this.groups = [];
      logger.info("No existing groups, starting fresh");
    }
    this.loaded = true;
  }

  getAll(): ListGroup[] {
    this.ensureLoaded();
    return [...this.groups].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  getById(id: string): ListGroup | undefined {
    this.ensureLoaded();
    return this.groups.find((g) => g.id === id);
  }

  async create(fields: Partial<ListGroup>): Promise<ListGroup> {
    this.ensureLoaded();
    const group = createGroup(fields);
    this.groups.push(group);
    await this.save();
    logger.info("Group created:", group.name);
    return group;
  }

  async update(id: string, changes: Partial<ListGroup>): Promise<ListGroup | null> {
    this.ensureLoaded();
    const index = this.groups.findIndex((g) => g.id === id);
    if (index === -1) {
      logger.warn("Group not found:", id);
      return null;
    }
    this.groups[index] = {
      ...this.groups[index],
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
    logger.info("Group updated:", id);
    return this.groups[index];
  }

  async rename(id: string, newName: string): Promise<ListGroup | null> {
    return this.update(id, { name: newName });
  }

  async toggleCollapse(id: string): Promise<ListGroup | null> {
    const group = this.groups.find((g) => g.id === id);
    if (!group) return null;
    return this.update(id, { isCollapsed: !group.isCollapsed });
  }

  async delete(id: string): Promise<boolean> {
    this.ensureLoaded();
    const group = this.groups.find((g) => g.id === id);
    if (!group) {
      logger.warn("Group not found for delete:", id);
      return false;
    }
    this.groups = this.groups.filter((g) => g.id !== id);
    await this.save();
    logger.info("Group deleted:", group.name);
    return true;
  }

  private async save(): Promise<void> {
    const store: GroupStore = { groups: this.groups };
    await this.storage.write(STORE_FILENAME, store);
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error("GroupService not initialized. Call init() first.");
    }
  }
}
