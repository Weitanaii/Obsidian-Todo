import { Notice, Plugin } from "obsidian";

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

  /** 全部重置：清空内存数据 → 删除磁盘文件（绕过 Vault 缓存）→ 重新初始化 → 刷新视图 */
  async resetAllData(): Promise<void> {
    const folder = this.settings.todoFolder;
    const dataFiles = ["database.json", "lists.json", "tags.json", "groups.json"];

    // 1. 清空所有服务的文件缓存，防止后续 init() 读到缓存中的旧数据
    this.taskService.clearCache();
    this.listService.clearCache();
    this.tagService.clearCache();
    this.groupService.clearCache();

    // 2. 用 adapter.remove() 删除磁盘文件（绕过 Vault 的 TFile 元数据和事件系统）
    for (const f of dataFiles) {
      const path = folder + "/" + f;
      try {
        if (await this.app.vault.adapter.exists(path)) {
          await this.app.vault.adapter.remove(path);
        }
      } catch (e) {
        console.error("resetAllData: failed to remove", path, e);
      }
    }

    // 3. 重新初始化所有服务（文件已删 → read 返回 null → 创建默认数据）
    await this.taskService.init();
    await this.listService.init();
    await this.tagService.init();
    await this.groupService.init();

    // 4. 重置视图相关设置到默认值
    this.settings.activeViewNav = DEFAULT_SETTINGS.activeViewNav;
    this.settings.selectedListId = DEFAULT_SETTINGS.selectedListId;
    this.settings.selectedTaskId = DEFAULT_SETTINGS.selectedTaskId;
    this.settings.selectedQuadrant = DEFAULT_SETTINGS.selectedQuadrant;
    this.settings.activePlanKind = DEFAULT_SETTINGS.activePlanKind;
    await this.saveSettings();

    new Notice("\u6240\u6709\u6570\u636e\u5df2\u91cd\u7f6e");

    // 5. 重建主视图
    await this.refreshView();
  }
  /** 刷新主视图：在已有视图上调 refreshAll，不销毁叶子 */
  async refreshView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TODO);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof TodoView && typeof view.refreshAll === "function") {
        await view.refreshAll();
        return;
      }
    }
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

    if (this.settings.sortConfig && (this.settings.sortConfig.primary.field as string) === "manual") {
      this.settings.sortConfig = {
        primary: { field: "importance", direction: "desc" },
        secondary: { field: "createdAt", direction: "desc" },
      };
      await this.saveSettings();
    }
    logger.setLevel(LogLevel[this.settings.logLevel as keyof typeof LogLevel]);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
