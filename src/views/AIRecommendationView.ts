import { setIcon } from "obsidian";
import type { TodoPluginLike } from "./TodoView";
import type { AIRecommendation } from "../services/AIRecommendationService";
import { t } from "../i18n";

export class AIRecommendationView {
  private plugin: TodoPluginLike;
  private root: HTMLElement;
  private onClose?: () => void;

  constructor(plugin: TodoPluginLike, root: HTMLElement, onClose?: () => void) {
    this.plugin = plugin;
    this.root = root;
    this.onClose = onClose;
  }

  open(items: AIRecommendation[], onRefresh: () => Promise<void>, onAccept: (item: AIRecommendation) => Promise<void>): void {
    this.root.empty();
    this.root.addClass("todo-detail-active", "todo-ai-detail-panel");
    const header = this.root.createDiv({ cls: "todo-detail-header" });
    const closeBtn = header.createEl("button", { cls: "todo-detail-close" });
    setIcon(closeBtn, "x");
    closeBtn.setAttribute("aria-label", t("关闭"));
    closeBtn.setAttribute("title", t("关闭"));
    closeBtn.addEventListener("click", () => this.close());

    const list = this.root.createDiv({ cls: "todo-detail-ai-list" });
    if (!items.length) {
      list.createDiv({ cls: "todo-detail-empty-title", text: t("暂无新的推荐任务") });
    } else {
      for (const item of items) this.renderCard(list, item, items, onAccept);
    }

    const bottom = this.root.createDiv({ cls: "todo-detail-bottom todo-ai-refresh-bar" });
    const refresh = bottom.createDiv({ cls: "todo-detail-delete todo-ai-refresh-button" });
    setIcon(refresh, "refresh-cw");
    refresh.title = t("刷新推荐");
    refresh.setAttribute("aria-label", t("刷新推荐"));
    refresh.addEventListener("click", async () => {
      refresh.toggleClass("is-loading", true);
      try { await onRefresh(); } finally { refresh.toggleClass("is-loading", false); }
    });
  }

  close(): void {
    this.root.empty();
    this.root.removeClass("todo-detail-active", "todo-ai-detail-panel");
    this.onClose?.();
  }

  private renderCard(container: HTMLElement, item: AIRecommendation, items: AIRecommendation[], onAccept: (item: AIRecommendation) => Promise<void>): void {
    const card = container.createDiv({ cls: "todo-ai-card" });
    const body = card.createDiv({ cls: "todo-ai-card-content" });
    const head = body.createDiv({ cls: "todo-ai-card-head" });
    head.createDiv({ cls: "todo-ai-card-title", text: item.title });
    if (item.isImportant) head.createSpan({ cls: "todo-ai-important", text: "★" });
    const meta = body.createDiv({ cls: "todo-ai-card-meta" });
    meta.createSpan({ text: `${t("预计时间")} ${item.durationMinutes} min` });
    if (item.myDayDate) meta.createSpan({ text: ` · ${item.myDayDate}` });
    if (item.myDayGroup) meta.createSpan({ text: ` · ${t(item.myDayGroup === "morning" ? "早上" : item.myDayGroup === "afternoon" ? "下午" : item.myDayGroup === "evening" ? "晚上" : "全天")}` });
    if (item.planPeriodKey) meta.createSpan({ text: ` · ${item.planPeriodKey}` });
    if (item.weekStart && item.weekEnd) meta.createDiv({ text: `${item.weekStart} ~ ${item.weekEnd}` });
    if (item.note) body.createDiv({ cls: "todo-ai-card-note", text: item.note });
    if (item.tags.length) {
      const names = item.tags.map((id) => this.plugin.tagService.getById(id)?.name ?? id);
      body.createDiv({ cls: "todo-ai-card-tags", text: `${t("标签")}：${names.join(", ")}` });
    }
    if (item.parentId) {
      const parent = this.plugin.taskService.getAll().find((task) => task.id === item.parentId);
      if (parent) body.createDiv({ cls: "todo-ai-card-parent", text: `${t("父任务")}：${parent.title}` });
    }
    if (item.reason) body.createDiv({ cls: "todo-ai-card-reason", text: t(item.reason) });
    if (item.warning) body.createDiv({ cls: "todo-ai-card-warning", text: t(item.warning) });
    const controls = card.createDiv({ cls: "todo-ai-card-controls" });
    const accept = controls.createEl("button", { cls: "todo-ai-card-action" });
    setIcon(accept, "plus"); accept.title = t("加入"); accept.setAttribute("aria-label", t("加入"));
    accept.addEventListener("click", async () => { accept.disabled = true; await onAccept(item); card.remove(); });
    const dismiss = controls.createEl("button", { cls: "todo-ai-card-action" });
    setIcon(dismiss, "x"); dismiss.title = t("移除推荐"); dismiss.setAttribute("aria-label", t("移除推荐"));
    dismiss.addEventListener("click", () => { const index = items.indexOf(item); if (index >= 0) items.splice(index, 1); card.remove(); });
  }
}
