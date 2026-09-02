// ============================================================
// Obsidian Todo 插件入口文件
// Obsidian 启动时会加载这个文件，执行 onload()；关闭时执行 onunload()
// ============================================================

// 从 obsidian 包导入 Plugin 基类
// Plugin 是所有 Obsidian 插件的父类，提供了生命周期方法和各种 API
import { Plugin } from "obsidian";

// 导入我们自己写的设置模块
// ObsidianTodoSettings - 设置的数据类型定义
// ObsidianTodoSettingTab - 设置页面的 UI 组件
// DEFAULT_SETTINGS - 默认配置值
import {
  ObsidianTodoSettings,
  ObsidianTodoSettingTab,
  DEFAULT_SETTINGS,
} from "./src/settings";

// 导入日志工具，用于在控制台输出调试信息
import { logger, LogLevel } from "./src/utils/logger";

// 导入数据服务（M1 新增）
// TaskService - 任务的增删改查，持久化到 todo/database.json
// ListService - 列表的增删改查，持久化到 todo/lists.json
import { TaskService } from "./src/services/TaskService";
import { ListService } from "./src/services/ListService";

import { TodoView, VIEW_TYPE_TODO } from "./src/views/TodoView";

// 插件主类
// export default - 默认导出，Obsidian 会找到这个类并实例化
// extends Plugin - 继承 Plugin 基类，获得所有插件 API
export default class ObsidianTodoPlugin extends Plugin {
  // 插件设置，类型为 ObsidianTodoSettings（包含 todoFolder、defaultListName、logLevel）
  // 在 loadSettings() 中赋值，整个插件生命周期内通过 this.settings 访问
  settings: ObsidianTodoSettings;

  // M1 新增：数据服务实例
  // 通过这两个服务操作所有任务和列表数据
  taskService!: TaskService;
  listService!: ListService;

  // ============ onload() - 插件启动入口 ============
  // Obsidian 加载插件时自动调用，相当于插件的 main 函数
  async onload(): Promise<void> {
    // 第一步：加载用户设置
    await this.loadSettings();
    logger.info("Obsidian Todo loaded");

    // 第二步：初始化数据服务（M1 新增）
    // 使用用户配置的 todoFolder 作为数据存储目录
    this.taskService = new TaskService(this.app.vault, this.settings.todoFolder);
    this.listService = new ListService(this.app.vault, this.settings.todoFolder, this.settings.defaultListName);
    await this.taskService.init();
    await this.listService.init();

    // 注册设置页
    this.addSettingTab(new ObsidianTodoSettingTab(this.app, this));

    // 注册侧边栏视图（M2 T-201）
    this.registerView(VIEW_TYPE_TODO, (leaf) => new TodoView(leaf, this));

    // 在左侧边栏添加图标
    this.addRibbonIcon("check-square", "Obsidian Todo", async () => {
      await this.activateView();
    });

    // 注册命令面板命令
    this.addCommand({
      id: "open-todo-sidebar",
      name: "Open Todo tab",
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
          view.focusQuickInput();
        }
      },
    });
  }

  // ============ onunload() - 插件关闭 ============
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

  // ============ 设置读写 ============
  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    logger.setLevel(LogLevel[this.settings.logLevel as keyof typeof LogLevel]);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
