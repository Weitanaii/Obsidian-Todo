import { ItemView, WorkspaceLeaf } from "obsidian";
import type ObsidianTodoPlugin from "../../main";

export const VIEW_TYPE_TODO_DETAIL = "obsidian-todo-detail";

/** Hosts the same task/AI detail UI in Obsidian's mobile right sidebar. */
export class TodoDetailSidebarView extends ItemView {
  private plugin: ObsidianTodoPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: ObsidianTodoPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_TODO_DETAIL; }
  getDisplayText(): string { return "Todo Detail"; }
  getIcon(): string { return "check-square"; }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("todo-detail-sidebar-host", "todo-detail");
    this.plugin.todoView?.attachMobileDetailRoot(this.contentEl);
  }

  async onClose(): Promise<void> {
    this.plugin.todoView?.detachMobileDetailRoot(this.contentEl);
    this.contentEl.removeClass("todo-detail-sidebar-host", "todo-detail");
    this.contentEl.empty();
  }
}
