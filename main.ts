import { Plugin } from "obsidian";

import {
  ObsidianTodoSettings,
  ObsidianTodoSettingTab,
  DEFAULT_SETTINGS,
} from "./src/settings";

import { logger, LogLevel } from "./src/utils/logger";

import { TaskService } from "./src/services/TaskService";
import { ListService } from "./src/services/ListService";
import { TagService } from "./src/services/TagService";
import { GroupService } from "./src/services/GroupService";

import { TodoView, VIEW_TYPE_TODO } from "./src/views/TodoView";

export default class ObsidianTodoPlugin extends Plugin {
  
  
  settings: ObsidianTodoSettings;

  
  
  taskService!: TaskService;
  listService!: ListService;
  tagService!: TagService;
  groupService!: GroupService;

  
  
  async onload(): Promise<void> {
    
    await this.loadSettings();
    logger.info("Obsidian Todo loaded");

    
    
    this.taskService = new TaskService(this.app.vault, this.settings.todoFolder);
    this.listService = new ListService(this.app.vault, this.settings.todoFolder, this.settings.defaultListName);
    await this.taskService.init();
    await this.listService.init();
    this.tagService = new TagService(this.app.vault, this.settings.todoFolder);
    await this.tagService.init();
    this.groupService = new GroupService(this.app.vault, this.settings.todoFolder);
    await this.groupService.init();

    
    this.addSettingTab(new ObsidianTodoSettingTab(this.app, this));

    
    this.registerView(VIEW_TYPE_TODO, (leaf) => new TodoView(leaf, this));

    
    this.addRibbonIcon("check-square", "Obsidian Todo", async () => {
      await this.activateView();
    });

    
    this.addCommand({
      id: "open-todo-tab",
      name: "Open Obsidian Todo",
      callback: async () => {
        await this.activateView();
      },
    });

    this.addCommand({
      id: "quick-add-task",
      name: "Quick add task",
      callback: async () => {
        await this.activateView();
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TODO);
        const view = leaves[0]?.view;
        if (view instanceof TodoView) {
          view.promptQuickCreate();
        }
      },
    });
  }

  
  onunload(): void {
    logger.info("Obsidian Todo unloaded");
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TODO);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    if (!leaf) {
      return;
    }

    await leaf.setViewState({ type: VIEW_TYPE_TODO, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  
  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Migrate: if saved sortConfig still uses removed "manual" field, reset to default
    if (this.settings.sortConfig && (this.settings.sortConfig.primary.field as string) === "manual") {
      this.settings.sortConfig = {
        primary: { field: "importance", direction: "desc" },
        secondary: { field: "createdAt", direction: "desc" },
      };
      await this.saveSettings();
    }

    // Migrate: planMode and quadrantMode are always enabled now
    if (!this.settings.planModeEnabled || !this.settings.quadrantModeEnabled) {
      this.settings.planModeEnabled = true;
      this.settings.quadrantModeEnabled = true;
      await this.saveSettings();
    }
    logger.setLevel(LogLevel[this.settings.logLevel as keyof typeof LogLevel]);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
