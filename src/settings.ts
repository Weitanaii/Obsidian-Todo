/**
 * 插件设置模块
 * 定义设置数据结构（ObsidianTodoSettings）、默认值（DEFAULT_SETTINGS）
 * 以及设置页面 UI（ObsidianTodoSettingTab）
 */

import { App, PluginSettingTab, Setting } from "obsidian";
import type ObsidianTodoPlugin from "../main";
import { logger, LogLevel } from "./utils/logger";

/**
 * 插件设置的数据结构
 * 所有用户可配置的项都在这里定义
 */
export interface ObsidianTodoSettings {
  /** todo 数据文件存放的 Vault 文件夹路径 */
  todoFolder: string;
  /** 首次运行时自动创建的默认列表名称 */
  defaultListName: string;
  /** 控制台日志级别：DEBUG / INFO / WARN / ERROR */
  logLevel: string;
}

/**
 * 默认设置值
 * 当 data.json 中缺少某字段时，Object.assign 会用这里的值补上
 * 这样插件升级新增配置项时，旧用户不会因为缺少字段而报错
 */
export const DEFAULT_SETTINGS: ObsidianTodoSettings = {
  todoFolder: "todo",
  defaultListName: "Tasks",
  logLevel: "INFO",
};

/**
 * 设置页面组件
 * 继承 PluginSettingTab，在 Obsidian 设置界面中渲染配置项
 * 用户修改后立即调用 plugin.saveSettings() 持久化到 data.json
 */
export class ObsidianTodoSettingTab extends PluginSettingTab {
  plugin: ObsidianTodoPlugin;

  /**
   * @param app - Obsidian 应用实例
   * @param plugin - 当前插件实例，用于读写 settings
   */
  constructor(app: App, plugin: ObsidianTodoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * 渲染设置页面
   * Obsidian 在用户打开设置页时自动调用此方法
   * 每次调用先清空容器再重新渲染，确保显示最新数据
   */
  display(): void {
    const { containerEl } = this;
    // 清空容器，避免重复渲染导致内容叠加
    containerEl.empty();

    containerEl.createEl("h2", { text: "Obsidian Todo Settings" });

    // --- 数据文件夹配置 ---
    new Setting(containerEl)
      .setName("Todo data folder")
      .setDesc("Vault folder where todo data files are stored")
      .addText((text) =>
        text
          .setPlaceholder("todo")
          // 读取当前值填充输入框
          .setValue(this.plugin.settings.todoFolder)
          // 用户修改后立即保存
          .onChange(async (value) => {
            this.plugin.settings.todoFolder = value;
            await this.plugin.saveSettings();
          })
      );

    // --- 默认列表名称配置 ---
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

    // --- 日志级别配置 ---
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
            // 立即生效，不用重启插件
            logger.setLevel(LogLevel[value as keyof typeof LogLevel]);
            await this.plugin.saveSettings();
          })
      );
  }
}
