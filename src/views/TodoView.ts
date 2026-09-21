
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
import { extractLocalDate } from "../utils/recurrence";
import { localTodayStr, currentPeriodKey, periodLabel, subGroupLabel, periodKeySort, getSubPeriodKeysForParent, getParentPeriodKey, ageFromDueDate, currentAge, getISOWeekNumber, getISOWeekRange } from "../utils/period";
import { TaskDetailView } from "./TaskDetailView";
import { sortTasks, getMyDayGroupFromTime } from "../utils/sort";
import type { SortConfig, SortField, SortDirection } from "../utils/sort";
import { renderStatCard, renderDistributionBar, renderStackedBarChart, renderMonthCalendar, renderBarChart, renderYearHeatmap } from "../utils/chart";
import { IconPickerModal } from "../ui/IconPickerModal";
import { CreateListModal } from "../ui/CreateListModal";

export type ViewNav = "myday" | "all" | "inbox" | "plan" | "schedule" | "review" | "trash";

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
    getDeleted(): Task[];
    restore(id: string): Promise<boolean>;
    hardDelete(id: string): Promise<boolean>;
    emptyTrash(): Promise<number>;
    getGroupInstances(groupId: string): Task[];
    deleteSeries(groupId: string): Promise<number>;
    setRecurrence(taskId: string, recurrence: string | null, endDate?: string | null): Promise<void>;
    stopRecurrence(groupId: string, fromTaskId?: string): Promise<number>;
  };
  listService: {
    getById(id: string): { id: string; name: string; isDefault: boolean; groupId: string | null; icon: string } | undefined;
    getActive(): { id: string; name: string; isDefault: boolean; groupId: string | null; icon: string }[];
    getDefault(): { id: string; name: string } | undefined;
    create(fields: { name: string; icon?: string }): Promise<{ id: string; name: string; icon: string }>;
    rename(id: string, name: string): Promise<{ id: string; name: string } | null>;
    delete(id: string): Promise<boolean>;
    update(id: string, changes: { groupId?: string | null; name?: string; sortOrder?: number; icon?: string }): Promise<{ id: string; name: string; groupId: string | null; icon: string } | null>;
  };
  tagService: {
    getAll(): { id: string; name: string; color: string; icon: string; isDefault: boolean; sortOrder: number }[];
    getById(id: string): { id: string; name: string; color: string; icon: string; sortOrder: number } | undefined;
    getQuadrantTags(): { id: string; name: string; color: string; icon: string; sortOrder: number }[];
    getQuadrantTagForTask(tagIds: string[]): { id: string; name: string; color: string; sortOrder: number } | undefined;
  };
  groupService: {
    getAll(): { id: string; name: string; isCollapsed: boolean; sortOrder: number }[];
    create(fields: { name: string }): Promise<{ id: string; name: string }>;
    rename(id: string, name: string): Promise<{ id: string; name: string } | null>;
    toggleCollapse(id: string): Promise<{ id: string; isCollapsed: boolean } | null>;
    delete(id: string): Promise<boolean>;
    update(id: string, changes: { sortOrder?: number; name?: string; isCollapsed?: boolean }): Promise<{ id: string; name: string } | null>;
  };
  statsService: {
    getDayStats(date: string): any;
    getWeekStats(year: number, week: number): any;
    getMonthStats(year: number, month: number): any;
    getYearStats(year: number): any;
    calcStreak(fromDate: string): number;
    calcMaxStreak(startDate: string, endDate: string): number;
  };
  settings: {
    activeViewNav: ViewNav;
    selectedListId: string | null;
    completedCollapsed: boolean;
    overdueCollapsed: boolean;
    selectedTaskId: string | null;
    sortConfig: SortConfig;
    selectedQuadrant: string | null;
    activePlanKind: PlanKind | null;
    birthday: string;
    planGroupCollapsed: boolean;
    quadrantGroupCollapsed: boolean;
    activeScheduleMode: "day" | "week" | "month";
    activeReviewMode: "day" | "week" | "month" | "year";
    taskFilterStatus: "all" | "active" | "shelved" | "abandoned" | "completed";
    goalViewMode: "card" | "list";
  };
  saveSettings(): Promise<void>;
    app?: App;
}


export class TodoView extends ItemView {
  private plugin: TodoPluginLike;
  private taskListEl!: HTMLDivElement;
  private sortBtnEl!: HTMLButtonElement;
  private sortLabelEl!: HTMLSpanElement;
  private headerIconEl!: HTMLSpanElement;
  private headerTitleEl!: HTMLSpanElement;
  private navEls: Record<ViewNav, HTMLDivElement> = {} as Record<ViewNav, HTMLDivElement>;
  private listNavEl!: HTMLDivElement;
  private listItemsEl!: HTMLDivElement;
  private quickInputEl!: HTMLInputElement;
  private quickContainerEl!: HTMLDivElement;
  private detailEl!: HTMLDivElement;
  private detailView!: TaskDetailView;
  private planContainerEl!: HTMLDivElement;
  private planGroupEl!: HTMLDivElement;
  private quadrantGroupEl!: HTMLDivElement;
  private activePlanKind: PlanKind | null = null;
  private goalPeriodKey: string | null = null;
  private expandedGoalIds = new Set<string>();
  private goalKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private scheduleMode: "day" | "week" | "month" = "month";
  private scheduleYear!: number;
  private scheduleMonth!: number;
  private scheduleDate!: number;
  private reviewMode: "day" | "week" | "month" | "year" = "day";
  private reviewYear!: number;
  private reviewMonth!: number;
  private reviewDate!: number;
  private reviewFilter: { type: "date" | "overdue" | "tag"; value: string; label: string; dateField?: "dueDate" | "completedAt" } | null = null;
  private timeLineTimer: number | null = null;
  private dragState: {
    type: "move" | "resize";
    taskId: string;
    startY: number;
    startX: number;
    origStartMin: number;
    origEndMin: number;
    dateStr: string;
    hourHeight: number;
    ghost: HTMLElement;
    card: HTMLElement;
    moved: boolean;
    colCount: number;
    columnsRect: DOMRect | null;
    dateStrs: string[];
    currentColIdx: number;
    ghostBaseLeft: number;
    scrollContainer: HTMLElement | null;
    scrollRAF: number | null;
    origScrollTop: number;
    columnsEl: HTMLElement | null;
    source: "timeline" | "allday";
  } | null = null;
  private _onDragMove: ((ev: MouseEvent) => void) | null = null;
  private _onDragEnd: ((ev: MouseEvent) => void) | null = null;
  private _lastDragMoved = false;
  private scheduleScrollTarget: "now" | { taskId: string } | "preserve" = "now";

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
    this.headerIconEl = taskHeader.createSpan({ cls: "todo-header-icon" });
    this.headerTitleEl = taskHeader.createSpan({ cls: "todo-header-title" });
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
    this.navEls["schedule"] = upperItems.createDiv({ cls: "todo-nav-item" });
    setIcon(this.navEls["schedule"].createSpan({ cls: "todo-nav-icon" }), "calendar");
    this.navEls["schedule"].createSpan({ text: "我的日程" });

        // Plan mode nav group
    this.planGroupEl = upperItems.createDiv({ cls: "todo-nav-group todo-plan-group" });
    const planHeader = this.planGroupEl.createDiv({ cls: "todo-nav-group-header" });
    const planIcon = planHeader.createSpan();
    setIcon(planIcon, "calendar-days");
    planHeader.createSpan({ cls: "todo-nav-group-name", text: "\u6211\u7684\u8ba1\u5212" });
    const planList = this.planGroupEl.createDiv({ cls: "todo-nav-group-list" });
    if (this.plugin.settings.planGroupCollapsed) planList.style.display = "none";
    const planItems = [
      { name: "人生计划", kind: "life" as PlanKind, icon: "globe" },
      { name: "年度计划", kind: "year" as PlanKind, icon: "calendar-check" },
      { name: "月度计划", kind: "month" as PlanKind, icon: "timer" },
    ];
    for (const pi of planItems) {
      const item = planList.createDiv({ cls: "todo-nav-item todo-plan-item" });
      const piIcon = item.createSpan({ cls: "todo-nav-icon" });
      setIcon(piIcon, pi.icon);
      item.createSpan({ cls: "todo-plan-name", text: pi.name });
      item.addEventListener("click", async () => {
        await this.activatePlan(pi.kind);
      });
    }
    planHeader.addEventListener("click", () => {
      this.plugin.settings.planGroupCollapsed = !this.plugin.settings.planGroupCollapsed;
      planList.style.display = this.plugin.settings.planGroupCollapsed ? "none" : "";
      void this.plugin.saveSettings();
    });

    // Quadrant mode nav group
    this.quadrantGroupEl = upperItems.createDiv({ cls: "todo-nav-group todo-quadrant-group" });
    const qHeader = this.quadrantGroupEl.createDiv({ cls: "todo-nav-group-header" });
    const qIcon = qHeader.createSpan();
    setIcon(qIcon, "layout-grid");
    qHeader.createSpan({ cls: "todo-nav-group-name", text: "\u56db\u8c61\u9650" });
    const qList = this.quadrantGroupEl.createDiv({ cls: "todo-nav-group-list" });
    if (this.plugin.settings.quadrantGroupCollapsed) qList.style.display = "none";
    const quadrantDefs = [
      { key: "重要紧急", color: "#E74C3C", icon: "alarm-clock" },
      { key: "重要不紧急", color: "#4A90D9", icon: "calendar-check" },
      { key: "不重要紧急", color: "#F5A623", icon: "bell" },
      { key: "不重要不紧急", color: "#95A5A6", icon: "coffee" },
    ];
    for (const qd of quadrantDefs) {
      const qItem = qList.createDiv({ cls: "todo-nav-item todo-quadrant-item" + (this.plugin.settings.selectedQuadrant === qd.key ? " active" : "") });
      const qdIcon = qItem.createSpan({ cls: "todo-nav-icon" });
      setIcon(qdIcon, qd.icon);
      qItem.createSpan({ cls: "todo-quadrant-name", text: qd.key });
      qItem.addEventListener("click", async () => {
        this.plugin.settings.selectedQuadrant = qd.key;
        this.plugin.settings.activeViewNav = "all";
        await this.plugin.saveSettings();
        this.plugin.settings.selectedListId = null;
        qList.querySelectorAll(".todo-nav-item").forEach((el) => el.removeClass("active"));
        this.planGroupEl?.querySelectorAll(".todo-plan-item").forEach((el) => el.removeClass("active"));

        Object.entries(this.navEls).forEach(([, el]) => el.removeClass("active"));
        qItem.addClass("active");
        await this.renderTasks("all");
        this.updateHeaderInfo();
      });
    }
    qHeader.addEventListener("click", () => {
      this.plugin.settings.quadrantGroupCollapsed = !this.plugin.settings.quadrantGroupCollapsed;
      qList.style.display = this.plugin.settings.quadrantGroupCollapsed ? "none" : "";
      void this.plugin.saveSettings();
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
    // Trash button
    this.navEls["review"] = settingsContainer.createDiv({ cls: "todo-nav-settings-btn" });
    setIcon(this.navEls["review"], "bar-chart-2");
    this.navEls["review"].title = "\u590d\u76d8";
    this.navEls["review"].addEventListener("click", async () => { await this.activateNav("review"); });
    this.navEls["trash"] = settingsContainer.createDiv({ cls: "todo-nav-settings-btn" });
    setIcon(this.navEls["trash"], "trash-2");
    this.navEls["trash"].title = "回收站";
    this.navEls["trash"].addEventListener("click", async () => { await this.activateNav("trash"); });
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
      if (this.plugin.settings.activeViewNav === "plan" && (this.activePlanKind === "year" || this.activePlanKind === "month")) {
        void this.renderGoalDashboard(this.activePlanKind);
      } else if (this.plugin.settings.activeViewNav === "schedule") {
        this.scheduleScrollTarget = { taskId };
        this.renderScheduleView();
      } else {
        const view = this.plugin.settings.selectedListId ? "list" : this.plugin.settings.activeViewNav;
        void this.renderTasks(view);
      }
    }, () => {
      const layout = this.containerEl.querySelector(".todo-layout");
      if (layout) layout.removeClass("todo-layout-detail-open");
    }, (targetId) => {
      void this.navigateToTask(targetId);
    });

    this.plugin.settings.selectedTaskId = null;

    await this.activateNav(this.plugin.settings.activeViewNav);
    await this.renderLists();

    // T-703: Global drag handlers
    this._onDragMove = (ev: MouseEvent) => this.handleDragMove(ev);
    this._onDragEnd = (ev: MouseEvent) => this.handleDragEnd(ev);
    document.addEventListener("mousemove", this._onDragMove);
    document.addEventListener("mouseup", this._onDragEnd);
  }

  async onClose(): Promise<void> {
    if (this.timeLineTimer) { clearInterval(this.timeLineTimer); this.timeLineTimer = null; }
    if (this._onDragMove) document.removeEventListener("mousemove", this._onDragMove);
    if (this._onDragEnd) document.removeEventListener("mouseup", this._onDragEnd);
    if (this.goalKeyHandler) { document.removeEventListener("keydown", this.goalKeyHandler); this.goalKeyHandler = null; }
    this.containerEl.empty();
  }

  /** 外部调用：刷新整个视图（设置页清空/重置后使用） */
  async refreshAll(): Promise<void> {
    try {
      this.closeDetail();
      this.plugin.settings.selectedListId = null;
      this.plugin.settings.selectedTaskId = null;
      const nav = this.plugin.settings.activeViewNav;
      if (nav === "schedule") {
        this.taskListEl.empty();
        this.renderScheduleView();
        await this.renderLists();
      } else if (nav === "trash") {
        this.taskListEl.empty();
        this.renderTrashView();
        await this.renderLists();
      } else {
        await this.activateNav(nav);
      }
    } catch (e) {
      console.error("refreshAll failed, falling back to empty state:", e);
      this.taskListEl.empty();
      this.taskListEl.createDiv({ cls: "todo-empty-state", text: "\u89c6\u56fe\u5df2\u91cd\u7f6e\uff0c\u8bf7\u91cd\u65b0\u5bfc\u822a" });
    }

  }

  private async navigateWithFilter(filter: { type: "date" | "overdue" | "tag"; value: string; label: string; dateField?: "dueDate" | "completedAt" }): Promise<void> {
    this.reviewFilter = filter;
    await this.activateNav("all");
  }

  
  private updateHeaderInfo(): void {
    if (!this.headerIconEl || !this.headerTitleEl) return;
    
    const { activeViewNav, selectedListId, selectedQuadrant } = this.plugin.settings;
    
    // Plan icon mapping
    const planIcons: Record<PlanKind, string> = {
      life: "globe",
      year: "calendar-check",
      quarter: "calendar",
      month: "timer",
      week: "calendar-days",
    };
    const planNames: Record<PlanKind, string> = {
      life: "人生计划",
      year: "年度计划",
      quarter: "季度计划",
      month: "月度计划",
      week: "周计划",
    };
    
    // Quadrant icon mapping
    const quadrantIcons: Record<string, string> = {
      "重要紧急": "alarm-clock",
      "重要不紧急": "calendar-check",
      "不重要紧急": "bell",
      "不重要不紧急": "coffee",
    };
    
    let icon = "list-checks";
    let title = "所有任务";
    let isEditable = false;
    let listId: string | null = null;
    
    if (selectedListId) {
      const list = this.plugin.listService.getById(selectedListId);
      if (list) {
        icon = list.icon || "list";
        title = list.name;
        isEditable = true;
        listId = selectedListId;
      }
    } else if (selectedQuadrant && activeViewNav === "all") {
      icon = quadrantIcons[selectedQuadrant] || "layout-grid";
      title = selectedQuadrant;
      isEditable = false;
    } else if (activeViewNav === "plan" && this.activePlanKind) {
      icon = planIcons[this.activePlanKind] || "calendar-days";
      title = planNames[this.activePlanKind] || "我的计划";
      isEditable = false;
    } else {
      switch (activeViewNav) {
        case "myday":
          icon = "sun";
          title = "我的一天";
          break;
        case "all":
          icon = "list-checks";
          title = "所有任务";
          break;
        case "inbox":
          icon = "inbox";
          title = "任务";
          break;
        case "schedule":
          icon = "calendar";
          title = "我的日程";
          break;
        case "plan":
          icon = "calendar-days";
          title = "我的计划";
          break;
        case "review":
          icon = "bar-chart-2";
          title = "统计";
          break;
        case "trash":
          icon = "trash-2";
          title = "回收站";
          break;
        default:
          icon = "list-checks";
          title = "所有任务";
      }
    }
    
    // Update icon
    this.headerIconEl.empty();
    setIcon(this.headerIconEl, icon);
    this.headerIconEl.onclick = null;
    this.headerIconEl.toggleClass("editable", isEditable);
    if (isEditable && listId) {
      this.headerIconEl.onclick = () => {
        new IconPickerModal(this.app, icon, async (iconName) => {
          await this.plugin.listService.update(listId, { icon: iconName });
          this.updateHeaderInfo();
          await this.renderLists();
        }).open();
      };
    }
    
    // Update title
    this.headerTitleEl.textContent = title;
    this.headerTitleEl.toggleClass("editable", isEditable);
    this.headerTitleEl.onclick = null;
    if (isEditable) {
      this.headerTitleEl.onclick = () => {
        const selection = window.getSelection();
        if (selection) {
          selection.selectAllChildren(this.headerTitleEl);
        }
      };
    }
  }

private async activateNav(nav: ViewNav): Promise<void> {
    this.closeDetail();
    if (nav !== "all") this.reviewFilter = null;
    this.plugin.settings.activeViewNav = nav;
    this.plugin.settings.selectedListId = null;
    if (nav === "review") {
      this.plugin.settings.selectedQuadrant = null;
      this.sortBtnEl.style.display = "none";
      this.quickContainerEl.style.display = "none";
      this.reviewMode = this.plugin.settings.activeReviewMode || "day";
      const now = new Date();
      this.reviewYear = now.getFullYear();
      this.reviewMonth = now.getMonth();
      this.reviewDate = now.getDate();
      await this.plugin.saveSettings();
      await this.renderLists();
      Object.entries(this.navEls).forEach(([, el]) => el.removeClass("active"));
      this.navEls["review"].addClass("active");
      this.taskListEl.removeClass("todo-trash-active");
      this.taskListEl.removeClass("todo-schedule-active");
      this.taskListEl.addClass("todo-review-active");
      this.taskListEl.empty();
      this.renderReviewView();
      this.updateHeaderInfo();
      return;
    }
    if (nav === "schedule") {
      this.plugin.settings.selectedQuadrant = null;
      this.sortBtnEl.style.display = "none";
      this.quickContainerEl.style.display = "none";
      this.scheduleMode = this.plugin.settings.activeScheduleMode || "month";
      const now = new Date();
      this.scheduleYear = now.getFullYear();
      this.scheduleMonth = now.getMonth();
      this.scheduleDate = now.getDate();
      await this.plugin.saveSettings();
      await this.renderLists();
      Object.entries(this.navEls).forEach(([, el]) => el.removeClass("active"));
      this.navEls["schedule"].addClass("active");
      this.taskListEl.removeClass("todo-trash-active");
      this.taskListEl.addClass("todo-schedule-active");
      this.taskListEl.empty();
      this.scheduleScrollTarget = "now";
      this.renderScheduleView();
      this.updateHeaderInfo();
      return;
    }
    if (nav === "trash") {
      this.plugin.settings.selectedQuadrant = null;
      this.sortBtnEl.style.display = "none";
      this.quickContainerEl.style.display = "none";
      Object.entries(this.navEls).forEach(([, el]) => el.removeClass("active"));
      this.taskListEl.addClass("todo-trash-active");
      this.taskListEl.removeClass("todo-schedule-active");
      this.taskListEl.empty();
      this.renderTrashView();
      this.updateHeaderInfo();
      return;
    }
    if (nav === "plan" && this.activePlanKind) {
      this.plugin.settings.selectedQuadrant = null;
      this.sortBtnEl.style.display = "none";
      this.quickContainerEl.style.display = "none";
      await this.plugin.saveSettings();
      await this.renderLists();
      Object.entries(this.navEls).forEach(([, el]) => el.removeClass("active"));
      this.taskListEl.empty();
      if (this.activePlanKind === 'life') {
        await this.renderLifePlanView();
      } else if (this.activePlanKind === 'year' || this.activePlanKind === 'month') {
        await this.renderGoalDashboard(this.activePlanKind);
      } else {
        await this.renderPlanView(this.activePlanKind);
      }
      this.updateHeaderInfo();
      return;
    }
    this.activePlanKind = null;
    this.plugin.settings.activePlanKind = null;
    this.plugin.settings.selectedQuadrant = null;
    this.sortBtnEl.style.display = "";
    this.quickContainerEl.style.display = "";
    this.taskListEl.removeClass("todo-schedule-active");
    this.taskListEl.removeClass("todo-trash-active");
    this.taskListEl.removeClass("todo-review-active");
    await this.plugin.saveSettings();

    if (this.planContainerEl) {
      this.planContainerEl.addClass("todo-plan-visible");
    }

    await this.renderLists();

    Object.entries(this.navEls).forEach(([key, el]) => {
      el.toggleClass("active", key === nav);
    });
    this.listItemsEl?.querySelectorAll<HTMLDivElement>(".todo-nav-item").forEach((el) => el.removeClass("active"));
    this.quadrantGroupEl?.querySelectorAll<HTMLDivElement>(".todo-quadrant-item").forEach((el) => el.removeClass("active"));
    this.planGroupEl?.querySelectorAll<HTMLDivElement>(".todo-plan-item").forEach((el) => el.removeClass("active"));

    await this.renderTasks(nav);
    this.updateQuickPlaceholder();
    this.updateHeaderInfo();
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
    this.updateHeaderInfo();
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

  private renderListItem(container: HTMLElement, list: { id: string; name: string; isDefault: boolean; icon?: string }, groupId: string | null): void {
    const row = container.createDiv({ cls: "todo-nav-item todo-list-item" + (this.plugin.settings.selectedListId === list.id ? " active" : "") });
    row.dataset.listId = list.id;
    row.draggable = true;
    const listIcon = row.createSpan({ cls: "todo-list-icon" });
    setIcon(listIcon, list.icon || "list");
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
    const list = this.plugin.listService.getById(listId);
    const currentIcon = list?.icon || "list";
    menu.addItem((item) => item.setTitle("更改图标").setIcon("image").onClick(() => {
      new IconPickerModal(this.app, currentIcon, async (iconName) => {
        await this.plugin.listService.update(listId, { icon: iconName });
        await this.renderLists();
      }).open();
    }));
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
      this.updateQuickPlaceholder();
      if (this.activePlanKind === 'life') {
        await this.renderLifePlanView();
      } else if (this.activePlanKind === 'year' || this.activePlanKind === 'month') {
        await this.renderGoalDashboard(this.activePlanKind);
      } else {
        await this.renderPlanView(this.activePlanKind);
      }
      return;
    }
    this.sortBtnEl.style.display = "";
    this.quickContainerEl.style.display = this.plugin.settings.activeViewNav === "inbox" ? "none" : "";
    this.taskListEl.empty();

    

    let tasks: Task[] = [];

    if (view === "myday" && !this.plugin.settings.selectedListId) {
      tasks = this.plugin.taskService.getMyDay();
    } else if (view === "all") {
      tasks = this.plugin.taskService.getAll().filter((t) => !t.planKind);
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

    // Status filter bar (not for myday)
    const filterStatus = this.plugin.settings.taskFilterStatus;
    const filterBar = this.taskListEl.createDiv({ cls: "todo-status-filter" });
    const filterOptions: { key: string; label: string }[] = [
      { key: "all", label: "全部" },
      { key: "active", label: "进行中" },
      { key: "shelved", label: "搁置" },
      { key: "abandoned", label: "放弃" },
      { key: "completed", label: "已完成" },
    ];
    for (const opt of filterOptions) {
      const btn = filterBar.createSpan({
        cls: "todo-status-filter-btn" + (opt.key === filterStatus ? " active" : ""),
        text: opt.label,
      });
      btn.addEventListener("click", async () => {
        this.plugin.settings.taskFilterStatus = opt.key as any;
        await this.plugin.saveSettings();
        filterBar.querySelectorAll(".todo-status-filter-btn").forEach((el) => el.removeClass("active"));
        btn.addClass("active");
        await this.renderTasks(view);
      });
    }

    // Apply status filter
    if (filterStatus !== "all") {
      if (filterStatus === "completed") {
        tasks = tasks.filter((t) => t.isCompleted);
      } else if (filterStatus === "active") {
        tasks = tasks.filter((t) => !t.isCompleted && (t.status || "active") === "active");
      } else {
        tasks = tasks.filter((t) => (t.status || "active") === filterStatus);
      }
    }

    // Apply review filter if active
    if (this.reviewFilter && view === "all") {
      const f = this.reviewFilter;
      if (f.type === "date" && f.dateField === "completedAt") {
        tasks = tasks.filter(t => t.isCompleted && t.completedAt && extractLocalDate(t.completedAt) === f.value);
      } else if (f.type === "date" && f.dateField === "dueDate") {
        tasks = tasks.filter(t => t.dueDate && extractLocalDate(t.dueDate) === f.value);
      } else if (f.type === "overdue") {
        const today = new Date();
        const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
        tasks = tasks.filter(t => !t.isCompleted && t.dueDate && extractLocalDate(t.dueDate) < todayStr);
      } else if (f.type === "tag") {
        tasks = tasks.filter(t => t.tags.includes(f.value));
      }
      // Render filter tag
      const filterTag = this.taskListEl.createDiv({ cls: "todo-review-filter-tag" });
      filterTag.createSpan({ cls: "todo-review-filter-tag-label", text: "筛选: " + f.label });
      const clearBtn = filterTag.createSpan({ cls: "todo-review-filter-tag-clear", text: "✕" });
      clearBtn.addEventListener("click", () => {
        this.reviewFilter = null;
        this.renderTasks("all");
      });
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
    const today = new Date();
    const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    const overdue = sorted.filter((t) => !t.isCompleted && t.dueDate && extractLocalDate(t.dueDate) < todayStr);
    const incomplete = sorted.filter((t) => !t.isCompleted && !(t.dueDate && extractLocalDate(t.dueDate) < todayStr));
    const completed = sorted.filter((t) => t.isCompleted);


    incomplete.forEach((task) => this.renderTaskRow(this.taskListEl, task, currentView));
    // Overdue group
    if (overdue.length > 0) {
      const overdueGroup = this.taskListEl.createDiv({ cls: "todo-overdue-group" });
      const overdueHeader = overdueGroup.createDiv({ cls: "todo-overdue-header" });
      const overdueArrow = overdueHeader.createSpan({
        cls: "todo-overdue-arrow" + (this.plugin.settings.overdueCollapsed ? " collapsed" : ""),
        text: "▼",
      });
      overdueHeader.createSpan({ cls: "todo-overdue-label", text: "已逾期 " + overdue.length });
      const overdueList = overdueGroup.createDiv({ cls: "todo-overdue-list" });
      if (this.plugin.settings.overdueCollapsed) { overdueList.style.display = "none"; }
      overdue.forEach((task) => this.renderTaskRow(overdueList, task, currentView));
      overdueHeader.addEventListener("click", async () => {
        this.plugin.settings.overdueCollapsed = !this.plugin.settings.overdueCollapsed;
        overdueList.style.display = this.plugin.settings.overdueCollapsed ? "none" : "";
        overdueArrow.toggleClass("collapsed", this.plugin.settings.overdueCollapsed);
        await this.plugin.saveSettings();
      });
    }


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
      if (t.myDayDate && (t.startDate || t.dueDate)) {
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

  private renderTaskRow(container: HTMLDivElement, task: Task, currentView: "myday" | "all" | "inbox" | "trash" | "list" | "plan" | "schedule" | "review"): void {
    const row = container.createDiv({
      cls: `todo-task-item${task.isCompleted ? " completed" : ""}${task.isImportant ? " important-row" : ""}${task.status === "shelved" ? " todo-task-shelved" : ""}${task.status === "abandoned" ? " todo-task-abandoned" : ""}${this.plugin.settings.selectedTaskId === task.id ? " todo-task-selected" : ""}`,
    });
    row.dataset.taskId = task.id;

    const checkbox = row.createDiv({
      cls: `todo-checkbox${task.isCompleted ? " checked" : ""}`,
      text: task.isCompleted ? "✓" : "",
    });

    const content = row.createDiv({ cls: "todo-task-content" });
        if (task.status === "shelved") {
      const statusIcon = content.createSpan({ cls: "todo-task-status-icon" });
      setIcon(statusIcon, "pause-circle");
    } else if (task.status === "abandoned") {
      const statusIcon = content.createSpan({ cls: "todo-task-status-icon" });
      setIcon(statusIcon, "x-circle");
    }
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
    if (task.planKind !== "life" && (startStr || dueStr)) {
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
    const parentOf = this.plugin.taskService.getParentOf(task.id);
    if (parentOf) {
      const parentLabelMap: Record<string, string> = { life: "人生目标", year: "年度目标", quarter: "季度目标", month: "月度目标" };
      const parentLabel = parentLabelMap[parentOf.planKind ?? ""] ?? "上级目标";
      metaRight.createSpan({ cls: "todo-task-tag-label", text: parentLabel + "：" + parentOf.title });
    }
    if (taskTags.length > 0) {
      taskTags.forEach((tag, i) => {
        if (parentOf || i > 0) metaRight.createSpan({ cls: "todo-task-meta-dot", text: "\u00b7" });
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
        await this.plugin.taskService.uncomplete(task.id);
      } else {
        await this.plugin.taskService.complete(task.id);
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

  
  private renderEmptyState(view: "myday" | "all" | "inbox" | "trash" | "list" | "plan" | "schedule" | "review"): void {
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
    const result = await new CreateListModal(this.app).openAndGetValue();
    if (!result?.name?.trim()) {
      return;
    }

    const created = await this.plugin.listService.create({ name: result.name.trim(), icon: result.icon });
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
    if (activeViewNav === "plan") {
      this.quickContainerEl.style.display = "";
      const pk = this.activePlanKind;
      if (pk === "life") this.quickInputEl.placeholder = "新建人生目标...";
      else if (pk === "year") this.quickInputEl.placeholder = "新建年度目标...";
      else if (pk === "month") this.quickInputEl.placeholder = "新建月度目标...";
      else this.quickInputEl.placeholder = "新建任务...";
      return;
    }
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
        myDayDate: activeViewNav === "myday" && !selectedListId ? localTodayStr() : null,
      })
      .then(async () => {
        await this.renderLists();
        await this.renderTasks(selectedListId ? "list" : activeViewNav);
      });
  }

  private async createTaskFromQuickInput(): Promise<void> {
    const title = this.quickInputEl.value.trim();
    if (!title) return;

    // Plan view: create plan task
    if (this.plugin.settings.activeViewNav === "plan" && this.activePlanKind) {
      const kind = this.activePlanKind;
      if (kind === "life") {
        await this.plugin.taskService.create({ title, planKind: "life" });
      } else {
        await this.plugin.taskService.create({ title, planKind: kind, planPeriodKey: this.goalPeriodKey! });
      }
      this.quickInputEl.value = "";
      if (kind === "life") await this.renderLifePlanView();
      else if (kind === "year" || kind === "month") await this.renderGoalDashboard(kind);
      else await this.renderPlanView(kind);
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

    const isMyDay = activeViewNav === "myday" && !selectedListId;
    const todayStr = localTodayStr();
    await this.plugin.taskService.create({
      title,
      listId,
      myDayDate: isMyDay ? todayStr : null,
      startDate: isMyDay ? todayStr + "T07:00:00" : null,
      dueDate: isMyDay ? todayStr + "T23:30:00" : null,
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
    this.quadrantGroupEl?.querySelectorAll<HTMLDivElement>(".todo-quadrant-item").forEach((el) => el.removeClass("active"));
    const planListEl = this.planGroupEl?.querySelector(".todo-nav-group-list") as HTMLElement;
    if (planListEl) planListEl.querySelectorAll(".todo-plan-item").forEach((el: Element, i: number) => {
      el.toggleClass("active", (kind === "life" && i === 0) || (kind === "year" && i === 1) || (kind === "month" && i === 2));
    });
    this.sortBtnEl.style.display = "none";
    this.updateQuickPlaceholder();
    this.taskListEl.empty();
    if (kind === "life") {
      await this.renderLifePlanView();
    } else if (kind === "year" || kind === "month") {
      await this.renderGoalDashboard(kind);
    } else {
      await this.renderPlanView(kind);
    }
    this.updateHeaderInfo();
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


  private async renderGoalDashboard(kind: "year"|"month"): Promise<void> {
    this.taskListEl.empty();
    const curNow = currentPeriodKey(kind);
    if (!this.goalPeriodKey || (kind === "year" && this.goalPeriodKey.length !== 4) || (kind === "month" && this.goalPeriodKey.length !== 7)) {
      this.goalPeriodKey = curNow;
    }
    if (this.goalKeyHandler) { document.removeEventListener("keydown", this.goalKeyHandler); this.goalKeyHandler = null; }

    const nav = this.taskListEl.createDiv({ cls: "todo-goal-nav" });
    const prevBtn = nav.createEl("button", { cls: "todo-goal-nav-btn", text: "◀" });
    prevBtn.setAttribute("aria-label", "上一周期");
    const labelEl = nav.createSpan({ cls: "todo-goal-nav-label", text: kind === "year" ? this.goalPeriodKey + " 年" : this.goalPeriodKey });
    const nextBtn = nav.createEl("button", { cls: "todo-goal-nav-btn", text: "▶" });
    nextBtn.setAttribute("aria-label", "下一周期");
    const backBtn = nav.createEl("button", { cls: "todo-goal-nav-btn todo-goal-nav-back", text: kind === "year" ? "回到今年" : "回到本月" });
    backBtn.setAttribute("aria-label", "回到当前");

    const updateLabel = () => {
      labelEl.setText(kind === "year" ? (this.goalPeriodKey ?? "") + " 年" : (this.goalPeriodKey ?? ""));
    };
    const clampKey = (k: string) => {
      if (kind === "year") {
        const min = 2000;
        const y = Math.max(min, parseInt(k, 10));
        return String(y);
      }
      return k;
    };
    const shift = (delta: number) => {
      if (kind === "year") {
        const y = parseInt(this.goalPeriodKey!, 10) + delta;
        this.goalPeriodKey = clampKey(String(y));
      } else {
        const [yStr, mStr] = this.goalPeriodKey!.split("-");
        let y = parseInt(yStr, 10), m = parseInt(mStr, 10) + delta;
        if (m < 1) { y -= 1; m = 12; } else if (m > 12) { y += 1; m = 1; }
        const yy = Math.max(2000, y);
        this.goalPeriodKey = yy + "-" + String(m).padStart(2, "0");
      }
      updateLabel();
      this.renderGoalDashboard(kind);
    };

    prevBtn.addEventListener("click", () => shift(-1));
    nextBtn.addEventListener("click", () => shift(1));
    backBtn.addEventListener("click", () => {
      this.goalPeriodKey = curNow;
      updateLabel();
      this.renderGoalDashboard(kind);
    });
    this.goalKeyHandler = (e: KeyboardEvent) => {
      if (!(this.plugin.settings.activeViewNav === "plan" && (this.activePlanKind === "year" || this.activePlanKind === "month"))) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); shift(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); shift(1); }
    };
    document.addEventListener("keydown", this.goalKeyHandler);

    const prevScrollTop = this.taskListEl.scrollTop;
    const goalAllTasks = this.plugin.taskService.getAll();
    const periodTasks = goalAllTasks.filter((t) => t.planKind === kind && t.planPeriodKey === this.goalPeriodKey && !t.isDeleted && !t.isRecurrenceTemplate);
    const totalCount = periodTasks.length;
    const completedCount = periodTasks.filter((t) => t.isCompleted).length;
    const inProgressCount = totalCount - completedCount;
    const todayStr = localTodayStr();
    const overdueCount = periodTasks.filter((t) => !t.isCompleted && t.dueDate && extractLocalDate(t.dueDate) < todayStr).length;
    const completionRate = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

    const statsRow = this.taskListEl.createDiv({ cls: "todo-goal-stats-row" });
    const addStatCard = (label: string, value: string, icon: string, extraCls?: string) => {
      const card = statsRow.createDiv({ cls: "todo-goal-stat-card" + (extraCls ? " " + extraCls : "") });
      const top = card.createDiv({ cls: "todo-goal-stat-top" });
      const iconEl = top.createSpan({ cls: "todo-goal-stat-icon" });
      setIcon(iconEl, icon);
      top.createSpan({ cls: "todo-goal-stat-value", text: value });
      card.createDiv({ cls: "todo-goal-stat-label", text: label });
    };
    addStatCard("目标数", String(totalCount), "list-checks", "todo-goal-stat-total");
    addStatCard("已完成", String(completedCount), "check-circle-2", "todo-goal-stat-completed");
    addStatCard("进行中", String(inProgressCount), "timer", "todo-goal-stat-inprogress");
    addStatCard("逾期", String(overdueCount), "alert-triangle", overdueCount > 0 ? "todo-goal-stat-overdue" : "todo-goal-stat-overdue-empty");
    addStatCard("完成率", completionRate + "%", "pie-chart", completionRate >= 100 ? "todo-goal-stat-rate-full" : undefined);

    // Monthly view: show quarterly goals as draggable cards
    if (kind === "month" && this.goalPeriodKey) {
      const quarterKey = getParentPeriodKey("month", this.goalPeriodKey);
      if (quarterKey) {
        const quarterTasks = this.plugin.taskService.getByPlanKindAndPeriod("quarter", quarterKey);
        const qSection = this.taskListEl.createDiv({ cls: "todo-goal-quarter-section" });
        const qLabel = qSection.createDiv({ cls: "todo-goal-quarter-label", text: subGroupLabel("quarter", quarterKey) + " 目标" });
        const qScroll = qSection.createDiv({ cls: "todo-goal-quarter-scroll" });
        for (const qt of quarterTasks) {
          const qCard = qScroll.createDiv({ cls: "todo-goal-quarter-card", attr: { "data-task-id": qt.id, draggable: "true" } });
          qCard.createSpan({ cls: "todo-goal-quarter-card-title", text: qt.title });
          const qChildren = this.plugin.taskService.getChildrenOf(qt.id);
          const qDone = qChildren.filter(c => c.isCompleted).length;
          if (qChildren.length > 0) {
            qCard.createSpan({ cls: "todo-goal-quarter-card-meta", text: qDone + "/" + qChildren.length });
          }
          qCard.addEventListener("dragstart", (ev) => {
            ev.dataTransfer!.setData("text/plain", qt.id);
            qCard.addClass("dragging");
          });
          qCard.addEventListener("dragend", () => { qCard.removeClass("dragging"); });
        }
        if (quarterTasks.length === 0) {
          qScroll.createDiv({ cls: "todo-goal-quarter-empty", text: "暂无季度目标" });
        }
      }
    }


    const modeSwitch = nav.createDiv({ cls: "todo-goal-mode-switch" });
    const cardModeBtn = modeSwitch.createSpan({ cls: "todo-goal-mode-btn" + (this.plugin.settings.goalViewMode !== "list" ? " active" : ""), text: "卡片" });
    const listModeBtn = modeSwitch.createSpan({ cls: "todo-goal-mode-btn" + (this.plugin.settings.goalViewMode === "list" ? " active" : ""), text: "列表" });
    cardModeBtn.addEventListener("click", async () => {
      if (this.plugin.settings.goalViewMode !== "card") {
        this.plugin.settings.goalViewMode = "card";
        await this.plugin.saveSettings();
        cardModeBtn.addClass("active"); listModeBtn.removeClass("active");
        await this.renderGoalDashboard(kind);
      }
    });
    listModeBtn.addEventListener("click", async () => {
      if (this.plugin.settings.goalViewMode !== "list") {
        this.plugin.settings.goalViewMode = "list";
        await this.plugin.saveSettings();
        listModeBtn.addClass("active"); cardModeBtn.removeClass("active");
        await this.renderGoalDashboard(kind);
      }
    });

    const goalAllTags = this.plugin.tagService.getAll();
    const sorted = periodTasks.slice().sort((a, b) => (b.isImportant ? 1 : 0) - (a.isImportant ? 1 : 0));

    if (this.plugin.settings.goalViewMode === "list") {
      const contentEl = this.taskListEl.createDiv({ cls: "todo-goal-list-content" });
      this.renderGoalListContent(kind, contentEl);
    } else {
    const cards = this.taskListEl.createDiv({ cls: "todo-goal-cards" });
    const goalScrollTarget = cards.createDiv({ cls: "todo-goal-scroll-target" });
    goalScrollTarget.style.height = "0px";

    if (sorted.length === 0) {
      const guide = cards.createDiv({ cls: "todo-goal-guide" });
      guide.createDiv({ text: "还没有目标，先创建一个年度目标，再拆解到月度与KR。" });
      const hint = guide.createDiv({ cls: "todo-goal-guide-hint" });
      hint.createSpan({ text: "点击上方「" });
      hint.createSpan({ cls: "todo-goal-guide-btn", text: kind === "year" ? "＋ 新建年度目标" : "＋ 新建月度目标" });
      hint.createSpan({ text: "」开始。" });
    }

    const BATCH = 40;
    let goalIdx = 0;
    const renderGoal = (goal: Task) => {
      const children = this.plugin.taskService.getChildrenOf(goal.id);
      const total = children.length;
      const done = children.filter((c) => c.isCompleted).length;
      const rate = total === 0 ? null : done / total;
      const overdue = !goal.isCompleted && !!goal.dueDate && extractLocalDate(goal.dueDate!) < todayStr;
      // Find parent plan based on period hierarchy (month→quarter, quarter→year)
      let parent: Task | undefined;
      // Use explicit parentId first; fall back to period-based lookup
      parent = this.plugin.taskService.getParentOf(goal.id);
      if (!parent && (goal.planKind === "month" || goal.planKind === "quarter")) {
        const parentKey = getParentPeriodKey(goal.planKind, goal.planPeriodKey ?? "");
        if (parentKey) {
          const parentKind: PlanKind = goal.planKind === "month" ? "quarter" : "year";
          parent = this.plugin.taskService.getByPlanKindAndPeriod(parentKind, parentKey)[0];
        }
      }
      const goalTags = (goal.tags || []).map((id) => goalAllTags.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);

      const card = cards.createDiv({ cls: "todo-goal-card" + (overdue ? " todo-goal-card-overdue" : "") });
      card.setAttribute("data-goal-id", goal.id);
      card.tabIndex = 0;
      card.setAttribute("role", "button");

      // Drop handler: associate dragged quarterly goal with this monthly goal
      if (kind === "month") {
        card.addEventListener("dragover", (ev) => { ev.preventDefault(); card.addClass("todo-goal-card-drop-hover"); });
        card.addEventListener("dragleave", () => { card.removeClass("todo-goal-card-drop-hover"); });
        card.addEventListener("drop", async (ev) => {
          ev.preventDefault();
          card.removeClass("todo-goal-card-drop-hover");
          const dragId = ev.dataTransfer?.getData("text/plain");
          if (dragId && dragId !== goal.id) {
            await this.plugin.taskService.update(goal.id, { parentId: dragId });
            await this.renderGoalDashboard(kind);
          }
        });
      }

            // row1: checkbox + title + right-aligned parent/tags
      const row1 = card.createDiv({ cls: "todo-goal-card-row" });
      const checkbox = row1.createDiv({ cls: "todo-checkbox" + (goal.isCompleted ? " checked" : ""), text: goal.isCompleted ? "✓" : "" });
      checkbox.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const cur = this.plugin.taskService.getAll().find((t) => t.id === goal.id); if (cur && cur.isCompleted) { await this.plugin.taskService.uncomplete(goal.id); }
        else { await this.plugin.taskService.complete(goal.id); }
        this.refreshGoalCardAndStats(goal.id, kind);
      });
      row1.createSpan({ cls: "todo-goal-card-title", text: goal.title });
      if (parent || goalTags.length > 0) {
        const right = row1.createDiv({ cls: "todo-goal-card-right" });
        if (parent) {
          const parentLabelMap: Record<string, string> = { life: "人生目标", year: "年度目标", quarter: "季度目标", month: "月度目标" };
          const parentLabel = parentLabelMap[parent.planKind ?? ""] ?? "上级目标";
          right.createSpan({ cls: "todo-goal-card-parent-label", text: parentLabel + "：" + parent.title });
        }
        if (goalTags.length > 0) {
          goalTags.forEach((tag, i) => {
            if (parent && i === 0) {
              right.createSpan({ cls: "todo-goal-card-dot", text: " · " });
            } else if (i > 0) {
              right.createSpan({ cls: "todo-goal-card-dot", text: " · " });
            }
            const tagEl = right.createSpan({ cls: "todo-task-tag-label" });
            const tagIcon = tagEl.createSpan({ cls: "todo-task-tag-icon" });
            setIcon(tagIcon, tag.icon);
            tagEl.createSpan({ text: tag.name });
          });
        }
      }

      // row2: progress bar + KR count
      const row2 = card.createDiv({ cls: "todo-goal-card-metrics" });
      if (rate !== null) {
        const pct = Math.round(rate * 100);
        const barWrap = row2.createDiv({ cls: "todo-goal-progress" });
        const barFill = barWrap.createDiv({ cls: "todo-goal-progress-fill" });
        barFill.style.width = pct + "%";
        barWrap.createSpan({ cls: "todo-goal-progress-text", text: pct + "%" });
      }
      row2.createSpan({ cls: "todo-goal-metric-item", text: total === 0 ? "KR 0/0" : "KR " + done + "/" + total });
      if (overdue) row2.createSpan({ cls: "todo-goal-overdue-badge", text: "逾期" });

      // expand button (centered, full width)
      const expandBtn = card.createDiv({ cls: "todo-goal-expand-btn" });
      expandBtn.createSpan({ cls: "todo-goal-expand-text", text: "展开 ▾" });

      // expand body
      const body = card.createDiv({ cls: "todo-goal-card-body todo-goal-card-body-collapsed" });
      let bodyRendered = false;
      const openGoal = async () => {
        this.detailView.clearHistory();
        this.plugin.settings.selectedTaskId = goal.id;
        await this.plugin.saveSettings();
        this.detailView.open(goal.id);
        this.highlightSelectedTask(goal.id);
        const layout = this.containerEl.querySelector(".todo-layout");
        if (layout) layout.addClass("todo-layout-detail-open");
      };
      card.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); void openGoal(); } });
      expandBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const collapsed = body.classList.contains("todo-goal-card-body-collapsed");
        if (collapsed && !bodyRendered) {
          bodyRendered = true;
          const subKind = kind === "year" ? "quarter" : "week";
          const subKeys = getSubPeriodKeysForParent(kind, this.goalPeriodKey!);
          const grouped = new Map<string, { task: Task; completed: boolean }[]>();
          for (const sk of subKeys) grouped.set(sk, []);
          for (const c of children) {
            const key = c.planPeriodKey && grouped.has(c.planPeriodKey) ? c.planPeriodKey : null;
            if (key) grouped.get(key)!.push({ task: c, completed: c.isCompleted });
          }
          let hasAny = false;
          const KR_LIMIT = 50;
          let krRendered = 0;
          const renderKRItem = (sk: string, it: { task: Task; completed: boolean }, goalId: string, k: "year" | "month") => {
            const krOverdue = !it.completed && !!it.task.dueDate && extractLocalDate(it.task.dueDate!) < todayStr;
            const row = body.createDiv({ cls: "todo-goal-kr-item" + (it.completed ? " todo-goal-kr-done" : "") + (krOverdue ? " todo-goal-kr-overdue" : "") });
            const krCheck = row.createDiv({ cls: "todo-checkbox" + (it.completed ? " checked" : ""), text: it.completed ? "✓" : "" });
            krCheck.addEventListener("click", async (ev) => {
              ev.stopPropagation();
              if (it.completed) { await this.plugin.taskService.uncomplete(it.task.id); }
              else { await this.plugin.taskService.complete(it.task.id); }
              it.completed = !it.completed;
              krCheck.setText(it.completed ? "✓" : ""); krCheck.toggleClass("checked", it.completed);
              row.toggleClass("todo-goal-kr-done", it.completed);
              this.refreshGoalCardAndStats(goalId, k);
            });
            row.createSpan({ cls: "todo-goal-kr-title", text: it.task.title });
            row.addEventListener("click", async (ev) => {
              ev.stopPropagation();
              this.detailView.clearHistory();
              this.plugin.settings.selectedTaskId = it.task.id;
              await this.plugin.saveSettings();
              this.detailView.open(it.task.id);
              this.highlightSelectedTask(it.task.id);
              const lyt = this.containerEl.querySelector(".todo-layout");
              if (lyt) lyt.addClass("todo-layout-detail-open");
            });
          };
          for (const [sk, items] of grouped) {
            hasAny = true;
            const title = subGroupLabel(subKind, sk);
            const sgHeader = body.createDiv({ cls: "todo-goal-subgroup-title" });
            sgHeader.createSpan({ text: title });
            const addBtn = sgHeader.createSpan({ cls: "todo-goal-subgroup-add", text: " ＋" });
            addBtn.addEventListener("click", (ev) => {
              ev.stopPropagation();
              if (sgHeader.dataset.addOpen === "1") return;
              sgHeader.dataset.addOpen = "1";
              const inputWrap = document.createElement("div");
              inputWrap.className = "todo-goal-subgroup-inline-input";
              sgHeader.after(inputWrap);
              const input = inputWrap.createEl("input", { type: "text", placeholder: "输入KR标题..." });
              input.focus();
              let saved = false;
              const save = async () => {
                if (saved || !input.value.trim()) { if (inputWrap.isConnected) inputWrap.remove(); sgHeader.dataset.addOpen = "0"; return; }
                saved = true;
                try {
                  const newTask = await this.plugin.taskService.create({
                    title: input.value.trim(),
                    planKind: subKind,
                    planPeriodKey: sk,
                    parentId: goal.id,
                    tags: goal.tags ? [...goal.tags] : [],
                  });
                  // Re-render the dashboard (preserves expanded state via expandedGoalIds)
                  window.setTimeout(() => { void this.renderGoalDashboard(kind); }, 0);
                } catch (e) {
                  console.error("[ObsidianTodo] Failed to create KR:", e);
                }
              };
              input.addEventListener("keydown", (e) => {
                e.stopPropagation();
                if (e.key === "Enter") { e.preventDefault(); void save(); }
                if (e.key === "Escape") { inputWrap.remove(); sgHeader.dataset.addOpen = "0"; }
              });
              input.addEventListener("blur", () => { void save(); });
            });
            for (const it of items) {
              if (krRendered < KR_LIMIT) { renderKRItem(sk, it, goal.id, kind); krRendered++; }
            }
          }
          const remaining = children.length - krRendered;
          if (remaining > 0) {
            const moreBtn = body.createEl("button", { cls: "todo-goal-kr-more", text: "查看更多KR（" + remaining + "）" });
            moreBtn.addEventListener("click", (ev) => {
              ev.stopPropagation();
              let left = remaining;
              for (const [sk, items] of grouped) {
                for (const it of items) {
                  if (left <= 0) break;
                  renderKRItem(sk, it, goal.id, kind);
                  left--;
                }
                if (left <= 0) break;
              }
              moreBtn.remove();
            });
          }

        }
        body.classList.toggle("todo-goal-card-body-collapsed", !collapsed);
        if (collapsed) this.expandedGoalIds.add(goal.id); else this.expandedGoalIds.delete(goal.id);
        const et = expandBtn.querySelector(".todo-goal-expand-text") as HTMLElement; if (et) et.setText(collapsed ? "收起 ▴" : "展开 ▾");
      });

      // Auto-expand previously expanded cards
      if (this.expandedGoalIds.has(goal.id)) expandBtn.click();

      card.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const menu = new Menu();

        // Toggle complete
        menu.addItem((item) =>
          item
            .setTitle(goal.isCompleted ? "\u6807\u8BB0\u4E3A\u672A\u5B8C\u6210" : "\u6807\u8BB0\u4E3A\u5DF2\u5B8C\u6210")
            .setIcon(goal.isCompleted ? "circle" : "check-circle")
            .onClick(async () => {
              if (goal.isCompleted) { await this.plugin.taskService.uncomplete(goal.id); }
              else { await this.plugin.taskService.complete(goal.id); }
              this.refreshGoalCardAndStats(goal.id, kind);
            }),
        );

        // Add / remove from My Day
        menu.addItem((item) =>
          item
            .setTitle(goal.myDayDate ? "\u4ECE\u201C\u6211\u7684\u4E00\u5929\u201D\u79FB\u9664" : "\u6DFB\u52A0\u5230\u201C\u6211\u7684\u4E00\u5929\u201D")
            .setIcon(goal.myDayDate ? "calendar-minus" : "calendar-plus")
            .onClick(async () => {
              if (goal.myDayDate) {
                await this.plugin.taskService.update(goal.id, { myDayDate: null });
              } else {
                const today = localTodayStr();
                await this.plugin.taskService.update(goal.id, { myDayDate: today, startDate: today + "T07:00:00", dueDate: today + "T23:30:00" });
              }
              this.refreshGoalCardAndStats(goal.id, kind);
            }),
        );

        menu.addSeparator();

        // Status: shelved
        if (goal.status !== "shelved") {
          menu.addItem((item) =>
            item
              .setTitle("\u6401\u7F6E\u76EE\u6807")
              .setIcon("pause-circle")
              .onClick(async () => {
                await this.plugin.taskService.update(goal.id, { status: "shelved" });
                this.refreshGoalCardAndStats(goal.id, kind);
              }),
          );
        }

        // Status: abandoned
        if (goal.status !== "abandoned") {
          menu.addItem((item) =>
            item
              .setTitle("\u653E\u5F03\u76EE\u6807")
              .setIcon("x-circle")
              .onClick(async () => {
                await this.plugin.taskService.update(goal.id, { status: "abandoned" });
                this.refreshGoalCardAndStats(goal.id, kind);
              }),
          );
        }

        // Restore to active
        if (goal.status === "shelved" || goal.status === "abandoned") {
          menu.addItem((item) =>
            item
              .setTitle("\u6062\u590D\u4E3A\u8FDB\u884C\u4E2D")
              .setIcon("play-circle")
              .onClick(async () => {
                await this.plugin.taskService.update(goal.id, { status: "active" });
                this.refreshGoalCardAndStats(goal.id, kind);
              }),
          );
        }

        menu.addSeparator();

        // Delete
        menu.addItem((item) =>
          item
            .setTitle("\u5220\u9664\u76EE\u6807")
            .setIcon("trash")
            .onClick(async () => {
              await this.plugin.taskService.delete(goal.id);
              this.renderGoalDashboard(kind);
            }),
        );

        menu.showAtPosition({ x: ev.clientX, y: ev.clientY });
      });
      card.addEventListener("click", () => { void openGoal(); });
    };

    const appendBatch = () => {
      const end = Math.min(sorted.length, goalIdx + BATCH);
      for (; goalIdx < end; goalIdx++) renderGoal(sorted[goalIdx]);
    };
    appendBatch();
    if (goalIdx < sorted.length) {
      const sentinel = cards.createDiv({ cls: "todo-goal-sentinel" });
      const obs = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { appendBatch(); if (goalIdx >= sorted.length) { obs.disconnect(); sentinel.remove(); } }
      }, { root: this.taskListEl });
      obs.observe(sentinel);
    }

    const firstCard = cards.querySelector(".todo-goal-card") as HTMLElement | null;
    const targetEl = firstCard ?? statsRow;
    if (prevScrollTop > 0) {
      this.taskListEl.scrollTop = prevScrollTop;
    } else if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    }
  }

  private refreshGoalCardAndStats(goalId: string, kind: "year" | "month"): void {
    const card = this.taskListEl.querySelector(`[data-goal-id="${goalId}"]`) as HTMLElement | null;
    if (!card) return;
    const goal = this.plugin.taskService.getAll().find((t) => t.id === goalId);
    if (!goal) return;

    // update check symbol
    const checkEl = card.querySelector(".todo-checkbox") as HTMLElement | null;
    if (checkEl) { checkEl.setText(goal.isCompleted ? "✓" : ""); checkEl.toggleClass("checked", goal.isCompleted); }

    // update title completed style
    const titleEl = card.querySelector(".todo-goal-card-title") as HTMLElement | null;
    if (titleEl) titleEl.toggleClass("completed", goal.isCompleted);

    // recalculate KR progress
    const children = this.plugin.taskService.getChildrenOf(goalId);
    const total = children.length;
    const done = children.filter((c) => c.isCompleted).length;
    const rate = total === 0 ? null : done / total;

    // update KR label (second metric-item)
    const metricsRow = card.querySelector(".todo-goal-card-metrics");
    if (metricsRow) {
      const items = metricsRow.querySelectorAll(".todo-goal-metric-item");
      for (const el of Array.from(items)) {
        if (el.textContent && el.textContent.startsWith("KR")) {
          (el as HTMLElement).setText(total === 0 ? "KR 0/0" : "KR " + done + "/" + total);
        }
      }
    }

    // update progress bar (create if missing)
    let barFill = card.querySelector(".todo-goal-progress-fill") as HTMLElement | null;
    let barText = card.querySelector(".todo-goal-progress-text") as HTMLElement | null;
    if (rate !== null && !barFill && metricsRow) {
      const barWrap = metricsRow.createDiv({ cls: "todo-goal-progress" });
      barFill = barWrap.createDiv({ cls: "todo-goal-progress-fill" });
      barText = barWrap.createSpan({ cls: "todo-goal-progress-text" });
    }
    if (rate !== null) {
      const pct = Math.round(rate * 100);
      if (barFill) barFill.style.width = pct + "%";
      if (barText) barText.setText(pct + "%");
    }

    // update overdue state
    const todayStr = localTodayStr();
    const overdue = !goal.isCompleted && !!goal.dueDate && extractLocalDate(goal.dueDate!) < todayStr;
    card.toggleClass("todo-goal-card-overdue", overdue);
    let overdueBadge = card.querySelector(".todo-goal-overdue-badge") as HTMLElement | null;
    if (overdue && !overdueBadge) {
      const r2 = card.querySelector(".todo-goal-card-metrics");
      if (r2) r2.createSpan({ cls: "todo-goal-overdue-badge", text: "\u903E\u671F" });
    } else if (!overdue && overdueBadge) {
      overdueBadge.remove();
    }

    // update stats row
    const goalAllTasks = this.plugin.taskService.getAll();
    const periodTasks = goalAllTasks.filter((t) => t.planKind === kind && t.planPeriodKey === this.goalPeriodKey && !t.isDeleted && !t.isRecurrenceTemplate);
    const totalCount = periodTasks.length;
    const completedCount = periodTasks.filter((t) => t.isCompleted).length;
    const inProgressCount = totalCount - completedCount;
    const overdueCount = periodTasks.filter((t) => !t.isCompleted && t.dueDate && extractLocalDate(t.dueDate) < todayStr).length;
    const completionRate = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

    const statsRow = this.taskListEl.querySelector(".todo-goal-stats-row") as HTMLElement | null;
    if (statsRow) {
      const values = statsRow.querySelectorAll(".todo-goal-stat-value");
      if (values[0]) values[0].setText(String(totalCount));
      if (values[1]) values[1].setText(String(completedCount));
      if (values[2]) values[2].setText(String(inProgressCount));
      if (values[3]) {
        values[3].setText(String(overdueCount));
        const oc = values[3].closest(".todo-goal-stat-card") as HTMLElement | null;
        if (oc) { oc.removeClass("todo-goal-stat-overdue"); oc.removeClass("todo-goal-stat-overdue-empty"); oc.addClass(overdueCount > 0 ? "todo-goal-stat-overdue" : "todo-goal-stat-overdue-empty"); }
      }
      if (values[4]) {
        values[4].setText(completionRate + "%");
        const rc = values[4].closest(".todo-goal-stat-card") as HTMLElement | null;
        if (rc) { rc.removeClass("todo-goal-stat-rate-full"); if (completionRate >= 100) rc.addClass("todo-goal-stat-rate-full"); }
      }
    }
  }

  private renderGoalListContent(kind: "year" | "month", container: HTMLElement): void {
    const ts = this.plugin.taskService;
    const subKind: PlanKind | null = kind === "year" ? "quarter" : kind === "month" ? "week" : null;
    const pk = this.goalPeriodKey!;
    const parentTasks = ts.getByPlanKindAndPeriod(kind, pk);
    const groupEl = container.createDiv({ cls: "todo-plan-group" });
    const headerEl = groupEl.createDiv({ cls: "todo-plan-group-header" });
    const arrow = headerEl.createSpan({ cls: "todo-plan-group-arrow", text: "▼" });
    headerEl.createSpan({ cls: "todo-plan-group-label", text: periodLabel(kind, pk) });
    headerEl.createSpan({ cls: "todo-plan-group-count", text: String(parentTasks.length) });
    const addBtn = headerEl.createSpan({ cls: "todo-plan-add-btn", text: "+" });
    addBtn.title = "新建任务";
    const bodyEl = groupEl.createDiv({ cls: "todo-plan-group-body" });
    bodyEl.dataset.periodKey = pk;
    for (const task of parentTasks) { this.renderTaskRow(bodyEl, task, "plan"); }
    this.setupPlanAddButton(addBtn, bodyEl, kind, pk);
    headerEl.addEventListener("click", (ev) => {
      if ((ev.target as HTMLElement).closest(".todo-plan-add-btn")) return;
      const c2 = bodyEl.style.display === "none"; bodyEl.style.display = c2 ? "" : "none"; arrow.toggleClass("collapsed", !c2);
    });
    if (subKind) {
      const subKeys = getSubPeriodKeysForParent(kind, pk);
      for (const sk of periodKeySort(subKind, subKeys)) {
        const subTasks = ts.getByPlanKindAndPeriod(subKind, sk);
        const sg = container.createDiv({ cls: "todo-plan-subgroup" });
        const sh = sg.createDiv({ cls: "todo-plan-subgroup-header" });
        const sa = sh.createSpan({ cls: "todo-plan-group-arrow", text: "▼" });
        sh.createSpan({ cls: "todo-plan-subgroup-label", text: subGroupLabel(subKind, sk) });
        sh.createSpan({ cls: "todo-plan-group-count", text: String(subTasks.length) });
        const sab = sh.createSpan({ cls: "todo-plan-add-btn", text: "+" }); sab.title = "新建任务";
        const sb = sg.createDiv({ cls: "todo-plan-group-body" }); sb.dataset.periodKey = sk;
        for (const task of subTasks) { this.renderTaskRow(sb, task, "plan"); }
        this.setupPlanAddButton(sab, sb, subKind, sk);
        sh.addEventListener("click", (ev) => {
          if ((ev.target as HTMLElement).closest(".todo-plan-add-btn")) return;
          const c2 = sb.style.display === "none"; sb.style.display = c2 ? "" : "none"; sa.toggleClass("collapsed", !c2);
        });
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
    const allTags = this.plugin.tagService.getAll();
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
        const lifeCheckbox = card.createDiv({ cls: "todo-checkbox" + (t.isCompleted ? " checked" : ""), text: t.isCompleted ? "\u2713" : "" });
        lifeCheckbox.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          if (t.isCompleted) { await this.plugin.taskService.uncomplete(t.id); } else { await this.plugin.taskService.complete(t.id); }
          await this.renderLifePlanView();
        });
        card.createSpan({ cls: "todo-life-card-title" + (t.isCompleted ? " completed" : ""), text: t.title });
        const cardTags0 = (t.tags || []).map((id) => allTags.find((tg) => tg.id === id)).filter((tg): tg is NonNullable<typeof tg> => !!tg);
        if (cardTags0.length > 0) {
          const tagRow = card.createDiv({ cls: "todo-life-card-tags" });
          cardTags0.forEach((tag) => {
            const chip = tagRow.createSpan({ cls: "todo-life-card-tag" });
            const chipIcon = chip.createSpan({ cls: "todo-life-card-tag-icon" });
            setIcon(chipIcon, tag.icon);
            chip.createSpan({ text: tag.name });
          });
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
        const lifeCheckbox2 = card.createDiv({ cls: "todo-checkbox" + (t.isCompleted ? " checked" : ""), text: t.isCompleted ? "\u2713" : "" });
        lifeCheckbox2.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          if (t.isCompleted) { await this.plugin.taskService.uncomplete(t.id); } else { await this.plugin.taskService.complete(t.id); }
          await this.renderLifePlanView();
        });
        card.createSpan({ cls: "todo-life-card-title" + (t.isCompleted ? " completed" : ""), text: t.title });
        const cardTags1 = (t.tags || []).map((id) => allTags.find((tg) => tg.id === id)).filter((tg): tg is NonNullable<typeof tg> => !!tg);
        if (cardTags1.length > 0) {
          const tagRow = card.createDiv({ cls: "todo-life-card-tags" });
          cardTags1.forEach((tag) => {
            const chip = tagRow.createSpan({ cls: "todo-life-card-tag" });
            const chipIcon = chip.createSpan({ cls: "todo-life-card-tag-icon" });
            setIcon(chipIcon, tag.icon);
            chip.createSpan({ text: tag.name });
          });
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
    // Auto-scroll to current age
    if (ageGroups.has(curAge)) {
      const curNode = container.querySelector(".todo-life-node.is-current");
      if (curNode) {
        curNode.scrollIntoView({ block: "center" });
      }
    }

  }



  private getScheduleTitle(): string {
    const dowNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    switch (this.scheduleMode) {
      case "month":
        return this.scheduleYear + "年" + (this.scheduleMonth + 1) + "月";
      case "day": {
        const d = new Date(this.scheduleYear, this.scheduleMonth, this.scheduleDate);
        return (this.scheduleMonth + 1) + "月" + this.scheduleDate + "日 " + dowNames[d.getDay()];
      }
      case "week": {
        const d = new Date(this.scheduleYear, this.scheduleMonth, this.scheduleDate);
        const wn = getISOWeekNumber(d);
        return this.scheduleYear + "年 第" + wn + "周";
      }
    }
  }

  private normalizeScheduleDate(): void {
    const d = new Date(this.scheduleYear, this.scheduleMonth, this.scheduleDate);
    this.scheduleYear = d.getFullYear();
    this.scheduleMonth = d.getMonth();
    this.scheduleDate = d.getDate();
  }

  private layoutOverlapTasks(tasks: Task[]): { task: Task; col: number; totalCols: number }[] {
    if (!tasks.length) return [];
    const HOUR_HEIGHT = 60;
    const items = tasks
      .filter(t => t.startDate && t.dueDate)
      .map(t => ({
        task: t,
        start: new Date(t.startDate!).getTime(),
        end: new Date(t.dueDate!).getTime(),
      }))
      .sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    const columns: number[] = [];
    const placements: { task: Task; start: number; end: number; col: number }[] = [];

    for (const item of items) {
      let col = columns.findIndex(endTime => endTime <= item.start);
      if (col === -1) { col = columns.length; columns.push(0); }
      columns[col] = item.end;
      placements.push({ task: item.task, start: item.start, end: item.end, col });
    }

    type PlacementItem = { task: Task; start: number; end: number; col: number };
    const groups: PlacementItem[][] = [];
    let curGroup: PlacementItem[] = [];
    let groupMaxEnd = 0;
    for (const p of placements) {
      if (curGroup.length === 0 || p.start < groupMaxEnd) {
        curGroup.push(p);
        groupMaxEnd = Math.max(groupMaxEnd, p.end);
      } else {
        groups.push(curGroup);
        curGroup = [p];
        groupMaxEnd = p.end;
      }
    }
    if (curGroup.length) groups.push(curGroup);

    const result: { task: Task; col: number; totalCols: number }[] = [];
    for (const group of groups) {
      const totalCols = Math.max(...group.map(p => p.col)) + 1;
      for (const p of group) {
        result.push({ task: p.task, col: p.col, totalCols });
      }
    }
    return result;
  }

  private lightenColor(hex: string, factor: number): string {
    if (!hex || hex.length < 7) return hex;
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    const lr = Math.round(r + (255 - r) * factor);
    const lg = Math.round(g + (255 - g) * factor);
    const lb = Math.round(b + (255 - b) * factor);
    return "#" + [lr, lg, lb].map(v => v.toString(16).padStart(2, "0")).join("");
  }

  private getTaskBlockColor(task: Task): string {
    const allTags = this.plugin.tagService.getAll();
    const colorTag = task.tags
      .map(id => allTags.find(t => t.id === id && t.sortOrder >= 4))
      .find(Boolean);
    const raw = colorTag?.color || "#4A90D9";
    return this.lightenColor(raw, 0.45);
  }

  private renderTrashView(): void {
    const container = this.taskListEl;
    container.empty();

    const header = container.createDiv({ cls: "todo-trash-header" });
    const headerText = header.createDiv({ cls: "todo-trash-header-text" });
    headerText.createEl("h2", { text: "\u56de\u6536\u7ad9" });
    const desc = headerText.createDiv({ cls: "todo-trash-desc" });
    desc.createSpan({ text: "\u5df2\u5220\u9664\u7684\u4efb\u52a1\u5c06\u4fdd\u7559 30 \u5929\uff0c\u4e4b\u540e\u81ea\u52a8\u6e05\u7406" });

    const emptyBtn = header.createEl("button", { text: "\u6e05\u7a7a\u56de\u6536\u7ad9", cls: "todo-trash-btn todo-trash-btn-danger todo-trash-header-btn" });
    emptyBtn.addEventListener("click", async () => {
      const confirmed = await new ConfirmModal(this.app, "\u786e\u5b9a\u6c38\u4e45\u5220\u9664\u56de\u6536\u7ad9\u4e2d\u7684 " + deletedTasks.length + " \u4e2a\u4efb\u52a1\u5417\uff1f\u6b64\u64cd\u4f5c\u4e0d\u53ef\u64a4\u9500\u3002").openAndConfirm();
      if (confirmed) {
        await this.plugin.taskService.emptyTrash();
        this.renderTrashView();
      }
    });


    const deletedTasks = this.plugin.taskService.getDeleted();

    if (deletedTasks.length === 0) {
      const empty = container.createDiv({ cls: "todo-trash-empty" });
      empty.createDiv({ text: "回收站是空的" });
      return;
    }

    const stats = container.createDiv({ cls: "todo-trash-stats" });
    stats.createSpan({ text: "共 " + deletedTasks.length + " 个任务" });

    const list = container.createDiv({ cls: "todo-trash-list" });
    for (const task of deletedTasks) {
      const row = list.createDiv({ cls: "todo-trash-item" });
      const info = row.createDiv({ cls: "todo-trash-item-info" });
      info.createDiv({ cls: "todo-trash-item-title", text: task.title || "未命名任务" });
      const meta = info.createDiv({ cls: "todo-trash-item-meta" });
      if (task.deletedAt) {
        const deleteDate = new Date(task.deletedAt);
        meta.createSpan({ text: "删除于 " + deleteDate.toLocaleDateString() + " " + deleteDate.toLocaleTimeString() });
      }

      const actions = row.createDiv({ cls: "todo-trash-item-actions" });
      const restoreBtn = actions.createEl("button", { text: "恢复", cls: "todo-trash-btn" });
      restoreBtn.addEventListener("click", async () => {
        await this.plugin.taskService.restore(task.id);
        this.renderTrashView();
      });
      const deleteBtn = actions.createEl("button", { text: "彻底删除", cls: "todo-trash-btn todo-trash-btn-danger" });
      deleteBtn.addEventListener("click", async () => {
        const confirmed = await new ConfirmModal(this.app, "确定永久删除「" + (task.title || "未命名任务") + "」吗？此操作不可撤销。").openAndConfirm();
        if (confirmed) {
          await this.plugin.taskService.hardDelete(task.id);
          this.renderTrashView();
        }
      });
    }

  }
  private renderScheduleView(): void {
    if (this.timeLineTimer) { clearInterval(this.timeLineTimer); this.timeLineTimer = null; }
    const container = this.taskListEl;
    container.empty();
    const wrap = container.createDiv({ cls: "todo-schedule-container" });

    const header = wrap.createDiv({ cls: "todo-schedule-header" });
    const nav = header.createDiv({ cls: "todo-schedule-nav" });
    const prevBtn = nav.createEl("button", { cls: "todo-schedule-prev", text: "◀" });
    const titleEl = nav.createSpan({ cls: "todo-schedule-title", text: this.getScheduleTitle() });
    const nextBtn = nav.createEl("button", { cls: "todo-schedule-next", text: "▶" });
    const todayBtn = nav.createEl("button", { cls: "todo-schedule-today-btn", text: "今天" });

    const updateView = () => {
      titleEl.textContent = this.getScheduleTitle();
      this.renderScheduleContent(contentEl);
    };

    prevBtn.addEventListener("click", () => {
      if (this.scheduleMode === "month") { this.scheduleMonth--; if (this.scheduleMonth < 0) { this.scheduleMonth = 11; this.scheduleYear--; } }
      else if (this.scheduleMode === "day") { this.scheduleDate--; this.normalizeScheduleDate(); }
      else { this.scheduleDate -= 7; this.normalizeScheduleDate(); }
      updateView();
    });
    nextBtn.addEventListener("click", () => {
      if (this.scheduleMode === "month") { this.scheduleMonth++; if (this.scheduleMonth > 11) { this.scheduleMonth = 0; this.scheduleYear++; } }
      else if (this.scheduleMode === "day") { this.scheduleDate++; this.normalizeScheduleDate(); }
      else { this.scheduleDate += 7; this.normalizeScheduleDate(); }
      updateView();
    });
    todayBtn.addEventListener("click", () => {
      const now = new Date();
      this.scheduleYear = now.getFullYear();
      this.scheduleMonth = now.getMonth();
      this.scheduleDate = now.getDate();
      updateView();
    });

    const switchEl = header.createDiv({ cls: "todo-schedule-mode-switch" });
    const modes = ["day", "week", "month"] as const;
    const modeLabels: Record<string, string> = { day: "日", week: "周", month: "月" };
    for (const m of modes) {
      const btn = switchEl.createSpan({
        cls: "todo-schedule-mode-btn" + (m === this.scheduleMode ? " active" : ""),
        text: modeLabels[m],
      });
      btn.addEventListener("click", async () => {
        this.scheduleMode = m;
        this.plugin.settings.activeScheduleMode = m;
        await this.plugin.saveSettings();
        switchEl.querySelectorAll(".todo-schedule-mode-btn").forEach((el) => el.removeClass("active"));
        btn.addClass("active");
        titleEl.textContent = this.getScheduleTitle();
        this.scheduleScrollTarget = "now";
        this.renderScheduleContent(contentEl);
      });
    }

    const contentEl = wrap.createDiv({ cls: "todo-schedule-content" });
    this.renderScheduleContent(contentEl);
  }

  private renderScheduleContent(container: HTMLDivElement): void {
    if (this.timeLineTimer) { clearInterval(this.timeLineTimer); this.timeLineTimer = null; }
    container.empty();
    switch (this.scheduleMode) {
      case "month":
        this.renderMonthView(container);
        break;
      case "day":
        this.renderDayView(container);
        break;
      case "week":
        this.renderWeekView(container);
        break;
    }
  }

  private renderMonthView(container: HTMLDivElement): void {
    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    const weekdaysEl = container.createDiv({ cls: "todo-schedule-weekdays" });
    for (const wd of weekdays) { weekdaysEl.createSpan({ text: wd }); }
    const grid = container.createDiv({ cls: "todo-schedule-grid" });
    const firstDay = new Date(this.scheduleYear, this.scheduleMonth, 1);
    const startDow = firstDay.getDay();
    const daysInMonth = new Date(this.scheduleYear, this.scheduleMonth + 1, 0).getDate();
    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
    grid.style.setProperty("--schedule-rows", String(totalCells / 7));
    const prevMonthDays = new Date(this.scheduleYear, this.scheduleMonth, 0).getDate();
    const today = new Date();
    const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    for (let i = 0; i < totalCells; i++) {
      let dayNum: number;
      let dateStr: string;
      let isOther = false;
      if (i < startDow) {
        dayNum = prevMonthDays - startDow + i + 1;
        const pm = this.scheduleMonth === 0 ? 11 : this.scheduleMonth - 1;
        const py = this.scheduleMonth === 0 ? this.scheduleYear - 1 : this.scheduleYear;
        dateStr = py + "-" + String(pm + 1).padStart(2, "0") + "-" + String(dayNum).padStart(2, "0");
        isOther = true;
      } else if (i >= startDow + daysInMonth) {
        dayNum = i - startDow - daysInMonth + 1;
        const nm = this.scheduleMonth === 11 ? 0 : this.scheduleMonth + 1;
        const ny = this.scheduleMonth === 11 ? this.scheduleYear + 1 : this.scheduleYear;
        dateStr = ny + "-" + String(nm + 1).padStart(2, "0") + "-" + String(dayNum).padStart(2, "0");
        isOther = true;
      } else {
        dayNum = i - startDow + 1;
        dateStr = this.scheduleYear + "-" + String(this.scheduleMonth + 1).padStart(2, "0") + "-" + String(dayNum).padStart(2, "0");
      }
      const cell = grid.createDiv({ cls: "todo-schedule-cell", attr: { "data-date-str": dateStr } });
      if (isOther) cell.addClass("todo-schedule-other-month");
      if (dateStr === todayStr) cell.addClass("todo-schedule-today");
      const dow = i % 7;
      if (dow === 0 || dow === 6) cell.addClass("todo-schedule-weekend");
      cell.createDiv({ cls: "todo-schedule-cell-date", text: String(dayNum) });
      cell.createDiv({ cls: "todo-schedule-cell-tasks" });
    }
    // 渲染任务到月历格子
    const allTasks = this.plugin.taskService.getAll();
    const monthTasks = allTasks.filter(t => !t.isCompleted && t.dueDate);
    for (const task of monthTasks) {
      const taskDate = extractLocalDate(task.dueDate!);
      const targetCell = grid.querySelector('[data-date-str="' + taskDate + '"] .todo-schedule-cell-tasks') as HTMLElement;
      if (!targetCell) continue;
      const card = targetCell.createDiv({ cls: "todo-month-task-card" });
      card.style.backgroundColor = this.getTaskBlockColor(task);
      card.style.color = this.getContrastColor(this.getTaskBlockColor(task));
      card.createSpan({ cls: "todo-month-task-title", text: task.title });
      if (task.recurrence) {
        const recIcon = card.createSpan({ cls: "todo-month-task-rec" });
        setIcon(recIcon, "repeat");
      }
      card.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.detailView.open(task.id);
      });
    }
  }


  private renderScheduleTaskCard(container: HTMLElement, task: Task): void {
    const sd = new Date(task.startDate!);
    const ed = new Date(task.dueDate!);
    const pad = (n: number) => String(n).padStart(2, "0");
    const timeStr = pad(sd.getHours()) + ":" + pad(sd.getMinutes()) + " - " + pad(ed.getHours()) + ":" + pad(ed.getMinutes());
    const blockColor = this.getTaskBlockColor(task);

    const card = container.createDiv({ cls: "todo-time-event-block" });
    card.dataset.taskId = task.id;
    card.style.backgroundColor = blockColor;
    const textColor = this.getContrastColor(blockColor);
    card.style.color = textColor;
    card.createDiv({ cls: "todo-event-time", text: timeStr });
    const titleRow = card.createDiv({ cls: "todo-event-title-row" });
    if (task.recurrence) {
      const recIcon = titleRow.createSpan({ cls: "todo-event-recurrence-icon" });
      setIcon(recIcon, "repeat");
    }
    titleRow.createSpan({ cls: "todo-event-title", text: task.title });
    card.createDiv({ cls: "todo-resize-handle" });

    card.addEventListener("mousedown", (ev) => {
      if (ev.button !== 0) return;
      const rect = card.getBoundingClientRect();
      const isResize = (ev.clientY - rect.top) > rect.height - 8;
      const startMin = sd.getHours() * 60 + sd.getMinutes();
      const endMin = ed.getHours() * 60 + ed.getMinutes();
      const dateStr = extractLocalDate(task.dueDate!);
      const hourHeight = 60;

      // Cross-day detection for week view
      const columnsEl = container.closest(".todo-week-columns") as HTMLElement | null;
      const colCount = columnsEl ? columnsEl.children.length : 1;
      const columnsRect = columnsEl ? columnsEl.getBoundingClientRect() : null;
      const dateStrs: string[] = [];
      let currentColIdx = 0;
      if (columnsEl) {
        for (let ci = 0; ci < columnsEl.children.length; ci++) {
          const cEl = columnsEl.children[ci] as HTMLElement;
          const firstCard = cEl.querySelector("[data-date-str]") as HTMLElement | null;
          if (firstCard) dateStrs.push(firstCard.dataset.dateStr!);
          else {
            // Derive date from weekStart offset
            const refDate = new Date(this.scheduleYear, this.scheduleMonth, this.scheduleDate);
            const dow = refDate.getDay() || 7;
            const ws = new Date(refDate); ws.setDate(refDate.getDate() - dow + 1);
            const cd = new Date(ws); cd.setDate(ws.getDate() + ci);
            dateStrs.push(cd.getFullYear() + "-" + String(cd.getMonth() + 1).padStart(2, "0") + "-" + String(cd.getDate()).padStart(2, "0"));
          }
          if (cEl.contains(card)) currentColIdx = ci;
        }
      }

      // Create ghost in columns container for week view (cross-day drag)
      const ghostParent = columnsEl || container;
      const ghost = ghostParent.createDiv({ cls: "todo-drag-ghost" });
      ghost.style.backgroundColor = blockColor;
      let ghostBaseLeft = 0;
      if (columnsEl && columnsRect) {
        // Week view: position ghost relative to columns container
        const colWidth = columnsRect.width / colCount;
        const colRect = container.getBoundingClientRect();
        const cardLeftInCol = card.getBoundingClientRect().left - colRect.left;
        ghostBaseLeft = currentColIdx * colWidth + cardLeftInCol;
        ghost.style.left = ghostBaseLeft + "px";
        ghost.style.width = card.getBoundingClientRect().width + "px";
        ghost.style.top = card.style.top;
        ghost.style.height = card.style.height;
      } else {
        // Day view: keep original positioning
        ghost.style.left = card.style.left;
        ghost.style.width = card.style.width;
        ghost.style.top = card.style.top;
        ghost.style.height = card.style.height;
      }

      // Find scroll container for auto-scroll
      const scrollContainer = columnsEl
        ? container.closest(".todo-schedule-week-grid") as HTMLElement | null
        : container.closest(".todo-time-grid") as HTMLElement | null;
      this.dragState = {
        type: isResize ? "resize" : "move",
        taskId: task.id,
        startY: ev.clientY,
        startX: ev.clientX,
        origStartMin: startMin,
        origEndMin: endMin,
        dateStr,
        hourHeight,
        ghost,
        card,
        moved: false,
        colCount,
        columnsRect,
        dateStrs,
        currentColIdx,
        ghostBaseLeft,
        scrollContainer,
        scrollRAF: null,
        source: "timeline" as const,
        origScrollTop: scrollContainer?.scrollTop || 0,
        columnsEl: columnsEl || null,
      };
      card.addClass("dragging");
    });
  }

  private getContrastColor(hex: string): string {
    if (!hex || hex.length < 7) return "#ffffff";
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.5 ? "#1a1a1a" : "#ffffff";
  }

  private isAllDayTask(task: Task): boolean {
    // 无任何日期
    if (!task.startDate && !task.dueDate) return true;
    // 有 dueDate 但无 startDate
    if (task.dueDate && !task.startDate) return true;
    // 有 dueDate，检查时间是否为全天标记
    if (task.dueDate) {
      const dueHasTime = task.dueDate.includes('T') && !task.dueDate.endsWith('T00:00:00') && !task.dueDate.endsWith('T23:30:00') && !task.dueDate.endsWith('T07:00:00');
      if (!dueHasTime) return true;
    }
    return false;
  }

  private renderDayView(container: HTMLDivElement): void {
    const HOUR_HEIGHT = 60;
    const dateStr = this.scheduleYear + "-" + String(this.scheduleMonth + 1).padStart(2, "0") + "-" + String(this.scheduleDate).padStart(2, "0");
    const allTasks = this.plugin.taskService.getAll();
    const dayTasks = allTasks.filter(t => !t.isCompleted && t.dueDate && extractLocalDate(t.dueDate) === dateStr && !this.isAllDayTask(t));

    const view = container.createDiv({ cls: "todo-schedule-day-view" });

    const pad = (n: number) => String(n).padStart(2, "0");
    const today = new Date();
    const todayStr = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());
    const alldayTasks = allTasks.filter(t => !t.isCompleted && (
      (t.dueDate && extractLocalDate(t.dueDate) === dateStr && this.isAllDayTask(t))
      || (t.myDayDate === dateStr && this.isAllDayTask(t))
    ));
    let gridEl: HTMLDivElement;
    const allday = view.createDiv({ cls: "todo-day-allday" });
    allday.createSpan({ cls: "todo-day-allday-label", text: "全天" });
    for (const t of alldayTasks) {
      const card = allday.createDiv({ cls: "todo-day-allday-card" });
      card.style.backgroundColor = this.getTaskBlockColor(t);
      card.style.color = this.getContrastColor(this.getTaskBlockColor(t));
      card.createSpan({ text: t.title });
      card.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        const sc = gridEl;
        const scRect = sc.getBoundingClientRect();
        const ghost = sc.createDiv({ cls: "todo-drag-ghost" });
        const blockColor = this.getTaskBlockColor(t);
        ghost.style.backgroundColor = blockColor;
        ghost.style.left = "48px";
        ghost.style.right = "4px";
        ghost.style.width = "auto";
        ghost.style.top = "0px";
        ghost.style.height = "60px";
        this.dragState = {
          type: "move",
          taskId: t.id,
          startY: ev.clientY,
          startX: ev.clientX,
          origStartMin: 0,
          origEndMin: 60,
          dateStr,
          hourHeight: 60,
          ghost,
          card,
          moved: false,
          colCount: 1,
          columnsRect: null,
          dateStrs: [dateStr],
          currentColIdx: 0,
          ghostBaseLeft: 0,
          scrollContainer: sc,
          scrollRAF: null,
          source: "allday",
          origScrollTop: sc?.scrollTop || 0,
          columnsEl: null,
        };
        card.addClass("dragging");
      });
      card.addEventListener("click", () => {
        if (this.dragState || this._lastDragMoved) return;
        this.detailView.clearHistory();
        this.plugin.settings.selectedTaskId = t.id;
        void this.plugin.saveSettings();
        this.detailView.open(t.id);
        const layout = this.containerEl.querySelector(".todo-layout");
        if (layout) layout.addClass("todo-layout-detail-open");
      });
    }

    gridEl = view.createDiv({ cls: "todo-time-grid" });

    const slots = gridEl.createDiv({ cls: "todo-time-slots" });
    for (let h = 0; h < 24; h++) {
      slots.createDiv({ cls: "todo-time-slot" });
    }

    const labels = gridEl.createDiv({ cls: "todo-time-labels" });
    for (let h = 0; h <= 24; h++) {
      labels.createDiv({ cls: "todo-time-label", text: String(h).padStart(2, "0") + ":00" });
    }

    const eventsContainer = gridEl.createDiv({ cls: "todo-time-events" });
    const placements = this.layoutOverlapTasks(dayTasks);
    for (const p of placements) {
      const sd = new Date(p.task.startDate!);
      const ed = new Date(p.task.dueDate!);
      const startMin = sd.getHours() * 60 + sd.getMinutes();
      const endMin = ed.getHours() * 60 + ed.getMinutes();
      if (endMin < startMin) continue;

      this.renderScheduleTaskCard(eventsContainer, p.task);
      const card = eventsContainer.lastElementChild as HTMLElement;
      const top = (startMin / 60) * HOUR_HEIGHT;
      const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 20);
      card.style.top = top + "px";
      card.style.height = height + "px";
      const widthPct = 100 / p.totalCols;
      const leftPct = widthPct * p.col;
      const gap = p.col * 3;
      card.style.width = "calc(" + widthPct + "% - 3px)";
      card.style.left = "calc(" + leftPct + "% + " + gap + "px)";
    }

    // T-703: Click-to-create on empty time slot
    eventsContainer.addEventListener("click", async (ev) => {
      if (this.dragState || this._lastDragMoved) return;
      if (ev.target !== eventsContainer) return;
      const rect = eventsContainer.getBoundingClientRect();
      const y = ev.clientY - rect.top + gridEl.scrollTop;
      const startMin = this.snapMinute(y, HOUR_HEIGHT);
      const endMin = Math.min(1440, startMin + 60);
      const title = await new PromptModal(this.app, "\u8f93\u5165\u4efb\u52a1\u6807\u9898").openAndGetValue();
      if (!title) return;
      const defaultList = this.plugin.listService.getDefault();
      if (!defaultList) return;
      await this.plugin.taskService.create({
        title,
        listId: defaultList.id,
        startDate: this.minuteToIso(dateStr, startMin),
        dueDate: this.minuteToIso(dateStr, endMin),
        myDayDate: dateStr,
      });
      this.scheduleScrollTarget = "preserve";
      this.renderScheduleView();
    });

    this.renderTimeLine(gridEl);

    // Scroll strategy based on scheduleScrollTarget
    if (this.scheduleScrollTarget === "now") {
      gridEl.scrollTop = Math.max(0, ((new Date().getHours() - 1) * HOUR_HEIGHT));
    } else if (this.scheduleScrollTarget !== "preserve") {
      const taskEl = gridEl.querySelector(`[data-task-id="${this.scheduleScrollTarget.taskId}"]`) as HTMLElement;
      if (taskEl) taskEl.scrollIntoView({ block: "center" });
    }
    this.scheduleScrollTarget = "preserve";
  }

  private renderWeekView(container: HTMLDivElement): void {
    const HOUR_HEIGHT = 60;
    const refDate = new Date(this.scheduleYear, this.scheduleMonth, this.scheduleDate);
    const dow = refDate.getDay() || 7;
    const weekStart = new Date(refDate);
    weekStart.setDate(refDate.getDate() - dow + 1);
    const dowNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    const today = new Date();

    const view = container.createDiv({ cls: "todo-schedule-week-view" });
    const grid = view.createDiv({ cls: "todo-schedule-week-grid" });

    // Unified header: sticky thead with header + all-day rows
    const thead = grid.createDiv({ cls: "todo-week-thead" });

    // Header row
    const headerRow = thead.createDiv({ cls: "todo-week-header" });
    headerRow.createDiv({ cls: "todo-week-corner" });
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const isToday = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
      const col = headerRow.createDiv({ cls: "todo-week-day-header" + (isToday ? " todo-week-today-col" : "") });
      col.createDiv({ cls: "todo-week-dow", text: dowNames[i] });
      const dateNum = col.createDiv({ cls: "todo-week-date-num", text: String(d.getDate()) });
      if (isToday) { dateNum.addClass("todo-schedule-today"); }
    }

    // All-day row
    const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    const datedAllday = this.plugin.taskService.getAll().filter(t => !t.isCompleted && t.dueDate && this.isAllDayTask(t));
    const undatedMyDay = this.plugin.taskService.getAll().filter(t => !t.isCompleted && t.myDayDate && !t.startDate && !t.dueDate);
    const alldayRow = thead.createDiv({ cls: "todo-week-allday" });
    alldayRow.createDiv({ cls: "todo-week-allday-label", text: "全天" });
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const ds = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const cell = alldayRow.createDiv({ cls: "todo-week-allday-cell" + (ds === todayStr ? " todo-week-today-col" : "") });
      const cellTasks = [...datedAllday.filter(t => extractLocalDate(t.dueDate!) === ds), ...(ds === todayStr ? undatedMyDay : [])];
      for (const t of cellTasks) {
        const card = cell.createDiv({ cls: "todo-day-allday-card" });
        card.style.backgroundColor = this.getTaskBlockColor(t);
        card.style.color = this.getContrastColor(this.getTaskBlockColor(t));
        card.createSpan({ text: t.title });
        card.addEventListener("mousedown", (ev) => {
          if (ev.button !== 0) return;
          const sc = grid;
          const columnsEl = sc.querySelector(".todo-week-columns") as HTMLElement;
          const ghostParent = columnsEl || sc;
          const ghost = ghostParent.createDiv({ cls: "todo-drag-ghost" });
          const blockColor = this.getTaskBlockColor(t);
          ghost.style.backgroundColor = blockColor;
          const colCount = 7;
          const columnsRect = columnsEl ? columnsEl.getBoundingClientRect() : null;
          const colWidth = columnsRect ? columnsRect.width / colCount : 0;
          const dateStrs: string[] = [];
          for (let ci = 0; ci < 7; ci++) {
            const cd = new Date(weekStart); cd.setDate(weekStart.getDate() + ci);
            dateStrs.push(cd.getFullYear() + "-" + String(cd.getMonth() + 1).padStart(2, "0") + "-" + String(cd.getDate()).padStart(2, "0"));
          }
          const currentColIdx = i;
          const ghostBaseLeft = currentColIdx * colWidth;
          ghost.style.left = ghostBaseLeft + "px";
          ghost.style.width = colWidth + "px";
          ghost.style.top = "0px";
          ghost.style.height = "60px";
          this.dragState = {
            type: "move",
            taskId: t.id,
            startY: ev.clientY,
            startX: ev.clientX,
            origStartMin: 0,
            origEndMin: 60,
            dateStr: ds,
            hourHeight: 60,
            ghost,
            card,
            moved: false,
            colCount,
            columnsRect,
            dateStrs,
            currentColIdx,
            ghostBaseLeft,
            scrollContainer: sc,
            scrollRAF: null,
            source: "allday" as const,
            origScrollTop: sc?.scrollTop || 0,
            columnsEl: columnsEl || null,
          };
          card.addClass("dragging");
        });
        card.addEventListener("click", () => {
          if (this.dragState || this._lastDragMoved) return;
          this.detailView.clearHistory();
          this.plugin.settings.selectedTaskId = t.id;
          void this.plugin.saveSettings();
          this.detailView.open(t.id);
          const layout = this.containerEl.querySelector(".todo-layout");
          if (layout) layout.addClass("todo-layout-detail-open");
        });
      }
    }

    // Scrollable body with time grid and task columns
    const tbody = grid.createDiv({ cls: "todo-week-tbody" });
    const todayCol = today.getDay() === 0 ? 6 : today.getDay() - 1; // Mon=0..Sun=6

    // Time slot rows (24 hours, each is a grid row)
    for (let h = 0; h < 24; h++) {
      const row = tbody.createDiv({ cls: "todo-week-grid-row" });
      row.createDiv({ cls: "todo-week-time-cell" });
      for (let d = 0; d < 7; d++) { row.createDiv({ cls: "todo-week-day-cell" + (d === todayCol ? " todo-week-today-col" : "") }); }
    }

    // Time labels
    const labels = tbody.createDiv({ cls: "todo-time-labels" });
    for (let h = 0; h <= 24; h++) { labels.createDiv({ cls: "todo-time-label", text: String(h).padStart(2, "0") + ":00" }); }

    // Task columns (positioned over time slots)
    const columns = tbody.createDiv({ cls: "todo-week-columns" });
    const allTasks = this.plugin.taskService.getAll();
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const ds = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const col = columns.createDiv({ cls: "todo-week-column" });
      const dayTasks = allTasks.filter(t => !t.isCompleted && t.startDate && t.dueDate && extractLocalDate(t.dueDate) === ds && !this.isAllDayTask(t));
      const placements = this.layoutOverlapTasks(dayTasks);
      for (const p of placements) {
        const sd = new Date(p.task.startDate!);
        const ed = new Date(p.task.dueDate!);
        const startMin = sd.getHours() * 60 + sd.getMinutes();
        const endMin = ed.getHours() * 60 + ed.getMinutes();
        if (endMin < startMin) continue;
        this.renderScheduleTaskCard(col, p.task);
        const card = col.lastElementChild as HTMLElement;
        card.dataset.dateStr = ds;
        const top = (startMin / 60) * HOUR_HEIGHT;
        const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 18);
        card.style.top = top + "px";
        card.style.height = height + "px";
        const widthPct = 100 / p.totalCols;
        const leftPct = widthPct * p.col;
        const gap = p.col * 3;
        card.style.width = "calc(" + widthPct + "% - 3px)";
        card.style.left = "calc(" + leftPct + "% + " + gap + "px)";
      }

      // T-703: Click-to-create on empty week column
      col.addEventListener("click", async (ev) => {
        if (this.dragState || this._lastDragMoved) return;
        if (ev.target !== col) return;
        const rect = col.getBoundingClientRect();
        const y = ev.clientY - rect.top;
        const startMin = this.snapMinute(y, HOUR_HEIGHT);
        const endMin = Math.min(1440, startMin + 60);
        const title = await new PromptModal(this.app, "\u8f93\u5165\u4efb\u52a1\u6807\u9898").openAndGetValue();
        if (!title) return;
        const defaultList = this.plugin.listService.getDefault();
        if (!defaultList) return;
        await this.plugin.taskService.create({
          title,
          listId: defaultList.id,
          startDate: this.minuteToIso(ds, startMin),
          dueDate: this.minuteToIso(ds, endMin),
          myDayDate: ds,
        });
        this.scheduleScrollTarget = "preserve";
        this.renderScheduleView();
      });
    }

    // Timeline in thead (stays visible when scrolling)
    this.renderTimeLine(tbody);

    // Scroll strategy based on scheduleScrollTarget
    if (this.scheduleScrollTarget === "now") {
      grid.scrollTop = Math.max(0, ((today.getHours() - 1) * HOUR_HEIGHT));
    } else if (this.scheduleScrollTarget !== "preserve") {
      const taskEl = grid.querySelector(`[data-task-id="${this.scheduleScrollTarget.taskId}"]`) as HTMLElement;
      if (taskEl) taskEl.scrollIntoView({ block: "center" });
    }
    this.scheduleScrollTarget = "preserve";
  }

  private renderTimeLine(container: HTMLElement): void {
    const HOUR_HEIGHT = 60;
    const line = container.createDiv({ cls: "todo-time-line" });
    line.createDiv({ cls: "todo-time-line-dot" });
    const update = () => {
      const now = new Date();
      const min = now.getHours() * 60 + now.getMinutes();
      line.style.top = ((min / 60) * HOUR_HEIGHT) + "px";
    };
    update();
    this.timeLineTimer = window.setInterval(update, 60000);
  }

  // T-703: Utility — pixel to snapped minute (15min grid)
  private snapMinute(px: number, hourHeight: number): number {
    const raw = (px / hourHeight) * 60;
    return Math.round(raw / 15) * 15;
  }

  // T-703: Utility — dateStr + minuteOfDay → ISO string
  private minuteToIso(dateStr: string, minute: number): string {
    const capped = Math.min(minute, 1439);
    const h = Math.floor(capped / 60);
    const m = capped % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return dateStr + "T" + pad(h) + ":" + pad(m) + ":00";
  }

  // T-703: Handle drag move
  // T-703: Handle drag move
  private handleDragMove(ev: MouseEvent): void {
    const ds = this.dragState;
    if (!ds) return;
    const rawDeltaY = ev.clientY - ds.startY;
    const deltaX = ev.clientX - ds.startX;
    if (!ds.moved && Math.abs(rawDeltaY) < 3 && Math.abs(deltaX) < 3) return;
    ds.moved = true;
    const scrollChange = ds.scrollContainer ? (ds.scrollContainer.scrollTop - ds.origScrollTop) : 0;
    const deltaY = rawDeltaY + scrollChange;
    const deltaMin = Math.round((deltaY / ds.hourHeight) * 60 / 15) * 15;
    if (ds.type === "move") {
      const newStart = Math.max(0, Math.min(1425, ds.origStartMin + deltaMin));
      const duration = ds.origEndMin - ds.origStartMin;
      const newEnd = Math.min(1440, newStart + duration);
      ds.ghost.style.top = ((newStart / 60) * ds.hourHeight) + "px";
      ds.ghost.style.height = Math.max(15, ((newEnd - newStart) / 60) * ds.hourHeight) + "px";
    } else {
      const newEnd = Math.max(ds.origStartMin + 15, Math.min(1440, ds.origEndMin + deltaMin));
      ds.ghost.style.height = Math.max(15, ((newEnd - ds.origStartMin) / 60) * ds.hourHeight) + "px";
    }
    // Allday drag: position ghost relative to columns container
    if (ds.source === "allday" && ds.columnsEl) {
      const colRect = ds.columnsEl.getBoundingClientRect();
      const snappedMin = this.snapMinute(ev.clientY - colRect.top, ds.hourHeight);
      ds.ghost.style.top = Math.max(0, (snappedMin / 60) * ds.hourHeight) + "px";
      ds.ghost.style.height = ds.hourHeight + "px";
    }
    // Cross-day horizontal ghost movement in week view
    if (ds.colCount > 1 && ds.columnsRect) {
      const colWidth = ds.columnsRect.width / ds.colCount;
      const targetCol = Math.max(0, Math.min(ds.colCount - 1, Math.floor((ev.clientX - ds.columnsRect.left) / colWidth)));
      ds.ghost.style.left = (ds.ghostBaseLeft + (targetCol - ds.currentColIdx) * colWidth) + "px";
    }
    // Auto-scroll when near edges of scroll container
    if (ds.scrollContainer) {
      const scRect = ds.scrollContainer.getBoundingClientRect();
      const threshold = 50;
      const maxSpeed = 15;
      const nearTop = ev.clientY - scRect.top;
      const nearBottom = scRect.bottom - ev.clientY;
      let scrollDelta = 0;
      if (nearTop >= 0 && nearTop < threshold) {
        scrollDelta = -Math.round(maxSpeed * (1 - nearTop / threshold));
      } else if (nearBottom >= 0 && nearBottom < threshold) {
        scrollDelta = Math.round(maxSpeed * (1 - nearBottom / threshold));
      }
      if (scrollDelta !== 0) {
        if (!ds.scrollRAF) {
          const tick = () => {
            if (!this.dragState || !this.dragState.scrollContainer) return;
            this.dragState.scrollContainer.scrollTop += scrollDelta;
            ds.scrollRAF = requestAnimationFrame(tick);
          };
          ds.scrollRAF = requestAnimationFrame(tick);
        }
      } else if (ds.scrollRAF) {
        cancelAnimationFrame(ds.scrollRAF);
        ds.scrollRAF = null;
      }
    }
  }

  // T-703: Handle drag end
  private async handleDragEnd(ev: MouseEvent): Promise<void> {
    const ds = this.dragState;
    if (!ds) return;
    this.dragState = null;
    if (ds.scrollRAF) { cancelAnimationFrame(ds.scrollRAF); ds.scrollRAF = null; }
    ds.card.removeClass("dragging");
    ds.ghost.remove();
    this._lastDragMoved = true;
    setTimeout(() => { this._lastDragMoved = false; }, 0);
    if (!ds.moved) {
      // Treat as click: open detail panel
      this.detailView.clearHistory();
      this.plugin.settings.selectedTaskId = ds.taskId;
      void this.plugin.saveSettings();
      this.detailView.open(ds.taskId);
      const layout = this.containerEl.querySelector(".todo-layout");
      if (layout) layout.addClass("todo-layout-detail-open");
      return;
    }
    let newStart: number, newEnd: number;
    let finalDateStr = ds.dateStr;
    if (ds.source === "allday" && ds.columnsEl) {
      // Allday drag: calculate time from mouse position relative to columns container
      const colRect = ds.columnsEl.getBoundingClientRect();
      newStart = this.snapMinute(ev.clientY - colRect.top, ds.hourHeight);
      newStart = Math.max(0, Math.min(1425, newStart));
      newEnd = Math.min(1440, newStart + 60);
      // Determine target date (cross-day support for week view)
      if (ds.colCount > 1 && ds.columnsRect) {
        const colWidth = ds.columnsRect.width / ds.colCount;
        const targetCol = Math.max(0, Math.min(ds.colCount - 1, Math.floor((ev.clientX - ds.columnsRect.left) / colWidth)));
        if (targetCol >= 0 && targetCol < ds.dateStrs.length) {
          finalDateStr = ds.dateStrs[targetCol];
        }
      }
    } else {
      // Timeline drag: calculate time from delta
      const scrollChange = ds.scrollContainer ? (ds.scrollContainer.scrollTop - ds.origScrollTop) : 0;
      const deltaY = ev.clientY - ds.startY + scrollChange;
      const deltaMin = Math.round((deltaY / ds.hourHeight) * 60 / 15) * 15;
      if (ds.type === "move") {
        newStart = Math.max(0, Math.min(1425, ds.origStartMin + deltaMin));
        const duration = ds.origEndMin - ds.origStartMin;
        newEnd = Math.min(1440, newStart + duration);
      } else {
        newStart = ds.origStartMin;
        newEnd = Math.max(ds.origStartMin + 15, Math.min(1440, ds.origEndMin + deltaMin));
      }
      // Determine target date (cross-day support)
      if (ds.colCount > 1 && ds.columnsRect) {
        const colWidth = ds.columnsRect.width / ds.colCount;
        const targetCol = Math.max(0, Math.min(ds.colCount - 1, Math.floor((ev.clientX - ds.columnsRect.left) / colWidth)));
        if (targetCol >= 0 && targetCol < ds.dateStrs.length) {
          finalDateStr = ds.dateStrs[targetCol];
        }
      }
    }
    // Skip update if allday task dropped outside grid
    // Skip update if allday task dropped outside columns container
    if (ds.source === "allday" && ds.columnsEl) {
      const colRect = ds.columnsEl.getBoundingClientRect();
      if (ev.clientY < colRect.top || ev.clientY > colRect.bottom) {
        this.scheduleScrollTarget = "preserve";
        this.renderScheduleView();
        return;
      }
    }
    const today = localTodayStr();
    await this.plugin.taskService.update(ds.taskId, {
      startDate: this.minuteToIso(finalDateStr, newStart),
      dueDate: this.minuteToIso(finalDateStr, newEnd),
      myDayDate: finalDateStr === today ? today : null,
    });
    this.refreshDetailIfActive(ds.taskId);
      this.scheduleScrollTarget = { taskId: ds.taskId };
    this.renderScheduleView();
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
          if (this.activePlanKind === 'year' || this.activePlanKind === 'month') {
            await this.renderGoalDashboard(this.activePlanKind);
          } else {
            await this.renderPlanView(this.activePlanKind!);
          }
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

  private showTaskContextMenu(ev: MouseEvent, task: Task, currentView: "myday" | "all" | "inbox" | "trash" | "list" | "plan" | "schedule" | "review"): void {
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

    if (currentView !== 'plan') {
      menu.addItem((item) =>
        item
          .setTitle(task.myDayDate ? "从“我的一天”移除" : "添加到“我的一天”")
          .setIcon(task.myDayDate ? "calendar-minus" : "calendar-plus")
          .onClick(async () => {
            const todayStr = localTodayStr();
            if (task.myDayDate) {
              await this.plugin.taskService.update(task.id, { myDayDate: null });
            } else {
              await this.plugin.taskService.update(task.id, { myDayDate: todayStr, startDate: todayStr + "T07:00:00", dueDate: todayStr + "T23:30:00" });
            }
            await this.renderTasks(currentView);
          }),
      );
    }

    // Postpone options
    if (!task.isCompleted && task.dueDate) {
      menu.addSeparator();
      const currentDue = task.dueDate;
      const dueDateStr = extractLocalDate(currentDue);
      const baseDate = new Date(dueDateStr + "T00:00:00");
      const pad = (n: number) => String(n).padStart(2, "0");
      const formatNewDate = (d: Date) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
      const dueTimeSuffix = currentDue.substring(10);
      const hasStart = !!task.startDate;
      const startBase = hasStart ? new Date(extractLocalDate(task.startDate!) + "T00:00:00") : null;
      const startTimeSuffix = hasStart ? task.startDate!.substring(10) : "";
      const shiftDays = (base: Date, days: number) => { const d = new Date(base); d.setDate(base.getDate() + days); return d; };
      menu.addItem((item) =>
        item.setTitle("延期到明天").setIcon("calendar").onClick(async () => {
          const newDueDate = formatNewDate(shiftDays(baseDate, 1)) + dueTimeSuffix;
          const changes: Partial<Task> = { dueDate: newDueDate };
          if (hasStart && startBase) { changes.startDate = formatNewDate(shiftDays(startBase, 1)) + startTimeSuffix; }
          if (task.myDayDate && extractLocalDate(newDueDate) !== localTodayStr()) { changes.myDayDate = null; }
          await this.plugin.taskService.update(task.id, changes);
          await this.renderTasks(currentView);
        }),
      );
      menu.addItem((item) =>
        item.setTitle("延期到后天").setIcon("calendar").onClick(async () => {
          const newDueDate = formatNewDate(shiftDays(baseDate, 2)) + dueTimeSuffix;
          const changes: Partial<Task> = { dueDate: newDueDate };
          if (hasStart && startBase) { changes.startDate = formatNewDate(shiftDays(startBase, 2)) + startTimeSuffix; }
          if (task.myDayDate && extractLocalDate(newDueDate) !== localTodayStr()) { changes.myDayDate = null; }
          await this.plugin.taskService.update(task.id, changes);
          await this.renderTasks(currentView);
        }),
      );
    }


    // Move to My Day group
    if (currentView === "myday" && task.myDayDate) {
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
                allday: { startH: 7, startM: 0, endH: 23, endM: 30 },
                morning: { startH: 7, startM: 0, endH: 11, endM: 59 },
                noon: { startH: 12, startM: 0, endH: 13, endM: 59 },
                afternoon: { startH: 14, startM: 0, endH: 17, endM: 59 },
                evening: { startH: 18, startM: 0, endH: 23, endM: 30 },
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

    // 重复系列删除
    if (task.recurrenceGroupId && task.recurrence) {
      const groupInstances = this.plugin.taskService.getGroupInstances(task.recurrenceGroupId);
      const uncompletedCount = groupInstances.filter(t => !t.isCompleted).length;
      menu.addItem((item) =>
        item
          .setTitle("删除整个系列")
          .setIcon("trash")
          .onClick(async () => {
            const confirmed = await new ConfirmModal(this.app, "将删除 " + uncompletedCount + " 个未完成实例，已完成的保留。确定继续？").openAndConfirm();
            if (!confirmed) return;
            await this.plugin.taskService.deleteSeries(task.recurrenceGroupId!);
            this.closeDetailIfTarget(task.id);
            await this.renderLists();
            await this.renderTasks(currentView);
          }),
      );
    }

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

  private getReviewTitle(): string {
    const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    if (this.reviewMode === "day") {
      const d = new Date(this.reviewYear, this.reviewMonth, this.reviewDate);
      return (this.reviewMonth + 1) + "月" + this.reviewDate + "日 " + dayNames[d.getDay()];
    }
    if (this.reviewMode === "week") {
      const d = new Date(this.reviewYear, this.reviewMonth, this.reviewDate);
      const wn = getISOWeekNumber(d);
      const weekYear = d.getFullYear();
      const range = getISOWeekRange(weekYear, wn);
      const sm = range.start.getMonth() + 1;
      const sd = range.start.getDate();
      const em = range.end.getMonth() + 1;
      const ed = range.end.getDate();
      return weekYear + "年第" + wn + "周 (" + sm + "." + sd + " - " + em + "." + ed + ")";
    }
    if (this.reviewMode === "month") {
      return this.reviewYear + "年 " + (this.reviewMonth + 1) + "月";
    }
    return this.reviewYear + "年";
  }

  private normalizeReviewDate(): void {
    const d = new Date(this.reviewYear, this.reviewMonth, this.reviewDate);
    this.reviewYear = d.getFullYear();
    this.reviewMonth = d.getMonth();
    this.reviewDate = d.getDate();
  }

  private reviewDateToStr(): string {
    return this.reviewYear + "-" + String(this.reviewMonth + 1).padStart(2, "0") + "-" + String(this.reviewDate).padStart(2, "0");
  }

  private renderReviewView(): void {
    const container = this.taskListEl;
    container.empty();
    const wrap = container.createDiv({ cls: "todo-review-container" });

    const header = wrap.createDiv({ cls: "todo-review-header" });
    const nav = header.createDiv({ cls: "todo-review-nav" });
    const prevBtn = nav.createEl("button", { cls: "todo-review-prev", text: "◀" });
    const titleEl = nav.createSpan({ cls: "todo-review-title", text: this.getReviewTitle() });
    const nextBtn = nav.createEl("button", { cls: "todo-review-next", text: "▶" });
    const todayBtn = nav.createEl("button", { cls: "todo-review-today-btn", text: "今天" });

    const updateView = () => {
      titleEl.textContent = this.getReviewTitle();
      this.renderReviewContent(contentEl);
    };

    prevBtn.addEventListener("click", () => {
      if (this.reviewMode === "day") { this.reviewDate--; this.normalizeReviewDate(); }
      else if (this.reviewMode === "week") { this.reviewDate -= 7; this.normalizeReviewDate(); }
      else if (this.reviewMode === "month") { this.reviewMonth--; if (this.reviewMonth < 0) { this.reviewMonth = 11; this.reviewYear--; } }
      else { this.reviewYear--; }
      updateView();
    });
    nextBtn.addEventListener("click", () => {
      if (this.reviewMode === "day") { this.reviewDate++; this.normalizeReviewDate(); }
      else if (this.reviewMode === "week") { this.reviewDate += 7; this.normalizeReviewDate(); }
      else if (this.reviewMode === "month") { this.reviewMonth++; if (this.reviewMonth > 11) { this.reviewMonth = 0; this.reviewYear++; } }
      else { this.reviewYear++; }
      updateView();
    });
    todayBtn.addEventListener("click", () => {
      const now = new Date();
      this.reviewYear = now.getFullYear();
      this.reviewMonth = now.getMonth();
      this.reviewDate = now.getDate();
      updateView();
    });

    const switchEl = header.createDiv({ cls: "todo-review-mode-switch" });
    const modes = ["day", "week", "month", "year"] as const;
    const modeLabels: Record<string, string> = { day: "日", week: "周", month: "月", year: "年" };
    for (const m of modes) {
      const btn = switchEl.createSpan({
        cls: "todo-review-mode-btn" + (m === this.reviewMode ? " active" : ""),
        text: modeLabels[m],
      });
      btn.addEventListener("click", async () => {
        this.reviewMode = m;
        this.plugin.settings.activeReviewMode = m;
        await this.plugin.saveSettings();
        switchEl.querySelectorAll(".todo-review-mode-btn").forEach((el) => el.removeClass("active"));
        btn.addClass("active");
        titleEl.textContent = this.getReviewTitle();
        this.renderReviewContent(contentEl);
      });
    }

    const contentEl = wrap.createDiv({ cls: "todo-review-content" });
    this.renderReviewContent(contentEl);
  }

  private renderReviewContent(container: HTMLDivElement): void {
    container.empty();
    const modeLabels: Record<string, string> = { day: "日", week: "周", month: "月", year: "年" };
    switch (this.reviewMode) {
      case "day":
        this.renderDayReview(container);
        break;
      case "week":
        this.renderWeekReview(container);
        break;
      case "month":
        this.renderMonthReview(container);
        break;
      case "year":
        this.renderYearReview(container);
        break;
    }
  }


  private renderQuadrantDist(container: HTMLElement, tasks: Task[]): void {
    const quadrantColors: Record<string, string> = {
      "重要紧急": "#BC6F67", "重要不紧急": "#6D91B6",
      "不重要紧急": "#C19957", "不重要不紧急": "#9AA1A1",
    };
    const allTags = this.plugin.tagService.getAll();
    const quadrantTags = allTags.filter(t => t.sortOrder < 4);
    const qGroups = new Map<string, { total: number; completed: number; color: string }>();
    for (const tag of quadrantTags) { qGroups.set(tag.name, { total: 0, completed: 0, color: quadrantColors[tag.name] || "#71747A" }); }
    qGroups.set("未分类", { total: 0, completed: 0, color: "#71747A" });
    for (const task of tasks) {
      const qTag = task.tags.find(tid => { const tag = this.plugin.tagService.getById(tid); return tag && tag.sortOrder < 4; });
      const qName = qTag ? (this.plugin.tagService.getById(qTag)?.name ?? "未分类") : "未分类";
      const g = qGroups.get(qName)!;
      g.total++;
      if (task.isCompleted) g.completed++;
    }
    const qDataFixed = Array.from(qGroups.entries()).map(([name, v]) => ({ label: name, total: v.total, completed: v.completed, color: v.color }));
    const qSection = container.createDiv({ cls: "todo-review-section" });
    qSection.createDiv({ cls: "todo-review-section-title", text: "四象限分布" });
    renderDistributionBar(qSection, qDataFixed);
  }

  private renderDomainDist(container: HTMLElement, tasks: Task[]): void {
    const allTags = this.plugin.tagService.getAll();
    const domainTags = allTags.filter(t => t.sortOrder >= 4);
    const dGroups = new Map<string, { total: number; completed: number; color: string }>();
    for (const tag of domainTags) { dGroups.set(tag.name, { total: 0, completed: 0, color: tag.color }); }
    dGroups.set("未分类", { total: 0, completed: 0, color: "#71747A" });
    for (const task of tasks) {
      const dTag = task.tags.find(tid => { const tag = this.plugin.tagService.getById(tid); return tag && tag.sortOrder >= 4; });
      const dName = dTag ? (this.plugin.tagService.getById(dTag)?.name ?? "未分类") : "未分类";
      const g = dGroups.get(dName)!;
      g.total++;
      if (task.isCompleted) g.completed++;
    }
    const dDataFixed = Array.from(dGroups.entries()).map(([name, v]) => ({ label: name, total: v.total, completed: v.completed, color: v.color }));
    const dSection = container.createDiv({ cls: "todo-review-section" });
    dSection.createDiv({ cls: "todo-review-section-title", text: "领域分布" });
    renderDistributionBar(dSection, dDataFixed);
  }

  private renderDayReview(container: HTMLDivElement): void {
    const dateStr = this.reviewDateToStr();
    const stats = this.plugin.statsService.getDayStats(dateStr);

    const todayDueCount = this.plugin.taskService.getAll().filter(t => t.dueDate && extractLocalDate(t.dueDate) === dateStr).length;
    const statsRow = container.createDiv({ cls: "todo-review-stats-row" });
    renderStatCard(statsRow, "今日任务", String(todayDueCount), "calendar-check", "#6D91B6", () => this.navigateWithFilter({ type: "date", value: dateStr, label: dateStr + " 到期任务", dateField: "dueDate" }));
    renderStatCard(statsRow, "今日完成", String(stats.completedCount), "check-circle-2", "#41B974", () => this.navigateWithFilter({ type: "date", value: dateStr, label: dateStr + " 完成任务", dateField: "completedAt" }));
    renderStatCard(statsRow, "完成率", Math.round(stats.completionRate * 100) + "%", "bar-chart-2", "#91719E");
    const yesterday = new Date(this.reviewYear, this.reviewMonth, this.reviewDate - 1);
    const yesterdayStr = yesterday.getFullYear() + "-" + String(yesterday.getMonth() + 1).padStart(2, "0") + "-" + String(yesterday.getDate()).padStart(2, "0");
    const yesterdayOverdue = this.plugin.taskService.getAll().filter(t => !t.isCompleted && t.dueDate && extractLocalDate(t.dueDate) === yesterdayStr).length;
    renderStatCard(statsRow, "昨日逾期", String(yesterdayOverdue), "alert-triangle", "#BC6F67", () => this.navigateWithFilter({ type: "date", value: yesterdayStr, label: yesterdayStr + " 逾期任务", dateField: "dueDate" }));

    // 今日任务按象限分组
    const todayTasks = this.plugin.taskService.getAll().filter(t => t.dueDate && extractLocalDate(t.dueDate) === dateStr);
    this.renderQuadrantDist(container, todayTasks);

    this.renderDomainDist(container, todayTasks);
  }

  private renderWeekReview(container: HTMLDivElement): void {
    const d = new Date(this.reviewYear, this.reviewMonth, this.reviewDate);
    const weekYear = d.getFullYear();
    const wn = getISOWeekNumber(d);
    const range = getISOWeekRange(weekYear, wn);
    const startStr = range.start.getFullYear() + "-" + String(range.start.getMonth() + 1).padStart(2, "0") + "-" + String(range.start.getDate()).padStart(2, "0");
    const endStr = range.end.getFullYear() + "-" + String(range.end.getMonth() + 1).padStart(2, "0") + "-" + String(range.end.getDate()).padStart(2, "0");

    const stats = this.plugin.statsService.getWeekStats(weekYear, wn);

    // 概览卡片
    const weekDueCount = this.plugin.taskService.getAll().filter(t => t.dueDate && !t.isCompleted && extractLocalDate(t.dueDate) >= startStr && extractLocalDate(t.dueDate) <= endStr).length;
    const weekTotalCount = stats.completedCount + weekDueCount;
    const statsRow = container.createDiv({ cls: "todo-review-stats-row" });
    renderStatCard(statsRow, "本周任务", String(weekTotalCount), "calendar-check", "#6D91B6", () => this.navigateWithFilter({ type: "date", value: startStr, label: "本周到期任务", dateField: "dueDate" }));
    renderStatCard(statsRow, "本周完成", String(stats.completedCount), "check-circle-2", "#41B974", () => this.navigateWithFilter({ type: "date", value: startStr, label: "本周完成任务", dateField: "completedAt" }));
    const denom = stats.completedCount + weekDueCount;
    const weekRate = denom > 0 ? Math.round(stats.completedCount / denom * 100) : 0;
    renderStatCard(statsRow, "完成率", weekRate + "%", "bar-chart-2", "#91719E");
    const today = new Date();
    const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    const weekOverdue = this.plugin.taskService.getAll().filter(t => !t.isCompleted && t.dueDate && extractLocalDate(t.dueDate) < todayStr && extractLocalDate(t.dueDate) >= startStr && extractLocalDate(t.dueDate) <= endStr).length;
    renderStatCard(statsRow, "逾期任务", String(weekOverdue), "alert-triangle", "#BC6F67", () => this.navigateWithFilter({ type: "overdue", value: "", label: "逾期任务" }));

    // 每日完成趋势堆叠柱状图
    const dayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    const stackedData = stats.dailyTrend.map((item: { date: string; count: number; rate: number; uncompleted: number }, i: number) => ({
      label: dayLabels[i] || item.date,
      segments: [
        { value: item.uncompleted, color: "#C8C8C8", label: "未完成" },
        { value: item.count, color: "#41B974", label: "完成" },
      ],
    }));
    const trendSection = container.createDiv({ cls: "todo-review-section" });
    trendSection.createDiv({ cls: "todo-review-section-title", text: "每日任务趋势" });
    renderStackedBarChart(trendSection, stackedData);

    const allTasks = this.plugin.taskService.getAll();
    const weekTasks = allTasks.filter(t => t.dueDate && extractLocalDate(t.dueDate) >= startStr && extractLocalDate(t.dueDate) <= endStr);
    this.renderQuadrantDist(container, weekTasks);

    this.renderDomainDist(container, weekTasks);
  }
  private renderMonthReview(container: HTMLDivElement): void {
    const year = this.reviewYear;
    const month = this.reviewMonth;
    const stats = this.plugin.statsService.getMonthStats(year, month);

    // 本月日期范围
    const startStr = year + "-" + String(month + 1).padStart(2, "0") + "-01";
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const endStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(daysInMonth).padStart(2, "0");

    // 概览卡片
    const allTasks = this.plugin.taskService.getAll();
    const monthDueCount = allTasks.filter(t => t.dueDate && !t.isCompleted && extractLocalDate(t.dueDate) >= startStr && extractLocalDate(t.dueDate) <= endStr).length;
    const monthTotalCount = stats.completedCount + monthDueCount;
    const statsRow = container.createDiv({ cls: "todo-review-stats-row" });
    renderStatCard(statsRow, "本月任务", String(monthTotalCount), "calendar-check", "#6D91B6", () => this.navigateWithFilter({ type: "date", value: startStr, label: "本月到期任务", dateField: "dueDate" }));
    renderStatCard(statsRow, "本月完成", String(stats.completedCount), "check-circle-2", "#41B974", () => this.navigateWithFilter({ type: "date", value: startStr, label: "本月完成任务", dateField: "completedAt" }));
    const denom = stats.completedCount + monthDueCount;
    const monthRate = denom > 0 ? Math.round(stats.completedCount / denom * 100) : 0;
    renderStatCard(statsRow, "完成率", monthRate + "%", "bar-chart-2", "#91719E");
    const today = new Date();
    const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    const monthOverdue = allTasks.filter(t => !t.isCompleted && t.dueDate && extractLocalDate(t.dueDate) < todayStr && extractLocalDate(t.dueDate) >= startStr && extractLocalDate(t.dueDate) <= endStr).length;
    renderStatCard(statsRow, "逾期任务", String(monthOverdue), "alert-triangle", "#BC6F67", () => this.navigateWithFilter({ type: "overdue", value: "", label: "逾期任务" }));

    // 月历热力图
    const calSection = container.createDiv({ cls: "todo-review-section" });
    calSection.createDiv({ cls: "todo-review-section-title", text: "月度打卡" });
    renderMonthCalendar(calSection, year, month, stats.dailyTrend.map((d: { date: string; count: number }) => ({ date: d.date, count: d.count })));

    // 每周任务趋势堆叠柱状图
    const weekCompletedMap = new Map<string, number>();
    const weekUncompletedMap = new Map<string, number>();
    for (const d of stats.dailyTrend) {
      const dateObj = new Date(d.date + "T00:00:00");
      const wy = getISOWeekNumber(dateObj);
      const key = "第" + wy + "周";
      weekCompletedMap.set(key, (weekCompletedMap.get(key) || 0) + d.count);
      weekUncompletedMap.set(key, (weekUncompletedMap.get(key) || 0) + d.uncompleted);
    }
    const weekStackedData = Array.from(weekCompletedMap.keys()).sort().map(key => ({
      label: key,
      segments: [
        { value: weekUncompletedMap.get(key) || 0, color: "#C8C8C8", label: "未完成" },
        { value: weekCompletedMap.get(key) || 0, color: "#41B974", label: "完成" },
      ],
    }));
    if (weekStackedData.length > 0) {
      const weekSection = container.createDiv({ cls: "todo-review-section" });
      weekSection.createDiv({ cls: "todo-review-section-title", text: "每周任务趋势" });
      renderStackedBarChart(weekSection, weekStackedData);
    }

    const monthTasks = allTasks.filter(t => t.dueDate && extractLocalDate(t.dueDate) >= startStr && extractLocalDate(t.dueDate) <= endStr);
    this.renderQuadrantDist(container, monthTasks);

    this.renderDomainDist(container, monthTasks);
  }

  private renderYearReview(container: HTMLDivElement): void {
    const year = this.reviewYear;
    const stats = this.plugin.statsService.getYearStats(year);

    const startStr = year + "-01-01";
    const endStr = year + "-12-31";

    // 概览卡片
    const allTasks = this.plugin.taskService.getAll();
    const yearDueCount = allTasks.filter(t => t.dueDate && !t.isCompleted && extractLocalDate(t.dueDate) >= startStr && extractLocalDate(t.dueDate) <= endStr).length;
    const yearTotalCount = stats.completedCount + yearDueCount;
    const statsRow = container.createDiv({ cls: "todo-review-stats-row" });
    renderStatCard(statsRow, "本年任务", String(yearTotalCount), "calendar-check", "#6D91B6", () => this.navigateWithFilter({ type: "date", value: startStr, label: "本年到期任务", dateField: "dueDate" }));
    renderStatCard(statsRow, "本年完成", String(stats.completedCount), "check-circle-2", "#41B974", () => this.navigateWithFilter({ type: "date", value: startStr, label: "本年完成任务", dateField: "completedAt" }));
    const denom = stats.completedCount + yearDueCount;
    const yearRate = denom > 0 ? Math.round(stats.completedCount / denom * 100) : 0;
    renderStatCard(statsRow, "完成率", yearRate + "%", "bar-chart-2", "#91719E");
    const today = new Date();
    const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    const yearOverdue = allTasks.filter(t => !t.isCompleted && t.dueDate && extractLocalDate(t.dueDate) < todayStr && extractLocalDate(t.dueDate) >= startStr && extractLocalDate(t.dueDate) <= endStr).length;
    renderStatCard(statsRow, "逾期任务", String(yearOverdue), "alert-triangle", "#BC6F67", () => this.navigateWithFilter({ type: "overdue", value: "", label: "逾期任务" }));

    // GitHub 风格年热力图
    const heatSection = container.createDiv({ cls: "todo-review-section" });
    heatSection.createDiv({ cls: "todo-review-section-title", text: "年度打卡" });
    renderYearHeatmap(heatSection, year, stats.dailyTrend.map((d: { date: string; count: number }) => ({ date: d.date, count: d.count })));

    // 每月任务趋势堆叠柱状图
    const monthCompletedMap = new Map<string, number>();
    const monthUncompletedMap = new Map<string, number>();
    for (const d of stats.dailyTrend) {
      const m = d.date.substring(5, 7);
      const key = parseInt(m, 10) + "月";
      monthCompletedMap.set(key, (monthCompletedMap.get(key) || 0) + d.count);
      monthUncompletedMap.set(key, (monthUncompletedMap.get(key) || 0) + d.uncompleted);
    }
    const monthStackedData: { label: string; segments: { value: number; color: string; label: string }[] }[] = [];
    for (let m = 1; m <= 12; m++) {
      const key = m + "月";
      monthStackedData.push({
        label: key,
        segments: [
          { value: monthUncompletedMap.get(key) || 0, color: "#C8C8C8", label: "未完成" },
          { value: monthCompletedMap.get(key) || 0, color: "#41B974", label: "完成" },
        ],
      });
    }
    const monthSection = container.createDiv({ cls: "todo-review-section" });
    monthSection.createDiv({ cls: "todo-review-section-title", text: "每月任务趋势" });
    renderStackedBarChart(monthSection, monthStackedData);

    const yearTasks = allTasks.filter(t => t.dueDate && extractLocalDate(t.dueDate) >= startStr && extractLocalDate(t.dueDate) <= endStr);
    this.renderQuadrantDist(container, yearTasks);

    this.renderDomainDist(container, yearTasks);
  }
}
