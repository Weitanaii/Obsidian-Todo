import { App, ItemView, Modal, setIcon, WorkspaceLeaf } from "obsidian";
import type ObsidianTodoPlugin from "../../main";
import type { ViewNav } from "./TodoView";
import type { PlanKind } from "../models/Task";

export const VIEW_TYPE_TODO_NAV = "obsidian-todo-nav";

export class TodoNavView extends ItemView {
  private plugin: ObsidianTodoPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: ObsidianTodoPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_TODO_NAV; }
  getDisplayText(): string { return "Todo"; }
  getIcon(): string { return "check-square"; }

  async onOpen(): Promise<void> {
    await this.renderNav();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  private collapseSidebar(): void {
    // On mobile, collapse the left sidebar after nav action
    if (window.innerWidth <= 600) {
      const ws = this.app.workspace as any;
      if (ws.leftSplit && typeof ws.leftSplit.collapse === "function") {
        ws.leftSplit.collapse();
      }
    }
  }

  async renderNav(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("todo-sidebar-nav");

    const activeNav = this.plugin.settings.activeViewNav;
    const selectedListId = this.plugin.settings.selectedListId;

    const views: { key: ViewNav; label: string; icon: string }[] = [
      { key: "myday", label: "\u6211\u7684\u4e00\u5929", icon: "sun" },
      { key: "all", label: "\u6240\u6709\u4efb\u52a1", icon: "list-checks" },
      { key: "inbox", label: "\u4efb\u52a1", icon: "inbox" },
      { key: "schedule", label: "\u6211\u7684\u65e5\u7a0b", icon: "calendar" },
    ];
    for (const v of views) {
      const item = this.contentEl.createDiv({ cls: "todo-nav-item" + (!selectedListId && activeNav === v.key ? " active" : "") });
      const iconEl = item.createSpan({ cls: "todo-nav-icon" });
      setIcon(iconEl, v.icon);
      item.createSpan({ text: v.label });
      item.addEventListener("click", async () => {
        if (this.plugin.activateNav) await this.plugin.activateNav(v.key);
        this.collapseSidebar();
        await this.renderNav();
      });
    }

    // Plan group
    const planGroup = this.contentEl.createDiv({ cls: "todo-nav-group" });
    const planHeader = planGroup.createDiv({ cls: "todo-nav-group-header" });
    const planIcon = planHeader.createSpan();
    setIcon(planIcon, "calendar-days");
    planHeader.createSpan({ cls: "todo-nav-group-name", text: "\u6211\u7684\u8ba1\u5212" });
    const planList = planGroup.createDiv({ cls: "todo-nav-group-list" });
    if (this.plugin.settings.planGroupCollapsed) planList.style.display = "none";

    const planItems: { name: string; kind: PlanKind; icon: string }[] = [
      { name: "\u4eba\u751f\u8ba1\u5212", kind: "life", icon: "globe" },
      { name: "\u5e74\u5ea6\u8ba1\u5212", kind: "year", icon: "calendar-check" },
      { name: "\u6708\u5ea6\u8ba1\u5212", kind: "month", icon: "timer" },
    ];
    for (const pi of planItems) {
      const item = planList.createDiv({ cls: "todo-nav-item todo-plan-item" });
      const piIcon = item.createSpan({ cls: "todo-nav-icon" });
      setIcon(piIcon, pi.icon);
      item.createSpan({ text: pi.name });
      item.addEventListener("click", async () => {
        if (this.plugin.activatePlan) await this.plugin.activatePlan(pi.kind);
        this.collapseSidebar();
        await this.renderNav();
      });
    }
    planHeader.addEventListener("click", () => {
      this.plugin.settings.planGroupCollapsed = !this.plugin.settings.planGroupCollapsed;
      planList.style.display = this.plugin.settings.planGroupCollapsed ? "none" : "";
      void this.plugin.saveSettings();
    });

    // Quadrant group
    const qGroup = this.contentEl.createDiv({ cls: "todo-nav-group" });
    const qHeader = qGroup.createDiv({ cls: "todo-nav-group-header" });
    const qIcon = qHeader.createSpan();
    setIcon(qIcon, "layout-grid");
    qHeader.createSpan({ cls: "todo-nav-group-name", text: "\u56db\u8c61\u9650" });
    const qList = qGroup.createDiv({ cls: "todo-nav-group-list" });
    if (this.plugin.settings.quadrantGroupCollapsed) qList.style.display = "none";

    const quadrantDefs = [
      { key: "\u91cd\u8981\u7d27\u6025", icon: "alarm-clock" },
      { key: "\u91cd\u8981\u4e0d\u7d27\u6025", icon: "calendar-check" },
      { key: "\u4e0d\u91cd\u8981\u7d27\u6025", icon: "bell" },
      { key: "\u4e0d\u91cd\u8981\u4e0d\u7d27\u6025", icon: "coffee" },
    ];
    for (const qd of quadrantDefs) {
      const qItem = qList.createDiv({ cls: "todo-nav-item todo-quadrant-item" + (this.plugin.settings.selectedQuadrant === qd.key ? " active" : "") });
      const qdIcon = qItem.createSpan({ cls: "todo-nav-icon" });
      setIcon(qdIcon, qd.icon);
      qItem.createSpan({ text: qd.key });
      qItem.addEventListener("click", async () => {
        this.plugin.settings.selectedQuadrant = qd.key;
        this.plugin.settings.activeViewNav = "all";
        this.plugin.settings.selectedListId = null;
        await this.plugin.saveSettings();
        if (this.plugin.activateNav) await this.plugin.activateNav("all");
        this.collapseSidebar();
        await this.renderNav();
      });
    }
    qHeader.addEventListener("click", () => {
      this.plugin.settings.quadrantGroupCollapsed = !this.plugin.settings.quadrantGroupCollapsed;
      qList.style.display = this.plugin.settings.quadrantGroupCollapsed ? "none" : "";
      void this.plugin.saveSettings();
    });

    // Lists separator
    this.contentEl.createDiv({ cls: "todo-sidebar-nav-sep" });
    // Lists
    const listSection = this.contentEl.createDiv({ cls: "todo-nav-section" });
    const lists = this.plugin.listService.getActive().filter((l: any) => !l.isDefault);
    const groups = this.plugin.groupService.getAll();
    const ungrouped = lists.filter((l: any) => !l.groupId);
    const grouped = new Map<string, typeof lists>();
    for (const l of lists) {
      if (l.groupId) {
        if (!grouped.has(l.groupId)) grouped.set(l.groupId, []);
        grouped.get(l.groupId)!.push(l);
      }
    }
    for (const g of groups) {
      const gLists = grouped.get(g.id) || [];
      if (gLists.length === 0) continue;
      const gEl = listSection.createDiv({ cls: "todo-nav-group" });
      const gHeader = gEl.createDiv({ cls: "todo-nav-group-header" });
      const arrow = gHeader.createSpan({ cls: "todo-nav-group-arrow" + (g.isCollapsed ? " collapsed" : ""), text: "\u25bc" });
      gHeader.createSpan({ cls: "todo-nav-group-name", text: g.name });
      const gList = gEl.createDiv({ cls: "todo-nav-group-list" });
      if (g.isCollapsed) gList.style.display = "none";
      for (const l of gLists) {
        const lItem = gList.createDiv({ cls: "todo-nav-item" + (selectedListId === l.id ? " active" : ""), attr: { "data-list-id": l.id } });
        const lIcon = lItem.createSpan({ cls: "todo-nav-icon" });
        setIcon(lIcon, l.icon || "list");
        lItem.createSpan({ text: l.name });
        lItem.addEventListener("click", async () => {
          if (this.plugin.activateList) await this.plugin.activateList(l.id);
          await this.renderNav();
        });
      }
      gHeader.addEventListener("click", async () => {
        await this.plugin.groupService.toggleCollapse(g.id);
        g.isCollapsed = !g.isCollapsed;
        gList.style.display = g.isCollapsed ? "none" : "";
        arrow.toggleClass("collapsed", g.isCollapsed);
      });
    }
    for (const l of ungrouped) {
      const lItem = listSection.createDiv({ cls: "todo-nav-item" + (selectedListId === l.id ? " active" : ""), attr: { "data-list-id": l.id } });
      const lIcon = lItem.createSpan({ cls: "todo-nav-icon" });
      setIcon(lIcon, l.icon || "list");
      lItem.createSpan({ text: l.name });
      lItem.addEventListener("click", async () => {
        if (this.plugin.activateList) await this.plugin.activateList(l.id);
        this.collapseSidebar();
        await this.renderNav();
      });
    }

    // Add list button
    const addBtn = listSection.createDiv({ cls: "todo-nav-item todo-nav-add" });
    addBtn.createSpan({ text: "+ \u65b0\u5efa\u5217\u8868" });
    addBtn.addEventListener("click", async () => {
      const prompt = new PromptModal(this.app, "\u8f93\u5165\u5217\u8868\u540d\u79f0");
      const name = await prompt.openAndGetValue();
      if (name) {
        await this.plugin.listService.create({ name });
        await this.renderNav();
      }
    });
  }
}

class PromptModal extends Modal {
  private promptText: string;
  private resolve!: (value: string | null) => void;
  private value = "";
  constructor(app: App, promptText: string) { super(app); this.promptText = promptText; }
  onOpen(): void {
    this.contentEl.createEl("p", { text: this.promptText });
    const input = this.contentEl.createEl("input") as HTMLInputElement;
    input.placeholder = this.promptText;
    input.addEventListener("input", () => { this.value = input.value; });
    input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { this.resolve(input.value.trim()); this.close(); } });
    const actions = this.contentEl.createDiv({ cls: "todo-prompt-actions" });
    actions.createEl("button", { text: "\u53d6\u6d88" }).addEventListener("click", () => { this.resolve(null); this.close(); });
    actions.createEl("button", { text: "\u786e\u5b9a", cls: "mod-cta" }).addEventListener("click", () => { this.resolve(input.value.trim()); this.close(); });
    window.setTimeout(() => input.focus(), 30);
  }
  onClose(): void { this.contentEl.empty(); }
  async openAndGetValue(): Promise<string | null> { return new Promise<string | null>((resolve) => { this.resolve = resolve; this.open(); }); }
}