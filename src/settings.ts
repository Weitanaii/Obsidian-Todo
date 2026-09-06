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
    secondary: { field: "dueDate", direction: "asc" },
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

    containerEl.createEl("h2", { text: "Obsidian Todo Settings" });

    new Setting(containerEl)
      .setName("Todo data folder")
      .setDesc("Vault folder where todo data files are stored")
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
      .setName("Default list name")
      .setDesc("Name of the default list created on first run")
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
      .setName("Log level")
      .setDesc("Controls console log verbosity")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("DEBUG", "Debug")
          .addOption("INFO", "Info")
          .addOption("WARN", "Warn")
          .addOption("ERROR", "Error")
          .setValue(this.plugin.settings.logLevel)
          .onChange(async (value) => {
            this.plugin.settings.logLevel = value;
            logger.setLevel(LogLevel[value as keyof typeof LogLevel]);
            await this.plugin.saveSettings();
          })
      );
  }
}
