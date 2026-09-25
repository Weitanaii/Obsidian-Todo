import { Vault } from "obsidian";
import { StorageService } from "./StorageService";
import { RecurrenceSeries } from "../models/RecurrenceSeries";

interface RecurrenceSeriesDatabase {
  series: RecurrenceSeries[];
}

const FILENAME = "recurrence-series.json";

export class RecurrenceSeriesService {
  private storage: StorageService;
  private series: RecurrenceSeries[] = [];
  private loaded = false;

  constructor(vault: Vault, folder: string) {
    this.storage = new StorageService(vault, folder);
  }

  async init(): Promise<void> {
    await this.storage.init();
    const db = await this.storage.read<RecurrenceSeriesDatabase>(FILENAME);
    this.series = db?.series ?? [];
    this.loaded = true;
  }

  getAll(): RecurrenceSeries[] {
    this.ensureLoaded();
    return [...this.series];
  }

  get(id: string): RecurrenceSeries | undefined {
    this.ensureLoaded();
    return this.series.find((item) => item.id === id);
  }

  async upsert(item: RecurrenceSeries): Promise<RecurrenceSeries> {
    this.ensureLoaded();
    const index = this.series.findIndex((entry) => entry.id === item.id);
    item.updatedAt = new Date().toISOString();
    if (index >= 0) this.series[index] = item;
    else this.series.push(item);
    await this.save();
    return item;
  }

  async remove(id: string): Promise<boolean> {
    this.ensureLoaded();
    const before = this.series.length;
    this.series = this.series.filter((item) => item.id !== id);
    if (before === this.series.length) return false;
    await this.save();
    return true;
  }

  clearCache(): void { this.storage.clearCache(); }

  private async save(): Promise<void> {
    await this.storage.write<RecurrenceSeriesDatabase>(FILENAME, { series: this.series });
  }

  private ensureLoaded(): void {
    if (!this.loaded) throw new Error("RecurrenceSeriesService not initialized. Call init() first.");
  }
}
