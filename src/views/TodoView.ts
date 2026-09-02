import { ItemView, Menu, WorkspaceLeaf } from "obsidian";
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
    container.addClass("obsidian-todo-sidebar");

    const nav = container.createDiv({ cls: "todo-nav" });
    this.taskListEl = container.createDiv({ cls: "todo-task-list" });
    const quick = container.createDiv({ cls: "todo-quick-add" });

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
    addListBtn.addEventListener("click", async () => {
      await this.createListByInput();
    });

    await this.activateNav(this.plugin.settings.activeViewNav);
    await this.renderLists();
    this.quickInputEl = quick.createEl("input", { attr: { placeholder: "添加任务..." } });
    this.updateQuickPlaceholder();
    this.quickInputEl.addEventListener("keydown", async (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        await this.createTaskFromQuickInput();
      }
    });
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

    normalizeTasks(tasks).forEach((task) => {
      const row = this.taskListEl.createDiv({
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

      const currentView = this.plugin.settings.selectedListId ? "list" : this.plugin.settings.activeViewNav;

      checkbox.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (task.isCompleted) {
          await this.plugin.taskService.update(task.id, {
            isCompleted: false,
            completedAt: null,
          });
        } else {
          await this.plugin.taskService.update(task.id, {
            isCompleted: true,
            completedAt: new Date().toISOString(),
          });
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
    });
  }

  
  private renderEmptyState(view: "myday" | "all" | "list"): void {
    const empty = this.taskListEl.createDiv({ cls: "todo-empty-state todo-guide" });

    if (view === "myday") {
      empty.createDiv({ cls: "todo-empty-title", text: "今天还没有安排" });
      empty.createDiv({ cls: "todo-empty-desc", text: "从下方输入一个任务，或从其它列表把重要事项加入今天计划。" });
      const action = empty.createDiv({ cls: "todo-empty-action", text: "添加一个今日任务" });
      action.addEventListener("click", () => this.focusQuickInput());
      return;
    }

    if (view === "all") {
      empty.createDiv({ cls: "todo-empty-title", text: "还没有任务" });
      empty.createDiv({ cls: "todo-empty-desc", text: "在输入框里写下第一件要做的事，按回车即可创建。" });
      const action = empty.createDiv({ cls: "todo-empty-action", text: "立即创建任务" });
      action.addEventListener("click", () => this.focusQuickInput());
      return;
    }

    empty.createDiv({ cls: "todo-empty-title", text: "当前列表是空的" });
    empty.createDiv({ cls: "todo-empty-desc", text: "给这个清单起一个明确目标，然后先添加第一件最小行动项。" });
    const action = empty.createDiv({ cls: "todo-empty-action", text: "为当前列表新增任务" });
    action.addEventListener("click", () => this.focusQuickInput());
  }

  private async createListByInput(): Promise<void> {
    const name = prompt("请输入新列表名称");
    if (!name?.trim()) return;
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
    if (this.quickInputEl) {
      this.quickInputEl.focus();
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
