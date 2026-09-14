import { Notice, Plugin, TFile } from "obsidian";

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

  /** 全部重置：备份 → vault.delete 清除缓存+磁盘 → 清空服务 → 重建视图 */
  async resetAllData(): Promise<void> {
    const folder = this.settings.todoFolder;

    // 确保 backups 目录存在
    if (!(await this.app.vault.adapter.exists(folder + "/backups"))) {
      await this.app.vault.createFolder(folder + "/backups");
    }

    const date = new Date().toISOString().split("T")[0];
    const dataFiles = ["database.json", "lists.json", "tags.json", "groups.json"];

    for (const f of dataFiles) {
      const path = folder + "/" + f;
      try {
        const af = this.app.vault.getAbstractFileByPath(path);
        if (af instanceof TFile) {
          // 备份
          const raw = await this.app.vault.read(af);
          const backupPath = folder + "/backups/" + date + "_" + f;
          const bFile = this.app.vault.getAbstractFileByPath(backupPath);
          if (bFile instanceof TFile) {
            await this.app.vault.modify(bFile, raw);
          } else {
            await this.app.vault.create(backupPath, raw);
          }
          // vault.delete: 同时清除磁盘文件 + Vault 内部 TFile 元数据映射
          // 这样之后 getAbstractFileByPath() 返回 null → StorageService 走 adapter.read 路径
          await this.app.vault.delete(af);
        }
      } catch (e) {
        console.error("resetAllData backup/delete failed:", path, e);
      }
    }

    // 清空所有服务的内存缓存，重新初始化（此时读磁盘：文件已删 → 返回 null → 创建默认数据）
    this.taskService.clearCache();
    await this.taskService.init();
    this.listService.clearCache();
    await this.listService.init();
    this.tagService.clearCache();
    await this.tagService.init();
    this.groupService.clearCache();
    await this.groupService.init();

    // 重置视图相关设置到默认值
    this.settings.activeViewNav = DEFAULT_SETTINGS.activeViewNav;
    this.settings.selectedListId = DEFAULT_SETTINGS.selectedListId;
    this.settings.selectedTaskId = DEFAULT_SETTINGS.selectedTaskId;
    this.settings.selectedQuadrant = DEFAULT_SETTINGS.selectedQuadrant;
    this.settings.activePlanKind = DEFAULT_SETTINGS.activePlanKind;
    await this.saveSettings();

    // 关闭设置页
    try {
      const s = (this.app as any)?.setting;
      if (s?.isOpen) s.close();
    } catch {}

    new Notice("\u6240\u6709\u6570\u636e\u5df2\u91cd\u7f6e");

    // 重建主视图
    await this.refreshView();
  }

    /** 刷新主视图（设置页清空/重置后调用：关闭并重建 TodoView） */
  async refreshView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TODO);
    if (leaves.length === 0) return;
    for (const leaf of leaves) {
      leaf.detach();
    }
    await this.activateView();
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
