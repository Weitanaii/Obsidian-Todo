import { App, PluginSettingTab, Setting } from "obsidian";
import type ObsidianTodoPlugin from "../main";
import type { ViewNav } from "./views/TodoView";
import { logger, LogLevel } from "./utils/logger";
import type { SortConfig } from "./utils/sort";

export interface ObsidianTodoSettings {
  todoFolder: string;
  defaultListName: string;
  logLevel: string;
  activeViewNav: ViewNav;
  selectedListId: string | null;
  completedCollapsed: boolean;
  selectedTaskId: string | null;
  sortConfig: SortConfig;
}

export const DEFAULT_SETTINGS: ObsidianTodoSettings = {
  todoFolder: "todo",
  defaultListName: "Tasks",
  logLevel: "INFO",
  activeViewNav: "myday",
  selectedListId: null,
  completedCollapsed: true,
  selectedTaskId: null,
  sortConfig: {
    primary: { field: "importance", direction: "desc" },
    secondary: { field: "createdAt", direction: "desc" },
  },
};

export class ObsidianTodoSettingTab extends PluginSettingTab {
  plugin: ObsidianTodoPlugin;

  constructor(app: App, plugin: ObsidianTodoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Obsidian Todo 设置" });

    new Setting(containerEl)
      .setName("数据存储文件夹")
      .setDesc("任务数据文件存储在 Vault 中的文件夹路径")
      .addText((text) =>
        text
          .setPlaceholder("todo")
          .setValue(this.plugin.settings.todoFolder)
          .onChange(async (value) => {
            this.plugin.settings.todoFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("默认列表名称")
      .setDesc("首次运行时自动创建的默认列表名称")
      .addText((text) =>
        text
          .setPlaceholder("Tasks")
          .setValue(this.plugin.settings.defaultListName)
          .onChange(async (value) => {
            this.plugin.settings.defaultListName = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("日志级别")
      .setDesc("控制控制台日志的详细程度")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("DEBUG", "调试")
          .addOption("INFO", "信息")
          .addOption("WARN", "警告")
          .addOption("ERROR", "错误")
          .setValue(this.plugin.settings.logLevel)
          .onChange(async (value) => {
            this.plugin.settings.logLevel = value;
            logger.setLevel(LogLevel[value as keyof typeof LogLevel]);
            await this.plugin.saveSettings();
          })
      );
  }
}
