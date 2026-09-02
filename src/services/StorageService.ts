import { Vault, TFile } from "obsidian";
import { logger } from "../utils/logger";

/**
 * 存储服务 - 数据持久化层
 *
 * 职责：将 JSON 数据读写到 Vault 中的文件
 * 设计意图：
 *   - 上层服务（TaskService、ListService）不直接操作文件，全部通过此服务
 *   - 内存缓存减少磁盘读取频率，写入队列防止并发写导致数据丢失
 *   - 所有文件统一包裹在 StorageFile 结构中，包含版本号和时间戳，为未来数据迁移预留
 */

/** 存储文件的元信息，记录数据版本和写入时间 */
export interface StorageMeta {
  /** 数据格式版本号，升级数据结构时递增，配合迁移函数使用 */
  dataVersion: number;
  /** 最后写入时间 ISO 8601，用于冲突检测和调试 */
  lastModified: string;
}

/** 存储文件的完整结构，所有 JSON 文件都包裹在这个结构里 */
export interface StorageFile<T> {
  meta: StorageMeta;
  data: T;
}

// 当前数据版本号，新增字段或修改结构时递增
const CURRENT_DATA_VERSION = 1;

/**
 * 存储服务类
 * 提供 read / write / backup 三个核心能力
 * TaskService 和 ListService 各自持有一个 StorageService 实例
 */
export class StorageService {
  private vault: Vault;
  private folder: string;

  // 内存缓存：key 是文件路径，value 是解析后的数据对象
  // 避免每次操作都读磁盘，Obsidian 的 vault.read() 是异步 IO，有开销
  private cache: Map<string, unknown> = new Map();

  // 写入队列：key 是文件路径，value 是该文件的写入 Promise 链
  // 保证同一文件的多次写入串行执行，防止「读-改-写」过程中被其他写入插入
  private writeQueues: Map<string, Promise<void>> = new Map();

  /**
   * @param vault - Obsidian Vault 实例，通过 this.app.vault 获取
   * @param folder - 数据存储的 Vault 文件夹路径，如 "todo"
   */
  constructor(vault: Vault, folder: string) {
    this.vault = vault;
    this.folder = folder;
  }

  /**
   * 初始化存储目录
   * 确保数据文件夹和备份文件夹存在
   * 在 TaskService.init() 和 ListService.init() 中最先调用
   */
  async init(): Promise<void> {
    // Vault API 没有 mkdir -p，需要逐级检查
    await this.ensureFolder(this.folder);
    await this.ensureFolder(this.folder + "/backups");
    logger.info("StorageService initialized, folder:", this.folder);
  }

  /**
   * 读取 JSON 文件
   * 优先从缓存读取，缓存未命中则从磁盘读取并填充缓存
   *
   * @param filename - 文件名，如 "database.json"
   * @returns 解析后的 data 部分，文件不存在或解析失败时返回 null
   */
  async read<T>(filename: string): Promise<T | null> {
    const path = this.getPath(filename);

    // 先查缓存，命中则直接返回，避免磁盘 IO
    if (this.cache.has(path)) {
      logger.debug("Cache hit:", path);
      return this.cache.get(path) as T;
    }

    try {
      // 文件不存在是正常场景（首次运行），返回 null 让调用方初始化默认数据
      if (!(await this.vault.adapter.exists(path))) {
        logger.debug("File not found:", path);
        return null;
      }
      const file = this.vault.getAbstractFileByPath(path);
      let raw: string;
      if (file instanceof TFile) {
        raw = await this.vault.read(file);
      } else {
        // Obsidian 索引可能未同步，fallback 到 adapter 直接读取
        raw = await this.vault.adapter.read(path);
      }
      const parsed = JSON.parse(raw) as StorageFile<T>;
      // 读取成功后填充缓存，后续读取直接命中
      this.cache.set(path, parsed.data);
      logger.debug("Read from disk:", path);
      return parsed.data;
    } catch (e) {
      // JSON 解析失败或文件读取异常，返回 null 而不是抛出，让上层决定如何降级
      logger.error("Failed to read:", path, e);
      return null;
    }
  }

  /**
   * 写入 JSON 文件
   * 通过写入队列串行化，防止并发写导致数据丢失
   *
   * 串行化原理：每次 write() 调用会等前一次同文件的写入完成后才执行
   * 这样即使用户快速连续操作（如连续勾选多个任务），也不会出现「后写覆盖先写」的问题
   *
   * @param filename - 文件名
   * @param data - 要写入的数据，会被包裹在 StorageFile 结构中
   */
  async write<T>(filename: string, data: T): Promise<void> {
    const path = this.getPath(filename);

    // 串行化：取出该文件上一次写入的 Promise，等它完成后再执行本次写入
    const prev = this.writeQueues.get(path) || Promise.resolve();
    const next = prev.then(async () => {
      try {
        // 包裹元信息，用于未来数据迁移和调试
        const file: StorageFile<T> = {
          meta: {
            dataVersion: CURRENT_DATA_VERSION,
            lastModified: new Date().toISOString(),
          },
          data,
        };
        const content = JSON.stringify(file, null, 2);

        if (await this.vault.adapter.exists(path)) {
          // 文件已存在，用 modify 而不是 delete + create，保留文件元数据
          const existing = this.vault.getAbstractFileByPath(path);
          if (existing instanceof TFile) {
            await this.vault.modify(existing, content);
          } else {
            // fallback: 索引未同步时用 adapter 写入
            await this.vault.adapter.write(path, content);
          }
        } else {
          // 文件不存在，首次创建
          await this.vault.create(path, content);
        }

        // 写入成功后更新缓存，保持缓存和磁盘一致
        this.cache.set(path, data);
        logger.debug("Written:", path);
      } catch (e) {
        logger.error("Failed to write:", path, e);
      }
    });

    // 将本次写入注册到队列，下次同文件的写入会等这个完成
    this.writeQueues.set(path, next);
    await next;
  }

  /**
   * 创建数据快照备份
   * 每天只保留一份备份，同一天内重复备份会覆盖
   * 备份文件名格式：{日期}_{原文件名}，如 2026-09-02_database.json
   *
   * @param filename - 要备份的文件名
   */
  async backup(filename: string): Promise<void> {
    const path = this.getPath(filename);
    try {
      // 源文件不存在则跳过备份
      if (!(await this.vault.adapter.exists(path))) return;

      const raw = await this.vault.read((this.vault.getAbstractFileByPath(path) as TFile));
      // 用日期作为备份文件名前缀，同一天只保留最新一份
      const date = new Date().toISOString().split("T")[0];
      const backupPath = `${this.folder}/backups/${date}_${filename}`;

      if (await this.vault.adapter.exists(backupPath)) {
        // 当天已有备份，覆盖更新
        const backupFile = this.vault.getAbstractFileByPath(backupPath);
        if (backupFile instanceof TFile) {
          await this.vault.modify(backupFile, raw);
        } else {
          await this.vault.adapter.write(backupPath, raw);
        }
      } else {
        await this.vault.create(backupPath, raw);
      }
      logger.info("Backup created:", backupPath);
    } catch (e) {
      // 备份失败不应阻断主流程，只记录日志
      logger.error("Backup failed:", filename, e);
    }
  }

  /**
   * 清除缓存，强制下次 read 从磁盘读取
   * 使用场景：外部修改了文件（如用户手动编辑 JSON），需要刷新缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /** 获取文件的完整 Vault 路径 */
  private getPath(filename: string): string {
    return `${this.folder}/${filename}`;
  }

  /** 确保文件夹存在，不存在则创建 */
  private async ensureFolder(path: string): Promise<void> {
    if (!(await this.vault.adapter.exists(path))) {
      await this.vault.createFolder(path);
    }
  }
}
