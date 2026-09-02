
class ConfirmModal extends Modal {
  private message: string;
  private resolve!: (value: boolean) => void;

  constructor(app: App, message: string) {
    super(app);
    this.message = message;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("p", { text: this.message });

    const actions = contentEl.createDiv({ cls: "todo-prompt-actions" });
    const cancelBtn = actions.createEl("button", { text: "取消" });
    const confirmBtn = actions.createEl("button", { text: "删除", cls: "mod-warning" });

    cancelBtn.addEventListener("click", () => this.finish(false));
    confirmBtn.addEventListener("click", () => this.finish(true));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  async openAndConfirm(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  private finish(value: boolean): void {
    this.resolve(value);
    this.close();
  }
}

class PromptModal extends Modal {
  private promptText: string;
  private resolve!: (value: string | null) => void;
  private value = "";

  constructor(app: App, promptText: string) {
    super(app);
    this.promptText = promptText;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("p", { text: this.promptText });

    const input = contentEl.createEl("input", { cls: "todo-prompt-input" });
    input.value = this.value;
    input.placeholder = this.promptText;
    input.addEventListener("input", () => {
      this.value = input.value;
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this.resolveAndClose(input.value.trim());
      }
    });

    const actions = contentEl.createDiv({ cls: "todo-prompt-actions" });
    const cancelBtn = actions.createEl("button", { text: "取消" });
    const confirmBtn = actions.createEl("button", { text: "确定", cls: "mod-cta" });

    cancelBtn.addEventListener("click", () => this.resolveAndClose(null));
    confirmBtn.addEventListener("click", () => this.resolveAndClose(input.value.trim()));

    window.setTimeout(() => input.focus(), 30);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  async openAndGetValue(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  private resolveAndClose(value: string | null): void {
    this.resolve(value ?? null);
    this.close();
  }
}
import { App, ItemView, Menu, Modal, Notice, WorkspaceLeaf } from "obsidian";
import type ObsidianTodoPlugin from "../../main";
import { Task } from "../models/Task";

export type ViewNav = "myday" | "all";

export const VIEW_TYPE_TODO = "obsidian-todo-view";

export interface TodoPluginLike {
  taskService: {
    getMyDay(): Task[];
    getAll(): Task[];
    getByListId(listId: string): Task[];
    update(id: string, changes: Partial<Task>): Promise<Task | null>;
    create(fields: Partial<Task>): Promise<Task>;
    complete(id: string): Promise<Task | null>;
    uncomplete(id: string): Promise<Task | null>;
    delete(id: string): Promise<boolean>;
  };
  listService: {
    getActive(): { id: string; name: string; isDefault: boolean }[];
    getDefault(): { id: string; name: string } | undefined;
    create(fields: { name: string }): Promise<{ id: string; name: string }>;
    rename(id: string, name: string): Promise<{ id: string; name: string } | null>;
    delete(id: string): Promise<boolean>;
  };
  settings: {
    activeViewNav: ViewNav;
    selectedListId: string | null;
    completedCollapsed: boolean;
  };
  saveSettings(): Promise<void>;
}

const normalizeTasks = (tasks: Task[]) =>
  tasks
    .slice()
    .sort(
      (a, b) =>
        Number(a.isCompleted) - Number(b.isCompleted) ||
        Number(b.isImportant) - Number(a.isImportant) ||
        (a.dueDate ? 0 : 1) - (b.dueDate ? 0 : 1) ||
        a.sortOrder - b.sortOrder ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

export class TodoView extends ItemView {
  private plugin: TodoPluginLike;
  private taskListEl!: HTMLDivElement;
  private navEls: Record<ViewNav, HTMLDivElement> = {} as Record<ViewNav, HTMLDivElement>;
  private listNavEl!: HTMLDivElement;
  private listItemsEl!: HTMLDivElement;
  private quickInputEl!: HTMLInputElement;

  constructor(leaf: WorkspaceLeaf, plugin: TodoPluginLike) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_TODO;
  }

  getDisplayText(): string {
    return "Obsidian Todo";
  }

  getIcon(): string {
    return "check-square";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("obsidian-todo-tab");

    const layout = container.createDiv({ cls: "todo-layout" });
    const nav = layout.createDiv({ cls: "todo-nav" });
    const main = layout.createDiv({ cls: "todo-main" });
    this.taskListEl = main.createDiv({ cls: "todo-task-list" });
    const quick = main.createDiv({ cls: "todo-quick-add" });

    this.navEls["myday"] = nav.createDiv({ cls: "todo-nav-item", text: "我的一天" });
    this.navEls["all"] = nav.createDiv({ cls: "todo-nav-item", text: "所有任务" });

    Object.entries(this.navEls).forEach(([key, el]) => {
      el.addEventListener("click", async () => {
        await this.activateNav(key as ViewNav);
      });
    });

    this.listNavEl = nav.createDiv({ cls: "todo-nav-section" });
    this.listNavEl.createDiv({ cls: "todo-nav-label", text: "列表" });
    this.listItemsEl = this.listNavEl.createDiv({ cls: "todo-nav-lists" });

    const addListBtn = this.listNavEl.createDiv({ cls: "todo-nav-add", text: "+ 新建列表" });
    addListBtn.addEventListener("click", () => {
      void this.createListByInput();
    });

    this.quickInputEl = quick.createEl("input", { attr: { placeholder: "添加任务..." } });
    this.updateQuickPlaceholder();
    this.quickInputEl.addEventListener("keydown", async (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        await this.createTaskFromQuickInput();
      }
    });

    await this.activateNav(this.plugin.settings.activeViewNav);
    await this.renderLists();
  }

  async onClose(): Promise<void> {
    this.containerEl.empty();
  }

  private async activateNav(nav: ViewNav): Promise<void> {
    this.plugin.settings.activeViewNav = nav;
    this.plugin.settings.selectedListId = null;
    await this.plugin.saveSettings();

    Object.entries(this.navEls).forEach(([key, el]) => {
      el.toggleClass("active", key === nav);
    });
    this.listItemsEl?.querySelectorAll<HTMLDivElement>(".todo-nav-item").forEach((el) => el.removeClass("active"));

    await this.renderTasks(nav);
    this.updateQuickPlaceholder();
  }

  private async activateList(listId: string): Promise<void> {
    this.plugin.settings.activeViewNav = "all";
    this.plugin.settings.selectedListId = listId;
    await this.plugin.saveSettings();

    Object.entries(this.navEls).forEach(([, el]) => el.removeClass("active"));
    this.listItemsEl?.querySelectorAll<HTMLDivElement>(".todo-nav-item").forEach((el) => {
      el.toggleClass("active", el.dataset.listId === listId);
    });

    await this.renderTasks("list");
    this.updateQuickPlaceholder();
  }

  private async renderLists(): Promise<void> {
    if (!this.listItemsEl) return;
    this.listItemsEl.empty();

    const lists = this.plugin.listService.getActive();
    lists.forEach((list) => {
      const row = this.listItemsEl.createDiv({ cls: `todo-nav-item todo-list-item${this.plugin.settings.selectedListId === list.id ? " active" : ""}` });
      row.dataset.listId = list.id;
      row.createSpan({ cls: "todo-list-name", text: list.name });

      const actions = row.createDiv({ cls: "todo-list-actions" });
      const renameBtn = actions.createSpan({ cls: "todo-list-action", text: "重命名" });
      const deleteBtn = actions.createSpan({ cls: "todo-list-action todo-list-action-danger", text: "删除" });

      row.addEventListener("click", async () => {
        await this.activateList(list.id);
      });

      renameBtn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        await this.renameListInline(list.id, list.name, row);
      });

      deleteBtn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (list.isDefault) {
          new Notice("默认列表不可删除");
          return;
        }

        const confirmed = await new ConfirmModal(this.app, `确认删除列表「${list.name}」？`).openAndConfirm();
        if (!confirmed) {
          return;
        }

        await this.plugin.listService.delete(list.id);
        if (this.plugin.settings.selectedListId === list.id) {
          await this.activateNav("myday");
        }
        await this.renderLists();
      });
    });

    if (!lists.length) {
      this.listItemsEl.createDiv({ cls: "todo-empty-state", text: "还没有列表" });
    }
  }

  private async renderTasks(view: ViewNav | "list"): Promise<void> {
    this.taskListEl.empty();
    let tasks: Task[] = [];

    if (view === "myday") {
      tasks = this.plugin.taskService.getMyDay();
    } else if (view === "all") {
      tasks = this.plugin.taskService.getAll();
    } else {
      const listId = this.plugin.settings.selectedListId;
      tasks = listId ? this.plugin.taskService.getByListId(listId) : [];
    }

    if (!tasks.length) {
      this.renderEmptyState(view);
      return;
    }

    const sorted = normalizeTasks(tasks);
    const incomplete = sorted.filter((t) => !t.isCompleted);
    const completed = sorted.filter((t) => t.isCompleted);
    const currentView = this.plugin.settings.selectedListId ? "list" : this.plugin.settings.activeViewNav;

    incomplete.forEach((task) => this.renderTaskRow(this.taskListEl, task, currentView));

    if (completed.length) {
      const group = this.taskListEl.createDiv({ cls: "todo-completed-group" });
      const header = group.createDiv({ cls: "todo-completed-header" });
      const arrow = header.createSpan({
        cls: `todo-completed-arrow${this.plugin.settings.completedCollapsed ? " collapsed" : ""}`,
        text: "▼",
      });
      header.createSpan({ cls: "todo-completed-label", text: `已完成 ${completed.length}` });

      const list = group.createDiv({ cls: "todo-completed-list" });
      if (this.plugin.settings.completedCollapsed) {
        list.style.display = "none";
      }

      completed.forEach((task) => this.renderTaskRow(list, task, currentView));

      header.addEventListener("click", async () => {
        this.plugin.settings.completedCollapsed = !this.plugin.settings.completedCollapsed;
        await this.plugin.saveSettings();
        list.style.display = this.plugin.settings.completedCollapsed ? "none" : "";
        arrow.toggleClass("collapsed", this.plugin.settings.completedCollapsed);
      });
    }
  }

  private renderTaskRow(container: HTMLDivElement, task: Task, currentView: "myday" | "all" | "list"): void {
    const row = container.createDiv({
      cls: `todo-task-item${task.isCompleted ? " completed" : ""}${task.isImportant ? " important-row" : ""}`,
    });

    const checkbox = row.createDiv({
      cls: `todo-checkbox${task.isCompleted ? " checked" : ""}`,
      text: task.isCompleted ? "✓" : "",
    });

    const content = row.createDiv({ cls: "todo-task-content" });
    const title = content.createDiv({ cls: "todo-task-title", text: task.title || "未命名任务" });
    title.toggleClass("todo-task-muted", task.isCompleted);

    if (task.dueDate) {
      const due = content.createDiv({ cls: "todo-task-due", text: task.dueDate.slice(0, 10) });
      due.toggleClass("todo-task-due-overdue", !task.isCompleted && task.dueDate < new Date().toISOString());
    }

    const star = row.createDiv({
      cls: `todo-star${task.isImportant ? " important" : ""}`,
      text: task.isImportant ? "★" : "☆",
    });

    checkbox.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (task.isCompleted) {
        await this.plugin.taskService.update(task.id, { isCompleted: false, completedAt: null });
      } else {
        await this.plugin.taskService.update(task.id, { isCompleted: true, completedAt: new Date().toISOString() });
      }
      await this.renderTasks(currentView);
    });

    star.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await this.plugin.taskService.update(task.id, { isImportant: !task.isImportant });
      await this.renderTasks(currentView);
    });

    row.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      this.showTaskContextMenu(ev, task, currentView);
    });
  }

  
  private renderEmptyState(view: "myday" | "all" | "list"): void {
    const empty = this.taskListEl.createDiv({ cls: "todo-empty-state todo-guide" });

    if (view === "myday") {
      empty.createDiv({ cls: "todo-empty-title", text: "今天还没有安排" });
      empty.createDiv({ cls: "todo-empty-desc", text: "从下方输入一个任务，或从其它列表把重要事项加入今天计划。" });
      const action = empty.createDiv({ cls: "todo-empty-action", text: "添加一个今日任务" });
      action.addEventListener("click", () => {
        void this.promptQuickCreate();
      });
      return;
    }

    if (view === "all") {
      empty.createDiv({ cls: "todo-empty-title", text: "还没有任务" });
      empty.createDiv({ cls: "todo-empty-desc", text: "在输入框里写下第一件要做的事，按回车即可创建。" });
      const action = empty.createDiv({ cls: "todo-empty-action", text: "立即创建任务" });
      action.addEventListener("click", () => {
        void this.promptQuickCreate();
      });
      return;
    }

    empty.createDiv({ cls: "todo-empty-title", text: "当前列表是空的" });
    empty.createDiv({ cls: "todo-empty-desc", text: "给这个清单起一个明确目标，然后先添加第一件最小行动项。" });
    const action = empty.createDiv({ cls: "todo-empty-action", text: "为当前列表新增任务" });
    action.addEventListener("click", () => {
      void this.promptQuickCreate();
    });
  }

  private async createListByInput(): Promise<void> {
    const name = await new PromptModal(this.app, "请输入新列表名称").openAndGetValue();
    if (!name?.trim()) {
      return;
    }

    const created = await this.plugin.listService.create({ name: name.trim() });
    await this.renderLists();
    await this.activateList(created.id);
  }

  private async renameListInline(listId: string, currentName: string, row: HTMLDivElement): Promise<void> {
    const nameEl = row.querySelector<HTMLElement>(".todo-list-name");
    if (!nameEl) return;

    const input = document.createElement("input");
    input.className = "todo-list-rename-input";
    input.value = currentName;
    nameEl.replaceWith(input);
    input.focus();

    const commit = async () => {
      const next = input.value.trim() || currentName;
      await this.plugin.listService.rename(listId, next);
      await this.renderLists();
    };

    input.addEventListener("blur", () => {
      void commit();
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        void commit();
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        void this.renderLists();
      }
    });
  }

  focusQuickInput(): void {
    if (!this.quickInputEl) {
      this.promptQuickCreate();
      return;
    }

    this.quickInputEl.scrollIntoView({ behavior: "smooth", block: "end" });
    this.quickInputEl.focus({ preventScroll: true });

    if (document.activeElement !== this.quickInputEl) {
      this.promptQuickCreate();
    }
  }

  private updateQuickPlaceholder(): void {
    const { activeViewNav, selectedListId } = this.plugin.settings;
    if (activeViewNav === "myday") {
      this.quickInputEl.placeholder = "添加任务到我的一天...";
      return;
    }
    if (selectedListId) {
      const list = this.plugin.listService.getActive().find((l) => l.id === selectedListId);
      this.quickInputEl.placeholder = list ? `添加任务到「${list.name}」...` : "添加任务到当前列表...";
      return;
    }
    this.quickInputEl.placeholder = "添加任务到默认列表...";
  }

  
  async promptQuickCreate(): Promise<void> {
    const title = await new PromptModal(this.app, "输入任务标题").openAndGetValue();
    if (!title?.trim()) {
      return;
    }

    const { activeViewNav, selectedListId } = this.plugin.settings;
    let listId = selectedListId || undefined;

    if (!listId) {
      const defaultList = this.plugin.listService.getDefault();
      listId = defaultList?.id;
    }

    if (!listId) {
      return;
    }

    this.plugin.taskService
      .create({
        title: title.trim(),
        listId,
        isMyDay: activeViewNav === "myday",
      })
      .then(async () => {
        await this.renderLists();
        await this.renderTasks(selectedListId ? "list" : activeViewNav);
      });
  }

  private async createTaskFromQuickInput(): Promise<void> {
    const title = this.quickInputEl.value.trim();
    if (!title) return;

    const { activeViewNav, selectedListId } = this.plugin.settings;
    let listId = selectedListId || undefined;

    if (!listId) {
      const defaultList = this.plugin.listService.getDefault();
      listId = defaultList?.id;
    }

    if (!listId) {
      return;
    }

    await this.plugin.taskService.create({
      title,
      listId,
      isMyDay: activeViewNav === "myday",
    });

    this.quickInputEl.value = "";
    await this.renderLists();
    await this.renderTasks(selectedListId ? "list" : activeViewNav);
  }


  private showTaskContextMenu(ev: MouseEvent, task: Task, currentView: "myday" | "all" | "list"): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle(task.isCompleted ? "标记为未完成" : "标记为已完成")
        .setIcon(task.isCompleted ? "circle" : "check-circle")
        .onClick(async () => {
          if (task.isCompleted) {
            await this.plugin.taskService.uncomplete(task.id);
          } else {
            await this.plugin.taskService.complete(task.id);
          }
          await this.renderTasks(currentView);
        }),
    );

    menu.addItem((item) =>
      item
        .setTitle(task.isImportant ? "取消重要" : "标记为重要")
        .setIcon(task.isImportant ? "star" : "star")
        .onClick(async () => {
          await this.plugin.taskService.update(task.id, { isImportant: !task.isImportant });
          await this.renderTasks(currentView);
        }),
    );

    const lists = this.plugin.listService.getActive().filter((l) => l.id !== task.listId);
    if (lists.length) {
      lists.forEach((list) => {
        menu.addItem((item) =>
          item
            .setTitle(`移动到「${list.name}」`)
            .setIcon("folder")
            .onClick(async () => {
              await this.plugin.taskService.update(task.id, { listId: list.id });
              await this.renderLists();
              await this.renderTasks(currentView);
            }),
        );
      });
    }

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle("删除任务")
        .setIcon("trash")
        .onClick(async () => {
          await this.plugin.taskService.delete(task.id);
          await this.renderLists();
          await this.renderTasks(currentView);
        }),
    );

    menu.showAtMouseEvent(ev);
  }

}



