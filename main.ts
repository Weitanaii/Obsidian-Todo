import { Plugin } from "obsidian";
import {
  ObsidianTodoSettings,
  ObsidianTodoSettingTab,
  DEFAULT_SETTINGS,
} from "./src/settings";
import { logger, LogLevel } from "./src/utils/logger";

const VIEW_TYPE_TODO = "obsidian-todo-view";

export default class ObsidianTodoPlugin extends Plugin {
  settings: ObsidianTodoSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    logger.info("Obsidian Todo loaded");

    this.addSettingTab(new ObsidianTodoSettingTab(this.app, this));

    this.addRibbonIcon("checklist", "Obsidian Todo", () => {
      logger.info("Ribbon icon clicked");
    });

    this.addCommand({
      id: "open-todo-sidebar",
      name: "Open Todo sidebar",
      callback: () => {
        logger.info("Command: open todo sidebar");
      },
    });

    this.addCommand({
      id: "quick-add-task",
      name: "Quick add task",
      callback: () => {
        logger.info("Command: quick add task");
      },
    });
  }

  onunload(): void {
    logger.info("Obsidian Todo unloaded");
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    logger.setLevel(LogLevel[this.settings.logLevel as keyof typeof LogLevel]);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
