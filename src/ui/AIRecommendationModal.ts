import { App, Modal, Notice, setIcon } from "obsidian";
import type { Task } from "../models/Task";
import { t } from "../i18n";
import { AIRecommendation, AIProvider, validateRecommendation, isSimilar } from "../services/AIRecommendationService";

export interface AIRecommendationHost {
  getTasks(): Task[];
  createTask(fields: Partial<Task>): Promise<Task>;
  updateTask(id: string, changes: Partial<Task>): Promise<Task | null>;
  refresh(): Promise<void>;
  openTaskDetail(taskId: string): void;
}

export class AIRecommendationModal extends Modal {
  private readonly provider: AIProvider;
  private readonly host: AIRecommendationHost;
  private readonly mode: "myday" | "month";
  private readonly date?: string;
  private readonly monthKey?: string;
  private readonly intensity: "light" | "balanced" | "high";
  private selected: AIRecommendation[] = [];
  private candidates: AIRecommendation[] = [];
  private selectedEl!: HTMLElement;
  private candidateEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private resolveDone = false;

  constructor(app: App, options: { provider: AIProvider; host: AIRecommendationHost; mode: "myday" | "month"; date?: string; monthKey?: string; intensity: "light" | "balanced" | "high" }) {
    super(app);
    this.provider = options.provider; this.host = options.host; this.mode = options.mode;
    this.date = options.date; this.monthKey = options.monthKey; this.intensity = options.intensity;
    this.modalEl.addClass("todo-ai-modal");
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t(this.mode === "myday" ? "AI 日待办推荐" : "AI 周待办推荐") });
    contentEl.createDiv({ cls: "todo-ai-modal-subtitle", text: this.mode === "myday" ? (this.date || "") : (this.monthKey || "") });
    const board = contentEl.createDiv({ cls: "todo-ai-board" });
    const selectedBox = board.createDiv({ cls: "todo-ai-dropzone todo-ai-selected-zone" });
    selectedBox.createDiv({ cls: "todo-ai-zone-title", text: t(this.mode === "myday" ? "已加入我的一天" : "已选周待办") });
    this.selectedEl = selectedBox.createDiv({ cls: "todo-ai-card-list" });
    const candidateBox = board.createDiv({ cls: "todo-ai-candidates-zone" });
    candidateBox.createDiv({ cls: "todo-ai-zone-title", text: t("AI 候选") });
    this.candidateEl = candidateBox.createDiv({ cls: "todo-ai-card-list" });
    this.statusEl = contentEl.createDiv({ cls: "todo-ai-status" });
    const actions = contentEl.createDiv({ cls: "todo-ai-actions" });
    const refreshBtn = actions.createEl("button", { text: t("刷新候选") }); setIcon(refreshBtn, "refresh-cw");
    const cancelBtn = actions.createEl("button", { text: t("取消") });
    const saveBtn = actions.createEl("button", { text: t(this.mode === "myday" ? "加入我的一天" : "写入周计划"), cls: "mod-cta" });
    refreshBtn.addEventListener("click", () => void this.generate());
    cancelBtn.addEventListener("click", () => this.close());
    saveBtn.addEventListener("click", () => void this.save());
    this.selectedEl.addEventListener("dragover", (ev) => ev.preventDefault());
    this.selectedEl.addEventListener("drop", (ev) => { ev.preventDefault(); const id = ev.dataTransfer?.getData("text/plain"); if (id) this.moveToSelected(id); });
    this.candidateEl.addEventListener("dragover", (ev) => ev.preventDefault());
    this.candidateEl.addEventListener("drop", (ev) => { ev.preventDefault(); const id = ev.dataTransfer?.getData("text/plain"); if (id) this.moveToCandidates(id); });
    await this.generate();
  }

  onClose(): void { this.contentEl.empty(); }

  private async generate(): Promise<void> {
    this.statusEl?.setText(t("正在生成推荐..."));
    try {
      const context = { tasks: this.host.getTasks(), date: this.date, monthKey: this.monthKey, intensity: this.intensity };
      const fresh = this.mode === "myday" ? await this.provider.recommendMyDay(context) : await this.provider.recommendMonthWeeks(context);
      this.candidates = fresh.filter((item) => !this.selected.some((s) => s.id === item.id));
      this.render();
      this.statusEl.setText(this.candidates.length ? "" : t(this.mode === "month" ? "暂无可生成的周待办" : "暂无新的推荐任务"));
    } catch (error) {
      console.error("AI recommendation failed", error);
      this.statusEl.setText(t("AI 推荐失败，请稍后重试"));
    }
  }

  private render(): void {
    this.selectedEl.empty(); this.candidateEl.empty();
    this.selected.forEach((item) => this.renderCard(this.selectedEl, item, true));
    this.candidates.forEach((item) => this.renderCard(this.candidateEl, item, false));
  }

  private renderCard(container: HTMLElement, item: AIRecommendation, isSelected: boolean): void {
    const card = container.createDiv({ cls: "todo-ai-card", attr: { draggable: "true", "data-ai-id": item.id } });
    const head = card.createDiv({ cls: "todo-ai-card-head" });
    head.createSpan({ cls: "todo-ai-card-title", text: item.title });
    head.createSpan({ cls: "todo-ai-card-duration", text: `${item.durationMinutes} min` });
    if (item.weekStart && item.weekEnd) card.createDiv({ cls: "todo-ai-card-meta", text: `${item.planPeriodKey} · ${item.weekStart} ~ ${item.weekEnd}` });
    if (item.myDayDate) card.createDiv({ cls: "todo-ai-card-meta", text: `${item.myDayDate} · ${t(item.myDayGroup === "morning" ? "早上" : item.myDayGroup === "afternoon" ? "下午" : item.myDayGroup === "evening" ? "晚上" : "全天")}` });
    if (item.note) card.createDiv({ cls: "todo-ai-card-note", text: item.note });
    if (item.reason) card.createDiv({ cls: "todo-ai-card-reason", text: t(item.reason) });
    if (item.warning) card.createDiv({ cls: "todo-ai-card-warning", text: t(item.warning) });
    card.addEventListener("dragstart", (ev) => { ev.dataTransfer?.setData("text/plain", item.id); });
    card.addEventListener("click", () => {
      if (item.sourceTaskId) this.host.openTaskDetail(item.sourceTaskId);
      else this.editCard(item, card);
    });
    if (isSelected) card.addClass("is-selected");
  }

  private editCard(item: AIRecommendation, card: HTMLElement): void {
    const title = card.querySelector(".todo-ai-card-title");
    if (!(title instanceof HTMLElement)) return;
    const input = card.createEl("input", { cls: "todo-ai-card-edit" }); input.value = item.title; input.focus();
    input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { item.title = input.value.trim() || item.title; input.remove(); title.setText(item.title); } });
  }

  private moveToSelected(id: string): void {
    const item = this.candidates.find((candidate) => candidate.id === id); if (!item) return;
    this.candidates = this.candidates.filter((candidate) => candidate.id !== id); this.selected.push(item); this.render();
  }

  private moveToCandidates(id: string): void {
    const item = this.selected.find((candidate) => candidate.id === id); if (!item) return;
    this.selected = this.selected.filter((candidate) => candidate.id !== id); this.candidates.push(item); this.render();
  }

  private async save(): Promise<void> {
    if (!this.selected.length) { new Notice(t("请先选择至少一个推荐")); return; }
    const tasks = this.host.getTasks(); let saved = 0; let skipped = 0;
    for (const item of this.selected) {
      const error = validateRecommendation(item); if (error) { skipped++; continue; }
      const duplicate = tasks.some((task) => !task.isDeleted && isSimilar(task.title, item.title) && (this.mode === "month" ? task.planPeriodKey === item.planPeriodKey : task.myDayDate === item.myDayDate));
      if (duplicate) { skipped++; continue; }
      if (item.sourceTaskId) {
        const updated = await this.host.updateTask(item.sourceTaskId, { myDayDate: item.myDayDate, myDayGroup: item.myDayGroup, startDate: item.startDate, dueDate: item.dueDate });
        if (updated) saved++;
      } else {
        await this.host.createTask({ title: item.title, note: item.note, listId: item.listId, tags: item.tags, isImportant: item.isImportant, myDayDate: item.myDayDate ?? null, myDayGroup: item.myDayGroup ?? "allday", startDate: item.startDate ?? null, dueDate: item.dueDate ?? null, planKind: item.planKind, planPeriodKey: item.planPeriodKey, parentId: item.parentId });
        saved++;
      }
    }
    if (saved) await this.host.refresh();
    new Notice(t("已保存") + ` ${saved}` + (skipped ? `，${t("跳过重复或无效项")} ${skipped}` : ""));
    this.close();
  }
}
