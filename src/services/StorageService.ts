import { Vault, TFile } from "obsidian";
import { logger } from "../utils/logger";

export interface StorageMeta {
  
  dataVersion: number;
  
  lastModified: string;
}

export interface StorageFile<T> {
  meta: StorageMeta;
  data: T;
}

const CURRENT_DATA_VERSION = 1;

export class StorageService {
  private vault: Vault;
  private folder: string;

  
  
  private cache: Map<string, unknown> = new Map();

  
  
  private writeQueues: Map<string, Promise<void>> = new Map();

  
  constructor(vault: Vault, folder: string) {
    this.vault = vault;
    this.folder = folder;
  }

  
  async init(): Promise<void> {
    
    await this.ensureFolder(this.folder);
    await this.ensureFolder(this.folder + "/backups");
    logger.info("StorageService initialized, folder:", this.folder);
  }

  
  async read<T>(filename: string): Promise<T | null> {
    const path = this.getPath(filename);

    
    if (this.cache.has(path)) {
      logger.debug("Cache hit:", path);
      return this.cache.get(path) as T;
    }

    try {
      
      if (!(await this.vault.adapter.exists(path))) {
        logger.debug("File not found:", path);
        return null;
      }
      const file = this.vault.getAbstractFileByPath(path);
      let raw: string;
      if (file instanceof TFile) {
        raw = await this.vault.read(file);
      } else {
        
        raw = await this.vault.adapter.read(path);
      }
      const parsed = JSON.parse(raw) as StorageFile<T>;
      
      this.cache.set(path, parsed.data);
      logger.debug("Read from disk:", path);
      return parsed.data;
    } catch (e) {
      
      logger.error("Failed to read:", path, e);
      return null;
    }
  }

  
  async write<T>(filename: string, data: T): Promise<void> {
    const path = this.getPath(filename);

    
    const prev = this.writeQueues.get(path) || Promise.resolve();
    const next = prev.then(async () => {
      try {
        
        const file: StorageFile<T> = {
          meta: {
            dataVersion: CURRENT_DATA_VERSION,
            lastModified: new Date().toISOString(),
          },
          data,
        };
        const content = JSON.stringify(file, null, 2);

        if (await this.vault.adapter.exists(path)) {
          
          const existing = this.vault.getAbstractFileByPath(path);
          if (existing instanceof TFile) {
            await this.vault.modify(existing, content);
          } else {
            
            await this.vault.adapter.write(path, content);
          }
        } else {
          
          await this.vault.create(path, content);
        }

        
        this.cache.set(path, data);
        logger.debug("Written:", path);
      } catch (e) {
        logger.error("Failed to write:", path, e);
      }
    });

    
    this.writeQueues.set(path, next);
    await next;
  }

  
  async backup(filename: string): Promise<void> {
    const path = this.getPath(filename);
    try {
      
      if (!(await this.vault.adapter.exists(path))) return;

      const raw = await this.vault.read((this.vault.getAbstractFileByPath(path) as TFile));
      
      const date = new Date().toISOString().split("T")[0];
      const backupPath = `${this.folder}/backups/${date}_${filename}`;

      if (await this.vault.adapter.exists(backupPath)) {
        
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
      
      logger.error("Backup failed:", filename, e);
    }
  }

  
  clearCache(): void {
    this.cache.clear();
  }

  
  private getPath(filename: string): string {
    return `${this.folder}/${filename}`;
  }

  
  private async ensureFolder(path: string): Promise<void> {
    if (!(await this.vault.adapter.exists(path))) {
      await this.vault.createFolder(path);
    }
  }
}
