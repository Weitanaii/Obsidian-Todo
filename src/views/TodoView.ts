
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
import { App, ItemView, Menu, Modal, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import type ObsidianTodoPlugin from "../../main";
import { Task, MyDayGroup, PlanKind } from "../models/Task";
import { currentPeriodKey, periodLabel, subGroupLabel, periodKeySort, getSubPeriodKeysForParent, getParentPeriodKey, ageFromDueDate, currentAge } from "../utils/period";
import { TaskDetailView } from "./TaskDetailView";
import { sortTasks, getMyDayGroupFromTime } from "../utils/sort";
import type { SortConfig, SortField, SortDirection } from "../utils/sort";

export type ViewNav = "myday" | "all" | "inbox" | "plan";

export const VIEW_TYPE_TODO = "obsidian-todo-view";



const MYDAY_GROUPS: { key: MyDayGroup; label: string }[] = [
  { key: "allday", label: "全天" },
  { key: "morning", label: "早上" },
  { key: "noon", label: "中午" },
  { key: "afternoon", label: "下午" },
  { key: "evening", label: "晚上" },
];

const SORT_FIELD_LABELS: Record<SortField, string> = {
  importance: "按重要程度",
  dueDate: "按截止日期",
  createdAt: "按创建时间",
  title: "按标题",
};

export interface TodoPluginLike {
  taskService: {
    getMyDay(): Task[];
    getInbox(defaultListId: string): Task[];
    getAll(): Task[];
    getByListId(listId: string): Task[];
    update(id: string, changes: Partial<Task>): Promise<Task | null>;
    create(fields: Partial<Task>): Promise<Task>;
    complete(id: string): Promise<Task | null>;
    uncomplete(id: string): Promise<Task | null>;
    delete(id: string): Promise<boolean>;
    getByPlanKindAndPeriod(kind: PlanKind, periodKey: string): Task[];
    getChildrenOf(parentId: string): Task[];
    countChildren(parentId: string): number;
    getParentOf(taskId: string): Task | undefined;
  };
  listService: {
    getActive(): { id: string; name: string; isDefault: boolean; groupId: string | null }[];
    getDefault(): { id: string; name: string } | undefined;
    create(fields: { name: string }): Promise<{ id: string; name: string }>;
    rename(id: string, name: string): Promise<{ id: string; name: string } | null>;
    delete(id: string): Promise<boolean>;
    update(id: string, changes: { groupId?: string | null; name?: string; sortOrder?: number }): Promise<{ id: string; name: string; groupId: string | null } | null>;
  };
  tagService: {
    getAll(): { id: string; name: string; color: string; icon: string; isDefault: boolean; sortOrder: number }[];
    getById(id: string): { id: string; name: string; color: string; icon: string } | undefined;
    getQuadrantTags(): { id: string; name: string; color: string; icon: string; sortOrder: number }[];
    getQuadrantTagForTask(tagIds: string[]): { id: string; name: string; sortOrder: number } | undefined;
  };
  groupService: {
    getAll(): { id: string; name: string; isCollapsed: boolean; sortOrder: number }[];
    create(fields: { name: string }): Promise<{ id: string; name: string }>;
    rename(id: string, name: string): Promise<{ id: string; name: string } | null>;
    toggleCollapse(id: string): Promise<{ id: string; isCollapsed: boolean } | null>;
    delete(id: string): Promise<boolean>;
    update(id: string, changes: { sortOrder?: number; name?: string; isCollapsed?: boolean }): Promise<{ id: string; name: string } | null>;
  };
  settings: {
    activeViewNav: ViewNav;
    selectedListId: string | null;
    completedCollapsed: boolean;
    selectedTaskId: string | null;
    sortConfig: SortConfig;
    selectedQuadrant: string | null;
    activePlanKind: PlanKind | null;
    birthday: string;
  };
  saveSettings(): Promise<void>;
    app?: App;
}


export class TodoView extends ItemView {
  private plugin: TodoPluginLike;
  private taskListEl!: HTMLDivElement;
  private sortBtnEl!: HTMLButtonElement;
  private sortLabelEl!: HTMLSpanElement;
  private navEls: Record<ViewNav, HTMLDivElement> = {} as Record<ViewNav, HTMLDivElement>;
  private listNavEl!: HTMLDivElement;
  private listItemsEl!: HTMLDivElement;
  private quickInputEl!: HTMLInputElement;
  private quickContainerEl!: HTMLDivElement;
  private detailEl!: HTMLDivElement;
  private detailView!: TaskDetailView;
  private planContainerEl!: HTMLDivElement;
  private planGroupCollapsed = true;
  private quadrantGroupCollapsed = true;
  private planGroupEl!: HTMLDivElement;
  private quadrantGroupEl!: HTMLDivElement;
  private activePlanKind: PlanKind | null = null;

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
    const taskHeader = main.createDiv({ cls: "todo-task-header" });
    this.sortBtnEl = taskHeader.createEl("button", { cls: "todo-sort-btn" });
    setIcon(this.sortBtnEl, "arrow-up-down");
    this.sortLabelEl = this.sortBtnEl.createSpan({ text: this.getSortLabel(this.plugin.settings.sortConfig.primary.field) });
    this.sortBtnEl.addEventListener("click", (ev) => this.showSortMenu(ev));
    this.planContainerEl = main.createDiv({ cls: "todo-plan-container" });

    this.taskListEl = main.createDiv({ cls: "todo-task-list" });
    this.quickContainerEl = main.createDiv({ cls: "todo-quick-add" });

    // Upper section: fixed views
    const upperNav = nav.createDiv({ cls: "todo-nav-section" });
    const upperItems = upperNav.createDiv({ cls: "todo-nav-lists" });
    this.navEls["myday"] = upperItems.createDiv({ cls: "todo-nav-item" });
    setIcon(this.navEls["myday"].createSpan({ cls: "todo-nav-icon" }), "sun");
    this.navEls["myday"].createSpan({ text: "我的一天" });
    this.navEls["all"] = upperItems.createDiv({ cls: "todo-nav-item" });
    setIcon(this.navEls["all"].createSpan({ cls: "todo-nav-icon" }), "list-checks");
    this.navEls["all"].createSpan({ text: "所有任务" });
    this.navEls["inbox"] = upperItems.createDiv({ cls: "todo-nav-item" });
    setIcon(this.navEls["inbox"].createSpan({ cls: "todo-nav-icon" }), "inbox");
    this.navEls["inbox"].createSpan({ text: "任务" });

    // Plan mode nav group
    this.planGroupEl = upperItems.createDiv({ cls: "todo-nav-group todo-plan-group" });
    const planHeader = this.planGroupEl.createDiv({ cls: "todo-nav-group-header" });
    const planIcon = planHeader.createSpan();
    setIcon(planIcon, "calendar-days");
    planHeader.createSpan({ cls: "todo-nav-group-name", text: "\u6211\u7684\u8ba1\u5212" });
    const planList = this.planGroupEl.createDiv({ cls: "todo-nav-group-list" });
    if (this.planGroupCollapsed) planList.style.display = "none";
    const planItems = [
      { name: "\u4eba\u751f\u8ba1\u5212", kind: "life" as PlanKind },
      { name: "\u5e74\u5ea6\u8ba1\u5212", kind: "year" as PlanKind },
      { name: "\u6708\u5ea6\u8ba1\u5212", kind: "month" as PlanKind },
    ];
    for (const pi of planItems) {
      const item = planList.createDiv({ cls: "todo-nav-item todo-plan-item" });
      item.createSpan({ cls: "todo-plan-name", text: pi.name });
      item.addEventListener("click", async () => {
        await this.activatePlan(pi.kind);
      });
    }
    planHeader.addEventListener("click", () => {
      this.planGroupCollapsed = !this.planGroupCollapsed;
      planList.style.display = this.planGroupCollapsed ? "none" : "";
    });

    // Quadrant mode nav group
    this.quadrantGroupEl = upperItems.createDiv({ cls: "todo-nav-group todo-quadrant-group" });
    const qHeader = this.quadrantGroupEl.createDiv({ cls: "todo-nav-group-header" });
    const qIcon = qHeader.createSpan();
    setIcon(qIcon, "layout-grid");
    qHeader.createSpan({ cls: "todo-nav-group-name", text: "\u56db\u8c61\u9650" });
    const qList = this.quadrantGroupEl.createDiv({ cls: "todo-nav-group-list" });
    if (this.quadrantGroupCollapsed) qList.style.display = "none";
    const quadrantDefs = [
      { key: "\u91cd\u8981\u7d27\u6025", color: "#E74C3C" },
      { key: "\u91cd\u8981\u4e0d\u7d27\u6025", color: "#4A90D9" },
      { key: "\u4e0d\u91cd\u8981\u7d27\u6025", color: "#F5A623" },
      { key: "\u4e0d\u91cd\u8981\u4e0d\u7d27\u6025", color: "#95A5A6" },
    ];
    for (const qd of quadrantDefs) {
      const qItem = qList.createDiv({ cls: "todo-nav-item todo-quadrant-item" + (this.plugin.settings.selectedQuadrant === qd.key ? " active" : "") });
      qItem.createSpan({ cls: "todo-quadrant-name", text: qd.key });
      qItem.addEventListener("click", async () => {
        this.plugin.settings.selectedQuadrant = qd.key;
        this.plugin.settings.activeViewNav = "all";
        await this.plugin.saveSettings();
        this.plugin.settings.selectedListId = null;
        qList.querySelectorAll(".todo-nav-item").forEach((el) => el.removeClass("active"));
        qItem.addClass("active");
        await this.renderTasks("all");
      });
    }
    qHeader.addEventListener("click", () => {
      this.quadrantGroupCollapsed = !this.quadrantGroupCollapsed;
      qList.style.display = this.quadrantGroupCollapsed ? "none" : "";
    });

    Object.entries(this.navEls).forEach(([key, el]) => {
      el.addEventListener("click", async () => {
        await this.activateNav(key as ViewNav);
      });
    });

    this.listNavEl = nav.createDiv({ cls: "todo-nav-section" });
    this.listItemsEl = this.listNavEl.createDiv({ cls: "todo-nav-lists" });

    const addListBtn = this.listNavEl.createDiv({ cls: "todo-nav-add", text: "+ 新建列表" });
    addListBtn.addEventListener("click", () => {
      void this.createListByInput();
    });

    // Settings icon at nav bottom
    const settingsContainer = nav.createDiv({ cls: "todo-nav-settings" });
    const settingsBtn = settingsContainer.createDiv({ cls: "todo-nav-settings-btn" });
    setIcon(settingsBtn, "settings");
        settingsBtn.addEventListener("click", () => {
      const s = (this.plugin.app as any)?.setting;
      s?.open();
      s?.openTabById("obsidian-todo");
    });
    const addGroupBtn = settingsContainer.createDiv({ cls: "todo-nav-settings-btn" });
    setIcon(addGroupBtn, "folder-plus");
    addGroupBtn.title = "\u65b0\u5efa\u5206\u7ec4";
    addGroupBtn.addEventListener("click", async () => {
      const name = await new PromptModal(this.app, "\u8f93\u5165\u5206\u7ec4\u540d\u79f0").openAndGetValue();
      if (name) {
        await this.plugin.groupService.create({ name });
        await this.renderLists();
      }
    });

    this.quickInputEl = this.quickContainerEl.createEl("input", { attr: { placeholder: "添加任务..." } });
    this.updateQuickPlaceholder();
    this.quickInputEl.addEventListener("keydown", async (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        await this.createTaskFromQuickInput();
      }
    });

    this.detailEl = layout.createDiv({ cls: "todo-detail" });
    this.detailView = new TaskDetailView(this.app, this.plugin, this.detailEl, (taskId) => {
      this.refreshDetailIfActive(taskId);
      const view = this.plugin.settings.selectedListId ? "list" : this.plugin.settings.activeViewNav;
      void this.renderTasks(view);
    }, () => {
      const layout = this.containerEl.querySelector(".todo-layout");
      if (layout) layout.removeClass("todo-layout-detail-open");
    }, (targetId) => {
      void this.navigateToTask(targetId);
    });

    this.plugin.settings.selectedTaskId = null;

    await this.activateNav(this.plugin.settings.activeViewNav);
    await this.renderLists();
  }

  async onClose(): Promise<void> {
    this.containerEl.empty();
  }

  private async activateNav(nav: ViewNav): Promise<void> {
    this.closeDetail();
    this.plugin.settings.activeViewNav = nav;
    this.plugin.settings.selectedListId = null;
    if (nav === "plan" && this.activePlanKind) {
      this.sortBtnEl.style.display = "none";
      this.quickContainerEl.style.display = "none";
      await this.plugin.saveSettings();
      await this.renderLists();
      Object.entries(this.navEls).forEach(([, el]) => el.removeClass("active"));
      this.taskListEl.empty();
      await this.renderPlanView(this.activePlanKind);
      return;
    }
    this.activePlanKind = null;
    this.plugin.settings.activePlanKind = null;
    this.sortBtnEl.style.display = "";
    await this.plugin.saveSettings();

    if (this.planContainerEl) {
      this.planContainerEl.addClass("todo-plan-visible");
    }

    await this.renderLists();

    Object.entries(this.navEls).forEach(([key, el]) => {
      el.toggleClass("active", key === nav);
    });
    this.listItemsEl?.querySelectorAll<HTMLDivElement>(".todo-nav-item").forEach((el) => el.removeClass("active"));

    await this.renderTasks(nav);
    this.updateQuickPlaceholder();
  }

  private async activateList(listId: string): Promise<void> {
    this.closeDetail();
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

    const lists = this.plugin.listService.getActive().filter((l) => !l.isDefault);
    const groups = this.plugin.groupService.getAll();

    if (!lists.length && !groups.length) {
      this.listItemsEl.createDiv({ cls: "todo-empty-state", text: "\u8fd8\u6ca1\u6709\u5217\u8868" });
      return;
    }

    const grouped = new Map<string, typeof lists>();
    const ungrouped: typeof lists = [];
    for (const list of lists) {
      if (list.groupId) {
        const arr = grouped.get(list.groupId) || [];
        arr.push(list);
        grouped.set(list.groupId, arr);
      } else {
        ungrouped.push(list);
      }
    }

    // Ungrouped drop zone (before groups)
    this.setupDropZone(this.listItemsEl, null);

    for (const group of groups) {
      const groupLists = grouped.get(group.id) || [];
      const groupEl = this.listItemsEl.createDiv({ cls: "todo-nav-group" });
      const headerEl = groupEl.createDiv({ cls: "todo-nav-group-header" });
      headerEl.draggable = true;
      headerEl.dataset.groupId = group.id;
      const arrow = headerEl.createSpan({ cls: "todo-nav-group-arrow" + (group.isCollapsed ? " collapsed" : ""), text: "\u25bc" });
      headerEl.createSpan({ cls: "todo-nav-group-name", text: group.name });
      headerEl.createSpan({ cls: "todo-nav-group-count", text: String(groupLists.length) });

      // Group drag events
      headerEl.addEventListener("dragstart", (ev) => {
        ev.dataTransfer!.setData("text/plain", JSON.stringify({ type: "group", id: group.id }));
        ev.dataTransfer!.effectAllowed = "move";
        headerEl.addClass("dragging");
      });
      headerEl.addEventListener("dragend", () => {
        headerEl.removeClass("dragging");
        this.clearAllDragStyles();
      });
      this.setupGroupDropTarget(headerEl, group.id);

      headerEl.addEventListener("click", async () => {
        await this.plugin.groupService.toggleCollapse(group.id);
        arrow.toggleClass("collapsed", !group.isCollapsed);
        const listEl = groupEl.querySelector(".todo-nav-group-list") as HTMLElement;
        if (listEl) listEl.style.display = group.isCollapsed ? "" : "none";
        await this.renderLists();
      });

      headerEl.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        this.showGroupContextMenu(ev, group.id, group.name);
      });

      const listEl = groupEl.createDiv({ cls: "todo-nav-group-list" });
      if (group.isCollapsed) listEl.style.display = "none";
      for (const list of groupLists) {
        this.renderListItem(listEl, list, group.id);
      }
      this.setupDropZone(listEl, group.id);
    }

    for (const list of ungrouped) {
      this.renderListItem(this.listItemsEl, list, null);
    }
  }

  private renderListItem(container: HTMLElement, list: { id: string; name: string; isDefault: boolean }, groupId: string | null): void {
    const row = container.createDiv({ cls: "todo-nav-item todo-list-item" + (this.plugin.settings.selectedListId === list.id ? " active" : "") });
    row.dataset.listId = list.id;
    row.draggable = true;
    row.createSpan({ cls: "todo-list-name", text: list.name });

    const actions = row.createDiv({ cls: "todo-list-actions" });
    const renameBtn = actions.createSpan({ cls: "todo-list-action", text: "\u91cd\u547d\u540d" });
    const deleteBtn = actions.createSpan({ cls: "todo-list-action todo-list-action-danger", text: "\u5220\u9664" });

    // Drag events
    row.addEventListener("dragstart", (ev) => {
      ev.dataTransfer!.setData("text/plain", JSON.stringify({ type: "list", id: list.id }));
      ev.dataTransfer!.effectAllowed = "move";
      row.addClass("dragging");
    });
    row.addEventListener("dragend", () => {
      row.removeClass("dragging");
      this.clearAllDragStyles();
    });
    this.setupListItemDropTarget(row, list.id);

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
        new Notice("\u9ed8\u8ba4\u5217\u8868\u4e0d\u53ef\u5220\u9664");
        return;
      }
      const confirmed = await new ConfirmModal(this.app, "\u786e\u8ba4\u5220\u9664\u5217\u8868\u300c" + list.name + "\u300d\uff1f").openAndConfirm();
      if (!confirmed) return;
            // Reassign orphaned tasks to default list before deletion
      const defaultList = this.plugin.listService.getDefault();
      if (defaultList) {
        const orphanTasks = this.plugin.taskService.getByListId(list.id);
        for (const t of orphanTasks) {
          await this.plugin.taskService.update(t.id, { listId: defaultList.id });
        }
      }
      await this.plugin.listService.delete(list.id);
      if (this.plugin.settings.selectedListId === list.id) {
        this.plugin.settings.selectedQuadrant = null;
      await this.activateNav("myday");
      }
      await this.renderLists();
    });

    row.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      this.showListContextMenu(ev, list.id, list.name);
    });
  }

  private setupDropZone(el: HTMLElement, targetGroupId: string | null): void {
    el.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      ev.dataTransfer!.dropEffect = "move";
    });
    el.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      this.clearAllDragStyles();
      try {
        const data = JSON.parse(ev.dataTransfer!.getData("text/plain"));
        if (data.type === "list") {
          const allLists = this.plugin.listService.getActive();
          const dragged = allLists.find((l) => l.id === data.id);
          if (!dragged) return;
          // Update groupId if changed
          if ((dragged.groupId || null) !== targetGroupId) {
            await this.plugin.listService.update(data.id, { groupId: targetGroupId });
          }
          // Reorder: put at end of target group
          const targetLists = allLists.filter((l) => (l.groupId || null) === targetGroupId && l.id !== data.id);
          for (let i = 0; i < targetLists.length; i++) {
            await this.plugin.listService.update(targetLists[i].id, { sortOrder: i });
          }
          await this.plugin.listService.update(data.id, { sortOrder: targetLists.length });
          await this.renderLists();
        }
      } catch {}
    });
  }

  private setupListItemDropTarget(row: HTMLElement, listId: string): void {
    row.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer!.dropEffect = "move";
      row.addClass("drag-over");
    });
    row.addEventListener("dragleave", () => {
      row.removeClass("drag-over");
    });
    row.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      row.removeClass("drag-over");
      this.clearAllDragStyles();
      try {
        const data = JSON.parse(ev.dataTransfer!.getData("text/plain"));
        if (data.type === "list" && data.id !== listId) {
          const allLists = this.plugin.listService.getActive();
          const dragged = allLists.find((l) => l.id === data.id);
          const target = allLists.find((l) => l.id === listId);
          if (!dragged || !target) return;
          // Move dragged to same group as target
          if ((dragged.groupId || null) !== (target.groupId || null)) {
            await this.plugin.listService.update(data.id, { groupId: target.groupId || null });
          }
          // Reorder: insert before target
          const groupLists = allLists.filter((l) => (l.groupId || null) === (target.groupId || null) && l.id !== data.id);
          const targetIdx = groupLists.findIndex((l) => l.id === listId);
          groupLists.splice(targetIdx, 0, dragged);
          for (let i = 0; i < groupLists.length; i++) {
            await this.plugin.listService.update(groupLists[i].id, { sortOrder: i });
          }
          await this.renderLists();
        }
        if (data.type === "group") {
          // Group dropped on list - ignore
        }
      } catch {}
    });
  }

  private setupGroupDropTarget(headerEl: HTMLElement, groupId: string): void {
    headerEl.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer!.dropEffect = "move";
      headerEl.addClass("drag-over");
    });
    headerEl.addEventListener("dragleave", () => {
      headerEl.removeClass("drag-over");
    });
    headerEl.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      headerEl.removeClass("drag-over");
      this.clearAllDragStyles();
      try {
        const data = JSON.parse(ev.dataTransfer!.getData("text/plain"));
        if (data.type === "group" && data.id !== groupId) {
          const allGroups = this.plugin.groupService.getAll();
          const dragged = allGroups.find((g) => g.id === data.id);
          const target = allGroups.find((g) => g.id === groupId);
          if (!dragged || !target) return;
          const targetIdx = allGroups.findIndex((g) => g.id === groupId);
          const filtered = allGroups.filter((g) => g.id !== data.id);
          filtered.splice(targetIdx, 0, dragged);
          for (let i = 0; i < filtered.length; i++) {
            await this.plugin.groupService.update(filtered[i].id, { sortOrder: i });
          }
          await this.renderLists();
        }
        if (data.type === "list") {
          // List dropped on group header - move list into this group
          const allLists = this.plugin.listService.getActive();
          const dragged = allLists.find((l) => l.id === data.id);
          if (!dragged) return;
          if ((dragged.groupId || null) !== groupId) {
            await this.plugin.listService.update(data.id, { groupId });
          }
          const groupLists = allLists.filter((l) => (l.groupId || null) === groupId && l.id !== data.id);
          for (let i = 0; i < groupLists.length; i++) {
            await this.plugin.listService.update(groupLists[i].id, { sortOrder: i });
          }
          await this.plugin.listService.update(data.id, { sortOrder: groupLists.length });
          await this.renderLists();
        }
      } catch {}
    });
  }

  private clearAllDragStyles(): void {
    this.listItemsEl?.querySelectorAll(".drag-over").forEach((el) => el.removeClass("drag-over"));
    this.listItemsEl?.querySelectorAll(".dragging").forEach((el) => el.removeClass("dragging"));
  }

  
  private showGroupContextMenu(ev: MouseEvent, groupId: string, groupName: string): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("\u91cd\u547d\u540d\u5206\u7ec4").setIcon("pencil").onClick(async () => {
      const name = await new PromptModal(this.app, "\u8f93\u5165\u65b0\u540d\u79f0").openAndGetValue();
      if (name) {
        await this.plugin.groupService.rename(groupId, name);
        await this.renderLists();
      }
    }));
    menu.addItem((item) => item.setTitle("\u5220\u9664\u5206\u7ec4").setIcon("trash").onClick(async () => {
      const confirmed = await new ConfirmModal(this.app, "\u786e\u8ba4\u5220\u9664\u5206\u7ec4\u300c" + groupName + "\u300d\uff1f\u5206\u7ec4\u5185\u5217\u8868\u5c06\u53d8\u4e3a\u672a\u5206\u7ec4\u3002").openAndConfirm();
      if (confirmed) {
        const groupLists = this.plugin.listService.getActive().filter((l) => l.groupId === groupId);
        for (const l of groupLists) {
          await this.plugin.listService.update(l.id, { groupId: null });
        }
        await this.plugin.groupService.delete(groupId);
        await this.renderLists();
      }
    }));
    menu.showAtMouseEvent(ev);
  }

  private showListContextMenu(ev: MouseEvent, listId: string, listName: string): void {
    const menu = new Menu();
    const groups = this.plugin.groupService.getAll();
    if (groups.length > 0) {
      menu.addItem((item) => item.setTitle("\u79fb\u52a8\u5230\u5206\u7ec4").setIcon("folder").onClick(() => {
        const subMenu = new Menu();
        subMenu.addItem((s) => s.setTitle("\u65e0\u5206\u7ec4").onClick(async () => {
          await this.plugin.listService.update(listId, { groupId: null });
          await this.renderLists();
        }));
        for (const g of groups) {
          subMenu.addItem((s) => s.setTitle(g.name).onClick(async () => {
            await this.plugin.listService.update(listId, { groupId: g.id });
            await this.renderLists();
          }));
        }
        subMenu.showAtMouseEvent(ev);
      }));
    }
    menu.addItem((item) => item.setTitle("\u91cd\u547d\u540d").setIcon("pencil").onClick(async () => {
      const row = this.listItemsEl.querySelector('[data-list-id="' + listId + '"]') as HTMLDivElement;
      if (row) await this.renameListInline(listId, listName, row);
    }));
    menu.addItem((item) => item.setTitle("\u5220\u9664").setIcon("trash").onClick(async () => {
      const confirmed = await new ConfirmModal(this.app, "\u786e\u8ba4\u5220\u9664\u5217\u8868\u300c" + listName + "\u300d\uff1f").openAndConfirm();
      if (confirmed) {
        await this.plugin.listService.delete(listId);
        await this.renderLists();
      }
    }));
    menu.showAtMouseEvent(ev);
  }


  private getSortLabel(field: SortField): string {
    return SORT_FIELD_LABELS[field] ?? field;
  }

  private showSortMenu(ev: MouseEvent): void {
    const fields = Object.entries(SORT_FIELD_LABELS) as [SortField, string][];
    const menu = new Menu();
    const currentField = this.plugin.settings.sortConfig.primary.field;
    fields.forEach(([field, label]) => {
      menu.addItem((item) =>
        item.setTitle(label).setChecked(field === currentField).onClick(async () => {
          const defaultDir: Record<SortField, SortDirection> = {
            importance: "desc", dueDate: "asc", createdAt: "desc", title: "asc",
          };
          this.plugin.settings.sortConfig = {
            primary: { field, direction: defaultDir[field] },
            secondary: { field: "createdAt", direction: "desc" },
          };
          await this.plugin.saveSettings();
          this.sortLabelEl.textContent = this.getSortLabel(field);
          const currentView = this.plugin.settings.selectedListId ? "list" : this.plugin.settings.activeViewNav;
          await this.renderTasks(currentView);
        })
      );
    });
    menu.showAtMouseEvent(ev);
  }

  private async renderTasks(view: ViewNav | "list"): Promise<void> {
    if (view === "plan" && this.activePlanKind) {
      this.sortBtnEl.style.display = "none";
      this.quickContainerEl.style.display = "none";
      await this.renderPlanView(this.activePlanKind);
      return;
    }
    this.sortBtnEl.style.display = "";
    this.quickContainerEl.style.display = this.plugin.settings.activeViewNav === "inbox" ? "none" : "";
    this.taskListEl.empty();

    

    let tasks: Task[] = [];

    if (view === "myday" && !this.plugin.settings.selectedListId) {
      tasks = this.plugin.taskService.getMyDay();
    } else if (view === "all") {
      tasks = this.plugin.taskService.getAll();
    } else if (view === "inbox") {
      const defaultList = this.plugin.listService.getDefault();
      tasks = defaultList ? this.plugin.taskService.getInbox(defaultList.id) : [];
    } else {
      const listId = this.plugin.settings.selectedListId;
      tasks = listId ? this.plugin.taskService.getByListId(listId) : [];
    }

    const currentView = this.plugin.settings.selectedListId ? "list" : this.plugin.settings.activeViewNav;

    // My Day: render grouped view
    if (currentView === "myday") {
      await this.renderMyDayGroups(tasks);
      return;
    }



    // Quadrant mode guidance for tasks without quadrant tags
    if (view === "all") {
      const quadTagIds = this.plugin.tagService.getQuadrantTags().map((t: { id: string }) => t.id);
      const untagged = tasks.filter((t) => !t.isCompleted && !t.tags.some((tagId: string) => quadTagIds.includes(tagId)));
      if (untagged.length > 0) {
        const notice = this.taskListEl.createDiv({ cls: "todo-quadrant-notice" });
        notice.createSpan({ cls: "todo-quadrant-notice-text", text: "\u2139\ufe0f \u4ee5\u4e0b " + untagged.length + " \u4e2a\u4efb\u52a1\u672a\u5206\u914d\u56db\u8c61\u9650\u6807\u7b7e\uff0c\u5efa\u8bae\u70b9\u51fb\u4efb\u52a1\u8865\u5145\u6807\u7b7e" });
      }
    }
    if (!tasks.length) {
      this.renderEmptyState(view);
      return;
    }

    // Quadrant mode: filter by selected quadrant
    if (this.plugin.settings.selectedQuadrant && !this.plugin.settings.selectedListId) {
      await this.renderQuadrantGroups();
      return;
    }

    const sorted = sortTasks(tasks, this.plugin.settings.sortConfig);
    const incomplete = sorted.filter((t) => !t.isCompleted);
    const completed = sorted.filter((t) => t.isCompleted);

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

    private async renderQuadrantGroups(): Promise<void> {
    const allTasks = this.plugin.taskService.getAll();
    const quadTags = this.plugin.tagService.getQuadrantTags();
    const config = this.plugin.settings.sortConfig;
    const selected = this.plugin.settings.selectedQuadrant;

    // If a specific quadrant is selected, show only that one
    if (selected) {
      const selectedTag = quadTags.find((t) => {
        const names = ["\u91cd\u8981\u7d27\u6025", "\u91cd\u8981\u4e0d\u7d27\u6025", "\u4e0d\u91cd\u8981\u7d27\u6025", "\u4e0d\u91cd\u8981\u4e0d\u7d27\u6025"];
        return names[t.sortOrder] === selected;
      });
      if (selectedTag) {
        const tasks = allTasks.filter((t) => t.tags.includes(selectedTag.id));
        const sorted = sortTasks(tasks, config);
        const incomplete = sorted.filter((t) => !t.isCompleted);
        const completed = sorted.filter((t) => t.isCompleted);
        incomplete.forEach((task) => this.renderTaskRow(this.taskListEl, task, "all"));
        if (completed.length) {
          const group = this.taskListEl.createDiv({ cls: "todo-completed-group" });
          const header = group.createDiv({ cls: "todo-completed-header" });
          const arrow = header.createSpan({ cls: "todo-completed-arrow" + (this.plugin.settings.completedCollapsed ? " collapsed" : ""), text: "\u25bc" });
          header.createSpan({ cls: "todo-completed-label", text: "\u5df2\u5b8c\u6210 " + completed.length });
          const list = group.createDiv({ cls: "todo-completed-list" });
          if (this.plugin.settings.completedCollapsed) list.style.display = "none";
          completed.forEach((task) => this.renderTaskRow(list, task, "all"));
          header.addEventListener("click", async () => {
            this.plugin.settings.completedCollapsed = !this.plugin.settings.completedCollapsed;
            await this.plugin.saveSettings();
            list.style.display = this.plugin.settings.completedCollapsed ? "none" : "";
            arrow.toggleClass("collapsed", this.plugin.settings.completedCollapsed);
          });
        }
      }
      return;
    }

    // No selection - show all quadrants
    const quadrantDefs = [
      { name: "\u91cd\u8981\u7d27\u6025", color: "#E74C3C", sortOrder: 0 },
      { name: "\u91cd\u8981\u4e0d\u7d27\u6025", color: "#4A90D9", sortOrder: 1 },
      { name: "\u4e0d\u91cd\u8981\u7d27\u6025", color: "#F5A623", sortOrder: 2 },
      { name: "\u4e0d\u91cd\u8981\u4e0d\u7d27\u6025", color: "#95A5A6", sortOrder: 3 },
    ];

    for (const qd of quadrantDefs) {
      const tag = quadTags.find((t) => t.sortOrder === qd.sortOrder);
      if (!tag) continue;
      const tasks = allTasks.filter((t) => t.tags.includes(tag.id));
      const sorted = sortTasks(tasks, config);
      const incomplete = sorted.filter((t) => !t.isCompleted);
      const completed = sorted.filter((t) => t.isCompleted);

      const groupEl = this.taskListEl.createDiv({ cls: "todo-myday-group" });
      const headerEl = groupEl.createDiv({ cls: "todo-myday-group-header" });
      if (qd.color) headerEl.style.borderLeft = "3px solid " + qd.color;
      headerEl.createSpan({ cls: "todo-myday-group-label", text: qd.name });
      headerEl.createSpan({ cls: "todo-myday-group-count", text: incomplete.length + "" });

      const listEl = groupEl.createDiv({ cls: "todo-myday-group-list" });
      incomplete.forEach((task) => this.renderTaskRow(listEl, task, "all"));
      completed.forEach((task) => this.renderTaskRow(listEl, task, "all"));
    }

    // Ungrouped tasks
    const ungrouped = allTasks.filter((t) => !quadTags.some((tag) => t.tags.includes(tag.id)));
    if (ungrouped.length > 0) {
      const sorted = sortTasks(ungrouped, config);
      const groupEl = this.taskListEl.createDiv({ cls: "todo-myday-group" });
      const headerEl = groupEl.createDiv({ cls: "todo-myday-group-header" });
      headerEl.createSpan({ cls: "todo-myday-group-label", text: "\u672a\u5206\u7c7b" });
      headerEl.createSpan({ cls: "todo-myday-group-count", text: sorted.length + "" });

      const listEl = groupEl.createDiv({ cls: "todo-myday-group-list" });
      sorted.forEach((task) => this.renderTaskRow(listEl, task, "all"));
    }
  }

private async renderMyDayGroups(tasks: Task[]): Promise<void> {

    // Auto-update myDayGroup based on time for tasks with dates
    for (const t of tasks) {
      if (t.isMyDay && (t.startDate || t.dueDate)) {
        const autoGroup = getMyDayGroupFromTime(t.startDate, t.dueDate);
        if (autoGroup !== (t.myDayGroup || "allday")) {
          t.myDayGroup = autoGroup;
          await this.plugin.taskService.update(t.id, { myDayGroup: autoGroup });
        }
      }
    }
    const sorted = sortTasks(tasks, this.plugin.settings.sortConfig);

    MYDAY_GROUPS.forEach(({ key, label }) => {
      const groupTasks = sorted.filter((t) => (t.myDayGroup || "allday") === key);
      const incomplete = groupTasks.filter((t) => !t.isCompleted);
      const completed = groupTasks.filter((t) => t.isCompleted);

      const groupEl = this.taskListEl.createDiv({ cls: "todo-myday-group" });
      const headerEl = groupEl.createDiv({ cls: "todo-myday-group-header" });
      headerEl.createSpan({ cls: "todo-myday-group-label", text: label });
      headerEl.createSpan({ cls: "todo-myday-group-count", text: `${incomplete.length}` });

      const listEl = groupEl.createDiv({ cls: "todo-myday-group-list" });
      incomplete.forEach((task) => this.renderTaskRow(listEl, task, "myday"));
      completed.forEach((task) => this.renderTaskRow(listEl, task, "myday"));
    });
  }

  private renderTaskRow(container: HTMLDivElement, task: Task, currentView: "myday" | "all" | "inbox" | "list" | "plan"): void {
    const row = container.createDiv({
      cls: `todo-task-item${task.isCompleted ? " completed" : ""}${task.isImportant ? " important-row" : ""}${this.plugin.settings.selectedTaskId === task.id ? " todo-task-selected" : ""}`,
    });
    row.dataset.taskId = task.id;

    const checkbox = row.createDiv({
      cls: `todo-checkbox${task.isCompleted ? " checked" : ""}`,
      text: task.isCompleted ? "✓" : "",
    });

    const content = row.createDiv({ cls: "todo-task-content" });
    const title = content.createDiv({ cls: "todo-task-title", text: task.title || "未命名任务" });
    title.toggleClass("todo-task-muted", task.isCompleted);

    // Task metadata line
    const metaParts: string[] = [];
    // List name label
    const lists = this.plugin.listService.getActive();
    const taskList = lists.find((l) => l.id === task.listId);
    if (taskList) {
      metaParts.push(taskList.isDefault ? "任务" : taskList.name);
    } else {
      metaParts.push("任务");
    }
    // Date formatting helper
    const formatShortDate = (iso: string): string => {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const time = pad(d.getHours()) + ":" + pad(d.getMinutes());
      if (diff === 0) return "今天 " + time;
      if (diff === 1) return "明天 " + time;
      if (diff === -1) return "昨天 " + time;
      return (d.getMonth() + 1) + "/" + d.getDate() + " " + time;
    };
    // Build time range string
    const startStr = task.startDate ? formatShortDate(task.startDate) : "";
    const dueStr = task.dueDate ? formatShortDate(task.dueDate) : "";
    if (startStr || dueStr) {
      }
    const metaRow = content.createDiv({ cls: "todo-task-meta-row" });
    const metaLeft = metaRow.createDiv({ cls: "todo-task-meta-left" });
    const metaRight = metaRow.createDiv({ cls: "todo-task-meta-right" });
    if (metaParts.length > 0) {
      metaLeft.createSpan({ text: metaParts[0] });
    }
    if (startStr || dueStr) {
      metaLeft.createSpan({ cls: "todo-task-meta-dot", text: "\u00b7" });
      metaLeft.createSpan({ text: (startStr || ".") + " - " + (dueStr || ".") });
    }
    if (task.recurrence) {
      metaLeft.createSpan({ cls: "todo-task-meta-dot", text: "\u00b7" });
      const recIcon = metaLeft.createSpan({ cls: "todo-task-meta-icon" });
      setIcon(recIcon, "repeat");
    }
    const allTags = this.plugin.tagService.getAll();
    const taskTags = (task.tags || []).map((id) => allTags.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);
    if (taskTags.length > 0) {
      taskTags.forEach((tag, i) => {
        if (i > 0) metaRight.createSpan({ cls: "todo-task-meta-dot", text: "\u00b7" });
        const tagEl = metaRight.createSpan({ cls: "todo-task-tag-label" });
        const tagIcon = tagEl.createSpan({ cls: "todo-task-tag-icon" });
        setIcon(tagIcon, tag.icon);
        tagEl.createSpan({ text: tag.name });
      });
    }

    const star = row.createDiv({
      cls: `todo-star${task.isImportant ? " important" : ""}`,
    });
    setIcon(star, "star");

    checkbox.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (task.isCompleted) {
        await this.plugin.taskService.update(task.id, { isCompleted: false, completedAt: null });
      } else {
        await this.plugin.taskService.update(task.id, { isCompleted: true, completedAt: new Date().toISOString() });
      }
      this.refreshDetailIfActive(task.id);
      await this.renderTasks(currentView);
    });

    star.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await this.plugin.taskService.update(task.id, { isImportant: !task.isImportant });
      this.refreshDetailIfActive(task.id);
      await this.renderTasks(currentView);
    });

    row.addEventListener("click", async () => {
      this.detailView.clearHistory();
      this.plugin.settings.selectedTaskId = task.id;
      await this.plugin.saveSettings();
      this.detailView.open(task.id);
      this.highlightSelectedTask(task.id);
      const layout = this.containerEl.querySelector(".todo-layout");
      if (layout) layout.addClass("todo-layout-detail-open");
    });

    row.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      this.showTaskContextMenu(ev, task, currentView);
    });
  }

  
  private renderEmptyState(view: "myday" | "all" | "inbox" | "list" | "plan" ): void {
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

    if (view === "inbox") {
      empty.createDiv({ cls: "todo-empty-title", text: "任务是空的" });
      empty.createDiv({ cls: "todo-empty-desc", text: "将任务从其他列表移动到此处，或右键任务选择“移动到任务”。" });
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
    if (activeViewNav === "plan") { this.quickContainerEl.style.display = "none"; return; }
    this.quickContainerEl.style.display = activeViewNav === "inbox" ? "none" : "";
    if (activeViewNav === "myday") {
      this.quickInputEl.placeholder = "添加任务到我的一天...";
      return;
    }
    if (activeViewNav === "all") {
      this.quickInputEl.placeholder = "添加任务...";
      return;
    }
    if (activeViewNav === "inbox") {
      this.quickInputEl.placeholder = "添加任务到任务...";
      return;
    }
    if (selectedListId) {
      const list = this.plugin.listService.getActive().find((l) => l.id === selectedListId);
      this.quickInputEl.placeholder = list ? `添加任务到「${list.name}」...` : "添加任务到当前列表...";
      return;
    }
    this.quickInputEl.placeholder = "添加任务...";
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
        isMyDay: activeViewNav === "myday" && !selectedListId,
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
      isMyDay: activeViewNav === "myday" && !selectedListId,
    });

    this.quickInputEl.value = "";
    await this.renderLists();
    await this.renderTasks(selectedListId ? "list" : activeViewNav);
  }




  private async activatePlan(kind: PlanKind): Promise<void> {
    this.closeDetail();
    this.plugin.settings.activeViewNav = "plan";
    this.plugin.settings.selectedListId = null;
    this.plugin.settings.selectedQuadrant = null;
    this.plugin.settings.activePlanKind = kind;
    this.activePlanKind = kind;
    await this.plugin.saveSettings();
    Object.entries(this.navEls).forEach(([, el]) => el.removeClass("active"));
    this.listItemsEl?.querySelectorAll<HTMLDivElement>(".todo-nav-item").forEach((el) => el.removeClass("active"));
    const planListEl = this.planGroupEl?.querySelector(".todo-nav-group-list") as HTMLElement;
    if (planListEl) planListEl.querySelectorAll(".todo-plan-item").forEach((el: Element, i: number) => {
      el.toggleClass("active", (kind === "life" && i === 0) || (kind === "year" && i === 1) || (kind === "month" && i === 2));
    });
    this.sortBtnEl.style.display = "none";
    this.quickContainerEl.style.display = "none";
    this.taskListEl.empty();
    if (kind === "life") {
      await this.renderLifePlanView();
    } else {
      await this.renderPlanView(kind);
    }
  }

  /** Navigate to a task: switch plan view + highlight + scroll + open detail */
  async navigateToTask(taskId: string): Promise<void> {
    const task = this.plugin.taskService.getAll().find((t) => t.id === taskId);
    if (!task) return;

    // Switch navigation to the target plan/list view
    if (task.planKind) {
      await this.activatePlan(task.planKind);
      // Expand the correct parent group + sub-group for the target task
      this.expandPlanGroupForTask(task);
    } else {
      // Non-plan task: navigate to its list
      const listId = task.listId;
      if (listId) {
        await this.activateList(listId);
      }
    }

    // Highlight and select the target task
    this.plugin.settings.selectedTaskId = taskId;
    await this.plugin.saveSettings();
    this.highlightSelectedTask(taskId);
    this.scrollTaskIntoView(taskId);

    // Open detail panel
    this.detailView.open(taskId);
    const layout = this.containerEl.querySelector(".todo-layout");
    if (layout) layout.addClass("todo-layout-detail-open");
  }

  /** Expand parent group and sub-group to reveal a target task in plan view */
  private expandPlanGroupForTask(task: Task): void {
    if (!task.planPeriodKey) return;
    if (task.planKind === "life") return; // life view has no collapsible groups

    // Expand the body that directly matches the task's period key
    const directBody = this.taskListEl?.querySelector(`[data-period-key="${task.planPeriodKey}"]`) as HTMLElement | null;
    if (directBody) {
      directBody.style.display = "";
      const arrow = directBody.parentElement?.querySelector(".todo-plan-group-arrow");
      if (arrow) arrow.removeClass("collapsed");
    }

    // If the plan view has sub-periods, also expand the parent group containing this task
    const subKind: PlanKind | null = this.activePlanKind === "year" ? "quarter" : this.activePlanKind === "month" ? "week" : null;
    if (subKind && task.planPeriodKey) {
      const parentKey = getParentPeriodKey(subKind, task.planPeriodKey);
      if (parentKey) {
        const parentBody = this.taskListEl?.querySelector(`[data-period-key="${parentKey}"]`) as HTMLElement | null;
        if (parentBody) {
          parentBody.style.display = "";
          const parentArrow = parentBody.parentElement?.querySelector(".todo-plan-group-arrow");
          if (parentArrow) parentArrow.removeClass("collapsed");
        }
      }
    }
  }

  /** Scroll a task row into the visible area of the task list */
  scrollTaskIntoView(taskId: string): void {
    const el = this.taskListEl?.querySelector(`[data-task-id="${taskId}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  private async renderPlanView(kind: PlanKind): Promise<void> {
    this.taskListEl.empty();
    const ts = this.plugin.taskService;
    const curKey = currentPeriodKey(kind);
    // Collect all period keys
    const allTasks = ts.getAll();
    const planTasks = allTasks.filter((t) => t.planKind === kind && t.planPeriodKey);
    const keySet = new Set<string>();
    planTasks.forEach((t) => keySet.add(t.planPeriodKey!));
    if (!keySet.has(curKey)) keySet.add(curKey);
    const sortedKeys = periodKeySort(kind, Array.from(keySet));
    // Sub-period config
    const subKind: PlanKind | null = kind === "year" ? "quarter" : kind === "month" ? "week" : null;
    const curKeyForSub = currentPeriodKey(subKind || "week");
    for (const pk of sortedKeys) {
      const parentTasks = ts.getByPlanKindAndPeriod(kind, pk);
      const isCurrent = pk === curKey;
      const groupEl = this.taskListEl.createDiv({ cls: "todo-plan-group" });
      const headerEl = groupEl.createDiv({ cls: "todo-plan-group-header" });
      const arrow = headerEl.createSpan({ cls: "todo-plan-group-arrow" + (isCurrent ? "" : " collapsed"), text: "\u25bc" });
      headerEl.createSpan({ cls: "todo-plan-group-label", text: periodLabel(kind, pk) });
      headerEl.createSpan({ cls: "todo-plan-group-count", text: String(parentTasks.length) });
      const addBtn = headerEl.createSpan({ cls: "todo-plan-add-btn", text: "+" });
      addBtn.title = "\u65b0\u5efa\u4efb\u52a1";
      const bodyEl = groupEl.createDiv({ cls: "todo-plan-group-body" });
      bodyEl.dataset.periodKey = pk;
      if (!isCurrent) bodyEl.style.display = "none";
      // Render parent tasks
      for (const task of parentTasks) {
        this.renderTaskRow(bodyEl, task, "plan");
      }
      // Add inline input
      this.setupPlanAddButton(addBtn, bodyEl, kind, pk);
      // Toggle collapse
      headerEl.addEventListener("click", (ev) => {
        if ((ev.target as HTMLElement).closest(".todo-plan-add-btn")) return;
        const collapsed = bodyEl.style.display === "none";
        bodyEl.style.display = collapsed ? "" : "none";
        arrow.toggleClass("collapsed", !collapsed);
      });
      // Sub-groups (quarter/week)
      if (subKind) {
        const subKeys = getSubPeriodKeysForParent(kind, pk);
        const sortedSubKeys = periodKeySort(subKind, subKeys);
        for (const sk of sortedSubKeys) {
          const subTasks = ts.getByPlanKindAndPeriod(subKind, sk);
          const isCurSub = sk === curKeyForSub;
          const subGroupEl = bodyEl.createDiv({ cls: "todo-plan-subgroup" });
          const subHeaderEl = subGroupEl.createDiv({ cls: "todo-plan-subgroup-header" });
          const subArrow = subHeaderEl.createSpan({ cls: "todo-plan-group-arrow" + (isCurSub ? "" : " collapsed"), text: "\u25bc" });
          subHeaderEl.createSpan({ cls: "todo-plan-subgroup-label", text: subGroupLabel(subKind, sk) });
          subHeaderEl.createSpan({ cls: "todo-plan-group-count", text: String(subTasks.length) });
          const subAddBtn = subHeaderEl.createSpan({ cls: "todo-plan-add-btn", text: "+" });
          subAddBtn.title = "\u65b0\u5efa\u4efb\u52a1";
          const subBodyEl = subGroupEl.createDiv({ cls: "todo-plan-group-body" });
          subBodyEl.dataset.periodKey = sk;
          if (!isCurSub) subBodyEl.style.display = "none";
          for (const task of subTasks) {
            this.renderTaskRow(subBodyEl, task, "plan");
          }
          this.setupPlanAddButton(subAddBtn, subBodyEl, subKind, sk);
          subHeaderEl.addEventListener("click", (ev) => {
            if ((ev.target as HTMLElement).closest(".todo-plan-add-btn")) return;
            const collapsed = subBodyEl.style.display === "none";
            subBodyEl.style.display = collapsed ? "" : "none";
            subArrow.toggleClass("collapsed", !collapsed);
          });
        }
      }
    }
  }


  private async renderLifePlanView(): Promise<void> {
    this.taskListEl.empty();
    const birthday = this.plugin.settings.birthday;
    if (!birthday) {
      const hint = this.taskListEl.createDiv({ cls: "todo-life-empty" });
      hint.createSpan({ text: "\u8bf7\u5148\u5728\u8bbe\u7f6e\u4e2d\u586b\u5199\u751f\u65e5\uff0c\u624d\u80fd\u4f7f\u7528\u4eba\u751f\u8ba1\u5212\u89c6\u56fe\u3002" });
      return;
    }
    const ts = this.plugin.taskService;
    const allTasks = ts.getAll();
    const lifeTasks = allTasks.filter((t) => t.planKind === "life");
    const withAge: { task: Task; age: number }[] = [];
    const noAge: Task[] = [];
    for (const t of lifeTasks) {
      if (t.planPeriodKey) {
        withAge.push({ task: t, age: parseInt(t.planPeriodKey, 10) });
      } else if (t.dueDate) {
        const age = ageFromDueDate(birthday, t.dueDate);
        withAge.push({ task: t, age });
      } else {
        noAge.push(t);
      }
    }
    // Sort by age ascending
    withAge.sort((a, b) => a.age - b.age);
    // Merge into age groups
    const ageGroups = new Map<number, Task[]>();
    for (const { task, age } of withAge) {
      if (!ageGroups.has(age)) ageGroups.set(age, []);
      ageGroups.get(age)!.push(task);
    }
    const curAge = currentAge(birthday);
    const birthdayYear = new Date(birthday).getFullYear();
    const container = this.taskListEl.createDiv({ cls: "todo-life-timeline" });
    for (const [age, tasks] of ageGroups) {
      const isCurrent = age === curAge;
      const year = birthdayYear + age;
      const node = container.createDiv({ cls: "todo-life-node" + (isCurrent ? " is-current" : "") });
      node.setAttribute("data-age-key", String(age));
      const ageCol = node.createDiv({ cls: "todo-life-age-col" });
      ageCol.createDiv({ cls: "todo-life-age-num", text: String(age) });
      ageCol.createDiv({ cls: "todo-life-age-label", text: "\u5c81" });
      ageCol.createDiv({ cls: "todo-life-age-year", text: String(year) + "\u5e74" });
      const lineCol = node.createDiv({ cls: "todo-life-line-col" });
      lineCol.createDiv({ cls: "todo-life-dot" + (isCurrent ? " todo-life-dot-current" : "") });
      const contentCol = node.createDiv({ cls: "todo-life-content-col" });
      for (const t of tasks) {
        const card = contentCol.createDiv({ cls: "todo-life-card", attr: { "data-task-id": t.id } });
        card.createSpan({ cls: "todo-life-card-title", text: t.title });
        if (t.dueDate) {
          card.createSpan({ cls: "todo-life-card-date", text: t.dueDate });
        }
        card.addEventListener("click", async () => {
          this.detailView.clearHistory();
          this.plugin.settings.selectedTaskId = t.id;
          await this.plugin.saveSettings();
          this.detailView.open(t.id);
          this.highlightSelectedTask(t.id);
          const layout = this.containerEl.querySelector(".todo-layout");
          if (layout) layout.addClass("todo-layout-detail-open");
        });
      }
    }
    // Divider + no-age group
    if (noAge.length > 0) {
      container.createDiv({ cls: "todo-life-divider" });
      const naNode = container.createDiv({ cls: "todo-life-node" });
      const naAgeCol = naNode.createDiv({ cls: "todo-life-age-col" });
      naAgeCol.createDiv({ cls: "todo-life-age-na", text: "\u672a\u8bbe\u5b9a\u5e74\u9f84" });
      const naLineCol = naNode.createDiv({ cls: "todo-life-line-col" });
      naLineCol.createDiv({ cls: "todo-life-dot" });
      const naContent = naNode.createDiv({ cls: "todo-life-content-col" });
      for (const t of noAge) {
        const card = naContent.createDiv({ cls: "todo-life-card", attr: { "data-task-id": t.id } });
        card.createSpan({ cls: "todo-life-card-title", text: t.title });
        card.addEventListener("click", async () => {
          this.detailView.clearHistory();
          this.plugin.settings.selectedTaskId = t.id;
          await this.plugin.saveSettings();
          this.detailView.open(t.id);
          this.highlightSelectedTask(t.id);
          const layout = this.containerEl.querySelector(".todo-layout");
          if (layout) layout.addClass("todo-layout-detail-open");
        });
      }
    }
    // Auto-scroll to current age
    if (ageGroups.has(curAge)) {
      const curNode = container.querySelector(".todo-life-node.is-current");
      if (curNode) {
        curNode.scrollIntoView({ block: "center" });
      }
    }
    // Add button at bottom
    const addRow = container.createDiv({ cls: "todo-life-add-row" });
    const addBtnEl = addRow.createEl("button", { cls: "todo-life-add-btn" });
    addBtnEl.createSpan({ text: "+" });
    addBtnEl.createSpan({ text: " \u6dfb\u52a0\u4eba\u751f\u76ee\u6807" });
    addBtnEl.addEventListener("click", () => {
      addBtnEl.style.display = "none";
      const input = addRow.createEl("input", { cls: "todo-life-add-input" }) as HTMLInputElement;
      input.placeholder = "\u8f93\u5165\u4eba\u751f\u76ee\u6807\u6807\u9898\u2026";
      input.focus();
      let saved = false;
      const save = async () => {
        if (saved) return;
        saved = true;
        const title = input.value.trim();
        if (title) {
          await this.plugin.taskService.create({ title, planKind: "life" });
          await this.renderLifePlanView();
        } else {
          input.remove();
          addBtnEl.style.display = "";
        }
      };
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); save(); }
        if (ev.key === "Escape") { input.remove(); addBtnEl.style.display = ""; }
      });
      input.addEventListener("blur", save);
    });

  }


  private setupPlanAddButton(btn: HTMLElement, bodyEl: HTMLElement, kind: PlanKind, periodKey: string): void {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (bodyEl.style.display === "none") {
        bodyEl.style.display = "";
        const arrow = bodyEl.parentElement?.querySelector(".todo-plan-group-arrow");
        if (arrow) arrow.removeClass("collapsed");
      }
      if (bodyEl.querySelector(".todo-plan-inline-input")) return;
      const row = document.createElement("div");
      row.className = "todo-plan-inline-input";
      const tasks = bodyEl.querySelectorAll(".todo-plan-group-body > .todo-task-item");
      const lastTask = tasks.length > 0 ? tasks[tasks.length - 1] : null;
      if (lastTask) {
        lastTask.after(row);
      } else {
        bodyEl.prepend(row);
      }
      const input = row.createEl("input", { attr: { placeholder: "\u8f93\u5165\u4efb\u52a1\u6807\u9898..." } });
      window.setTimeout(() => input.focus(), 30);
      let saved = false;
      const save = async () => {
        if (saved) return;
        saved = true;
        const title = input.value.trim();
        if (title) {
          await this.plugin.taskService.create({ title, planKind: kind, planPeriodKey: periodKey });
          await this.renderPlanView(this.activePlanKind!);
        } else {
          row.remove();
        }
      };
      input.addEventListener("keydown", async (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); await save(); }
        if (ev.key === "Escape") { ev.preventDefault(); saved = true; row.remove(); }
      });
      input.addEventListener("blur", () => { void save(); });
    });
  }

  private closeDetailIfTarget(taskId: string): void {
    if (this.detailView?.isActive() && this.detailView.getTaskId() === taskId) {
      this.closeDetail();
    }
  }

  private highlightSelectedTask(taskId: string): void {
    this.taskListEl?.querySelectorAll(".todo-task-item, .todo-life-card").forEach((el) => {
      el.toggleClass("todo-task-selected", (el as HTMLElement).dataset.taskId === taskId);
    });
  }

  private refreshDetailIfActive(taskId: string): void {
    if (this.detailView?.isActive() && this.detailView.getTaskId() === taskId) {
      const task = this.plugin.taskService.getAll().find((t) => t.id === taskId);
      if (task) this.detailView.refresh(task);
    }
  }

  private closeDetail(): void {
    this.plugin.settings.selectedTaskId = null;
    void this.plugin.saveSettings();
    this.detailView?.close();
    const layout = this.containerEl.querySelector(".todo-layout");
    if (layout) layout.removeClass("todo-layout-detail-open");
  }

  private showTaskContextMenu(ev: MouseEvent, task: Task, currentView: "myday" | "all" | "inbox" | "list" | "plan" ): void {
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

    menu.addItem((item) =>
      item
        .setTitle(task.isMyDay ? "从“我的一天”移除" : "添加到“我的一天”")
        .setIcon(task.isMyDay ? "calendar-minus" : "calendar-plus")
        .onClick(async () => {
          await this.plugin.taskService.update(task.id, { isMyDay: !task.isMyDay });
          await this.renderTasks(currentView);
        }),
    );


    // Move to My Day group
    if (currentView === "myday" && task.isMyDay) {
      menu.addSeparator();
      MYDAY_GROUPS.forEach(({ key, label }) => {
        menu.addItem((item) =>
          item
            .setTitle(`移动至 ${label}`)
            .setChecked((task.myDayGroup || "allday") === key)
            .onClick(async () => {
              // Update dates based on group
              const now = new Date();
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const groupTimes: Record<MyDayGroup, { startH: number; startM: number; endH: number; endM: number }> = {
                allday: { startH: 6, startM: 0, endH: 23, endM: 59 },
                morning: { startH: 6, startM: 0, endH: 11, endM: 59 },
                noon: { startH: 12, startM: 0, endH: 13, endM: 59 },
                afternoon: { startH: 14, startM: 0, endH: 17, endM: 59 },
                evening: { startH: 18, startM: 0, endH: 23, endM: 59 },
              };
              const t = groupTimes[key];
              const startDate = new Date(today);
              startDate.setHours(t.startH, t.startM);
              const dueDate = new Date(today);
              dueDate.setHours(t.endH, t.endM);
              await this.plugin.taskService.update(task.id, {
                myDayGroup: key,
                startDate: startDate.toISOString(),
                dueDate: dueDate.toISOString(),
              });
              await this.renderTasks(currentView);
            }),
        );
      });
    }

    const lists = this.plugin.listService.getActive().filter((l) => l.id !== task.listId);
    if (lists.length) {
      lists.forEach((list) => {
        menu.addItem((item) =>
          item
            .setTitle(list.isDefault ? "移动到任务" : `移动到「${list.name}」`)
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
          const childCount = this.plugin.taskService.countChildren(task.id);
          if (childCount > 0) {
            const confirmed = await new ConfirmModal(this.app, "\u4efb\u52a1\u300c" + task.title + "\u300d\u6709 " + childCount + " \u4e2a\u5b50\u4efb\u52a1\uff0c\u5220\u9664\u540e\u5b50\u4efb\u52a1\u4e5f\u5c06\u88ab\u5220\u9664\u3002\u786e\u5b9a\u7ee7\u7eed\uff1f").openAndConfirm();
            if (!confirmed) return;
          }
          await this.plugin.taskService.delete(task.id);
          this.closeDetailIfTarget(task.id);
          await this.renderLists();
          await this.renderTasks(currentView);
        }),
    );

    menu.showAtMouseEvent(ev);
  }

}



