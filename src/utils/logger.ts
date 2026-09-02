/**
 * 日志工具模块
 * 提供分级日志能力（DEBUG / INFO / WARN / ERROR），统一前缀便于在控制台过滤
 * 插件启动时根据用户设置的日志级别动态调整输出 verbosity
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * 插件日志器
 * 单例模式，在整个插件生命周期内共享同一实例
 * 所有日志输出带 [ObsidianTodo] 前缀，方便在 DevTools 中筛选
 */
class Logger {
  // 当前日志级别，低于此级别的日志会被静默丢弃
  private level: LogLevel = LogLevel.INFO;
  private prefix = "[ObsidianTodo]";

  /**
   * 动态调整日志级别
   * @param level - 新的日志级别，用户在设置页修改时调用
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * DEBUG 级别日志，用于开发阶段的详细调试信息
   * 生产环境中通常被过滤掉
   */
  debug(...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(this.prefix, ...args);
    }
  }

  /**
   * INFO 级别日志，记录插件正常运行的关键事件
   * 如插件加载、设置变更等
   */
  info(...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info(this.prefix, ...args);
    }
  }

  /**
   * WARN 级别日志，表示非致命的异常或降级情况
   * 如配置缺失使用默认值、文件不存在等
   */
  warn(...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.prefix, ...args);
    }
  }

  /**
   * ERROR 级别日志，表示需要关注的严重错误
   * 如数据读写失败、API 调用异常等
   */
  error(...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(this.prefix, ...args);
    }
  }
}

// 导出单例，全插件共享同一个 Logger 实例
export const logger = new Logger();
