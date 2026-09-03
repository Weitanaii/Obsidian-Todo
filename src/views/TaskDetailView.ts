import { App } from "obsidian";
import type { TodoPluginLike } from "./TodoView";
import type { Task } from "../models/Task";

export class TaskDetailView {
  private app: App;
  private plugin: TodoPluginLike;
  private root: HTMLElement;
  private taskId: string | null = null;
  private titleInput!: HTMLInputElement;
  private noteInput!: HTMLTextAreaElement;
  
  private pendingSave: Promise<void> | null = null;
  private onTaskUpdated?: (taskId: string) => void;
  private onClose?: () => void;

  constructor(app: App, plugin: TodoPluginLike, root: HTMLElement, onTaskUpdated?: (taskId: string) => void, onClose?: () => void) {
    this.app = app;
    this.plugin = plugin;
    this.root = root;
    this.onTaskUpdated = onTaskUpdated;
    this.onClose = onClose;
    this.root.addClass("todo-detail-panel");
    this.renderEmpty();
  }

  isActive(): boolean {
    return this.taskId !== null;
  }

  getTaskId(): string | null {
    return this.taskId;
  }

  open(taskId: string): void {
    this.taskId = taskId;
    void this.renderCurrentTask();
  }

  close(): void {
    this.taskId = null;
    this.renderEmpty();
  }

  refresh(task: Task): void {
    if (task.id !== this.taskId) return;
    this.applyValues(task, { fullRefresh: true });
  }

  private renderEmpty(): void {
    this.root.empty();
    this.root.removeClass("todo-detail-active");
    const empty = this.root.createDiv({ cls: "todo-detail-empty" });
    empty.createDiv({ cls: "todo-detail-empty-title", text: "选择一个任务查看详情" });
    empty.createDiv({ cls: "todo-detail-empty-desc", text: "点击列表中的任务后，可在此处编辑标题、备注、完成状态与重要状态。" });
  }

  private async renderCurrentTask(): Promise<void> {
    if (this.pendingSave) await this.pendingSave;
    const task = this.getTask();
    if (!task) {
      this.renderEmpty();
      return;
    }

    this.root.empty();
    this.root.addClass("todo-detail-active");

    const header = this.root.createDiv({ cls: "todo-detail-header" });
    header.createDiv({ cls: "todo-detail-title", text: "任务详情" });
    const closeBtn = header.createEl("button", { cls: "todo-detail-close", text: "关闭" });
    closeBtn.addEventListener("click", () => {
      this.plugin.settings.selectedTaskId = null;
      void this.plugin.saveSettings();
      this.close();
      this.onClose?.();
    });

    const form = this.root.createDiv({ cls: "todo-detail-form" });

    this.titleInput = this.createTextRow(form, "标题", task.title || "未命名任务", "给任务起一个清晰的名字");
    this.noteInput = this.createNoteRow(form, "备注", task.note || "", "补充说明、下一步行动或相关上下文");

    this.titleInput.addEventListener("blur", () => {
      const next = this.titleInput.value.trim();
      if (!next) {
        this.titleInput.value = task.title || "未命名任务";
        return;
      }
      if (next !== task.title) void this.saveChanges({ title: next });
    });

    this.titleInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this.titleInput.blur();
      }
    });

    this.noteInput.addEventListener("blur", () => {
      const next = this.noteInput.value;
      if (next !== (task.note || "")) void this.saveChanges({ note: next });
    });
  }

  private createTextRow(parent: HTMLElement, label: string, value: string, placeholder: string): HTMLInputElement {
    const row = parent.createDiv({ cls: "todo-detail-row" });
    row.createDiv({ cls: "todo-detail-label", text: label });
    const input = row.createEl("input", { cls: "todo-detail-input", attr: { type: "text", placeholder } }) as HTMLInputElement;
    input.value = value;
    return input;
  }

  private createNoteRow(parent: HTMLElement, label: string, value: string, placeholder: string): HTMLTextAreaElement {
    const row = parent.createDiv({ cls: "todo-detail-row todo-detail-row-note" });
    row.createDiv({ cls: "todo-detail-label", text: label });
    const input = row.createEl("textarea", { cls: "todo-detail-textarea", attr: { rows: "8", placeholder } }) as HTMLTextAreaElement;
    input.value = value;
    return input;
  }

  private applyValues(task: Task, options: { fullRefresh?: boolean } = {}): void {
    if (!this.root.hasClass("todo-detail-active")) return;

    if (options.fullRefresh) {
      this.titleInput.value = task.title || "未命名任务";
      this.noteInput.value = task.note || "";
      return;
    }

    // status fields are managed via list row interactions
  }

  private async saveChanges(changes: Partial<Task>): Promise<void> {
    const taskId = this.taskId;
    if (!taskId) return;
    const p = this.plugin.taskService.update(taskId, changes).then((updated) => {
      if (updated && this.taskId === taskId) this.applyValues(updated);
      if (this.pendingSave === p) this.pendingSave = null;
      this.onTaskUpdated?.(taskId);
    });
    this.pendingSave = p;
    return p;
  }

  private getTask(): Task | undefined {
    const taskId = this.taskId;
    if (!taskId) return undefined;
    return this.plugin.taskService.getAll().find((task) => task.id === taskId);
  }
}
