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

// 视图类型的唯一标识符
// Obsidian 用这个字符串区分不同的侧边栏视图（文件浏览、日历等）
// 目前未使用，M2 阶段注册自定义侧边栏视图时会用到
const VIEW_TYPE_TODO = "obsidian-todo-view";

// 插件主类
// export default - 默认导出，Obsidian 会找到这个类并实例化
// extends Plugin - 继承 Plugin 基类，获得所有插件 API
export default class ObsidianTodoPlugin extends Plugin {
  // 插件设置，类型为 ObsidianTodoSettings（包含 todoFolder、defaultListName、logLevel）
  // 在 loadSettings() 中赋值，整个插件生命周期内通过 this.settings 访问
  settings: ObsidianTodoSettings;

  // ============ onload() - 插件启动入口 ============
  // Obsidian 加载插件时自动调用，相当于插件的 main 函数
  // async 表示函数内可以使用 await 等待异步操作（如读取文件）
  async onload(): Promise<void> {
    // 第一步：加载用户设置
    // loadData() 是 Plugin 基类方法，读取插件目录下的 data.json
    await this.loadSettings();
    logger.info("Obsidian Todo loaded");

    // 注册设置页
    // 用户在「设置 -> 第三方插件」里点齿轮图标时，会打开这个页面
    // this.app - Obsidian 应用实例；this - 当前插件实例
    this.addSettingTab(new ObsidianTodoSettingTab(this.app, this));

    // 在左侧边栏添加图标
    // 参数1: "checklist" - Obsidian 内置图标名
    // 参数2: 鼠标悬停时显示的文字
    // 参数3: 点击图标时执行的回调函数
    // M2 阶段会把回调改为「打开侧边栏视图」
    this.addRibbonIcon("checklist", "Obsidian Todo", () => {
      logger.info("Ribbon icon clicked");
    });

    // 注册命令面板命令
    // 用户按 Ctrl+P 打开命令面板后，可以搜索到这些命令
    // id: 命令唯一标识，格式建议「插件名-动作名」
    // name: 用户在命令面板里看到的文字
    // callback: 命令被触发时执行的函数
    this.addCommand({
      id: "open-todo-sidebar",
      name: "Open Todo sidebar",
      callback: () => {
        // M2 阶段改为：激活侧边栏自定义视图
        logger.info("Command: open todo sidebar");
      },
    });

    this.addCommand({
      id: "quick-add-task",
      name: "Quick add task",
      callback: () => {
        // M2 阶段改为：弹出快速添加任务的弹窗
        logger.info("Command: quick add task");
      },
    });
  }

  // ============ onunload() - 插件关闭 ============
  // 插件被禁用或 Obsidian 关闭时自动调用
  // 目前只打印日志，后续需要在这里做清理：移除视图、取消事件监听等
  onunload(): void {
    logger.info("Obsidian Todo unloaded");
  }

  // ============ 设置读写 ============
  // 从 data.json 读取用户设置
  async loadSettings(): Promise<void> {
    // Object.assign 合并默认设置和用户保存的设置
    // 好处：插件升级新增配置项时，旧 data.json 缺少的字段会自动用默认值填充
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // 设置日志级别，根据用户配置控制控制台输出的详细程度
    // as keyof typeof LogLevel 是类型断言，告诉 TypeScript 这个字符串一定是 LogLevel 枚举的合法键名
    logger.setLevel(LogLevel[this.settings.logLevel as keyof typeof LogLevel]);
  }

  // 把当前设置写入 data.json
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
