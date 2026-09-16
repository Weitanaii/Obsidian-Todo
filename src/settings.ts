import { App, Modal, Notice, PluginSettingTab, setIcon, Setting } from "obsidian";
import type ObsidianTodoPlugin from "../main";
import type { ViewNav } from "./views/TodoView";
import type { PlanKind } from "./models/Task";
import { logger, LogLevel } from "./utils/logger";
import type { SortConfig } from "./utils/sort";

export interface ObsidianTodoSettings {
  todoFolder: string;
  defaultListName: string;
  logLevel: string;
  activeViewNav: ViewNav;
  selectedListId: string | null;
  completedCollapsed: boolean;
  overdueCollapsed: boolean;
  selectedTaskId: string | null;
  selectedQuadrant: string | null;
  activePlanKind: PlanKind | null;
  sortConfig: SortConfig;
  birthday: string;
  planGroupCollapsed: boolean;
  quadrantGroupCollapsed: boolean;
  activeScheduleMode: "day" | "week" | "month";
  activeReviewMode: "day" | "week" | "month" | "year";
}

export const DEFAULT_SETTINGS: ObsidianTodoSettings = {
  todoFolder: "todo",
  defaultListName: "Tasks",
  logLevel: "INFO",
  activeViewNav: "myday",
  selectedListId: null,
  completedCollapsed: true,
  overdueCollapsed: true,
  selectedTaskId: null,
  sortConfig: {
    primary: { field: "importance", direction: "desc" },
    secondary: { field: "createdAt", direction: "desc" },
  },
  selectedQuadrant: null,
  activePlanKind: null,
  birthday: "",
  planGroupCollapsed: true,
  quadrantGroupCollapsed: true,
  activeScheduleMode: "month",
  activeReviewMode: "day",
};

const ICON_OPTIONS = [
  "book", "book-open", "library", "book-marked", "newspaper",
  "film", "clapperboard", "video", "tv", "popcorn",
  "music", "headphones", "mic", "radio", "disc-3",
  "map-pin", "map", "globe", "compass", "plane",
  "shopping-cart", "shopping-basket", "shopping-bag", "store",
  "tag", "utensils", "chef-hat", "cooking-pot", "coffee", "cake",
  "home", "sofa", "bed", "lamp", "washing-machine",
  "heart-pulse", "activity", "stethoscope", "pill", "hospital",
  "dumbbell", "footprints", "bike", "timer", "trophy",
  "briefcase", "building-2", "clipboard-list", "kanban", "list-checks",
  "piggy-bank", "banknote", "coins", "calculator", "receipt",
  "users", "user-round", "heart-handshake", "message-circle", "phone",
  "repeat", "calendar-check", "check-check", "circle-check", "alarm-clock",
];

export class ObsidianTodoSettingTab extends PluginSettingTab {
  plugin: ObsidianTodoPlugin;

  constructor(app: App, plugin: ObsidianTodoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // --- Header ---
    const head = containerEl.createDiv("todo-settings-head");
    head.createDiv({ cls: "todo-settings-title", text: "Obsidian Todo" });
    head.createDiv({ cls: "todo-settings-sub", text: "任务管理插件设置" });

    // --- Basic Settings ---
    this.settingGroup(containerEl, "基本设置", "插件核心配置", (group) => {
      new Setting(group)
        .setName("数据存储文件夹")
        .setDesc("任务数据文件存储在 Vault 中的文件夹路径")
        .addText((text) =>
          text
            .setPlaceholder("todo")
            .setValue(this.plugin.settings.todoFolder)
            .onChange(async (value) => {
              this.plugin.settings.todoFolder = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(group)
        .setName("默认列表名称")
        .setDesc("首次运行时自动创建的默认列表名称")
        .addText((text) =>
          text
            .setPlaceholder("Tasks")
            .setValue(this.plugin.settings.defaultListName)
            .onChange(async (value) => {
              this.plugin.settings.defaultListName = value;
              await this.plugin.saveSettings();
            })
        );

      const birthdaySetting = new Setting(group)
        .setName("生日")
        .setDesc("用于人生计划视图计算年龄（格式：YYYY-MM-DD）");
      const birthdayInput = birthdaySetting.controlEl.createEl("input", {
        attr: { type: "date" },
      }) as HTMLInputElement;
      birthdayInput.value = this.plugin.settings.birthday || "";
      birthdayInput.addEventListener("change", async () => {
        this.plugin.settings.birthday = birthdayInput.value;
        await this.plugin.saveSettings();
      });
    });

    // --- Tag Management ---
    const allTags = this.plugin.tagService.getAll();
    const quadrantTags = allTags.filter((t) => t.sortOrder < 4);
    const domainTags = allTags.filter((t) => t.sortOrder >= 4);
    const customTags = allTags.filter((t) => !t.isDefault);

    this.settingGroup(containerEl, "标签管理", "任务分类与标签配置", (group) => {
      this.renderTagGroup(group, "四象限标签", quadrantTags, false, "用于四象限视图的任务分类");
      this.renderTagGroup(group, "领域标签", domainTags, false, "用于人生领域维度的任务分类");
      this.renderTagGroup(group, "自定义标签", customTags, true, "自由创建的个性化标签");
    });

    // --- Advanced Settings ---
    this.settingGroup(containerEl, "高级设置", "调试与日志", (group) => {
      new Setting(group)
        .setName("日志级别")
        .setDesc("控制控制台日志的详细程度")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("DEBUG", "调试")
            .addOption("INFO", "信息")
            .addOption("WARN", "警告")
            .addOption("ERROR", "错误")
            .setValue(this.plugin.settings.logLevel)
            .onChange(async (value) => {
              this.plugin.settings.logLevel = value;
              logger.setLevel(LogLevel[value as keyof typeof LogLevel]);
              await this.plugin.saveSettings();
            })
        );
    });

    // --- Data Management ---
    const stats = this.plugin.taskService.getStats();
    this.settingGroup(containerEl, "数据管理", "备份、清空与重置", (group) => {
      const statsEl = group.createDiv({ cls: "todo-setting-stats" });
      statsEl.createSpan({ text: "任务总数：" + stats.total + "（进行中：" + stats.active + "，已完成：" + stats.completed + "，回收站：" + stats.deleted + "）" });

      new Setting(group)
        .setName("清空所有任务")
        .setDesc("删除所有任务数据，保留列表和标签配置")
        .addButton((btn) =>
          btn
            .setButtonText("清空任务")
            .setWarning()
            .onClick(async () => {
              const confirmed = await new ConfirmModal(this.app, "即将删除 " + stats.total + " 个任务，此操作不可撤销。确认清空吗？").openAndConfirm();
              if (confirmed) {
                const count = await this.plugin.taskService.clearAll();
                this.display();
                try { await this.plugin.refreshView(); } catch(e) { logger.error("refreshView failed:", e); }
              }
            })
        );


      new Setting(group)
        .setName("重置所有数据")
        .setDesc("清空所有任务、列表、标签、分组，恢复到初始状态")
        .addButton((btn) =>
          btn
            .setButtonText("全部重置")
            .setWarning()
            .onClick(async () => {
              const confirmed = await new ConfirmModal(this.app, "即将重置所有数据（任务、列表、标签、分组），此操作不可撤销。确认重置吗？").openAndConfirm();
              if (confirmed) {
                await this.plugin.resetAllData();
              }
            })
        );
    });
  }

  private settingGroup(containerEl: HTMLElement, title: string, desc: string | undefined, render: (body: HTMLElement) => void): void {
    const wrap = containerEl.createDiv("todo-setting-section");
    const head = wrap.createDiv("todo-setting-section-head");
    head.createDiv({ cls: "todo-setting-section-title", text: title });
    if (desc) head.createDiv({ cls: "todo-setting-section-desc", text: desc });
    const body = wrap.createDiv("todo-setting-section-body");
    render(body);
  }
  private renderTagGroup(container: HTMLElement, title: string, tags: { id: string; name: string; icon: string; color: string; isDefault: boolean }[], editable: boolean, desc?: string): void {
    const group = container.createDiv({ cls: "todo-setting-tag-group" + (editable ? "" : " todo-setting-tag-preset") });
    const titleRow = group.createDiv({ cls: "todo-setting-tag-title-row" });
    const titleLeft = titleRow.createDiv({ cls: "todo-setting-tag-title-left" });
    titleLeft.createEl("span", { text: title, cls: "todo-setting-tag-group-title" });
    titleLeft.createEl("span", { text: "(" + tags.length + ")", cls: "todo-setting-tag-group-count" });
    if (editable) {
      const addBtn = titleRow.createEl("button", { text: "+ 添加", cls: "todo-setting-tag-add-btn" });
      addBtn.addEventListener("click", () => {
        new TagEditModal(this.app, null, async (result) => {
          await this.plugin.tagService.create({
            name: result.name,
            icon: result.icon,
            color: result.color,
            sortOrder: 100,
            isDefault: false,
          });
          this.display();
        }).open();
      });
    }
    if (desc) {
      group.createEl("p", { text: desc, cls: "todo-setting-tag-desc" });
    }

    if (tags.length === 0) {
      group.createDiv({ cls: "todo-setting-tag-empty", text: "暂无标签" });
      return;
    }

    const grid = group.createDiv({ cls: "todo-setting-tag-grid" });
    for (const tag of tags) {
      const item = grid.createDiv({ cls: "todo-setting-tag-item" });
      const colorBar = item.createDiv({ cls: "todo-setting-tag-color-bar" });
      colorBar.style.backgroundColor = tag.color || "var(--text-muted)";
      const left = item.createDiv({ cls: "todo-setting-tag-left" });
      const iconEl = left.createSpan({ cls: "todo-setting-tag-icon" });
      setIcon(iconEl, tag.icon);
      left.createSpan({ cls: "todo-setting-tag-name", text: tag.name });

      if (editable) {
        const actions = item.createDiv({ cls: "todo-setting-tag-actions" });
        const editBtn = actions.createEl("button", { text: "编辑", cls: "todo-setting-tag-btn" });
        editBtn.addEventListener("click", () => {
          new TagEditModal(this.app, tag, async (result) => {
            await this.plugin.tagService.update(tag.id, {
              name: result.name,
              icon: result.icon,
              color: result.color,
            });
            this.display();
          }).open();
        });
        const delBtn = actions.createEl("button", { text: "删除", cls: "todo-setting-tag-btn mod-warning" });
        delBtn.addEventListener("click", async () => {
          const confirmed = await new ConfirmModal(this.app, "确定删除标签「" + tag.name + "」吗？").openAndConfirm();
          if (confirmed) {
            await this.plugin.tagService.delete(tag.id);
            this.display();
          }
        });
      }
    }
  }

}

interface TagEditResult {
  name: string;
  icon: string;
  color: string;
}


class ConfirmModal extends Modal {
  private message: string;
  private resolve!: (value: boolean) => void;
  constructor(app: App, message: string) {
    super(app);
    this.message = message;
  }
  onOpen(): void {
    this.contentEl.createEl("p", { text: this.message });
    const actions = this.contentEl.createDiv({ cls: "todo-prompt-actions" });
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => { this.resolve(false); this.close(); });
    actions.createEl("button", { text: "确认", cls: "mod-cta" }).addEventListener("click", () => { this.resolve(true); this.close(); });
  }
  onClose(): void { this.contentEl.empty(); }
  openAndConfirm(): Promise<boolean> {
    return new Promise<boolean>((resolve) => { this.resolve = resolve; this.open(); });
  }
}

class TagEditModal extends Modal {
  private tag: { name: string; icon: string; color: string } | null;
  private onSave: (result: TagEditResult) => void;
  private nameInput!: HTMLInputElement;
  private selectedIcon: string;
  private colorInput!: HTMLInputElement;

  constructor(app: App, tag: { name: string; icon: string; color: string } | null, onSave: (result: TagEditResult) => void) {
    super(app);
    this.tag = tag;
    this.onSave = onSave;
    this.selectedIcon = tag?.icon || "tag";
  }

  onOpen(): void {
    this.contentEl.addClass("todo-tag-edit-modal");
    this.contentEl.createDiv({ cls: "todo-tag-edit-title", text: this.tag ? "编辑标签" : "新增标签" });

    // Name
    const nameRow = this.contentEl.createDiv({ cls: "todo-tag-edit-row" });
    nameRow.createEl("label", { text: "名称" });
    this.nameInput = nameRow.createEl("input", { attr: { type: "text", placeholder: "标签名称" } }) as HTMLInputElement;
    this.nameInput.value = this.tag?.name || "";

    // Icon
    const iconGroup = this.contentEl.createDiv({ cls: "todo-tag-edit-row" });
    iconGroup.createEl("label", { text: "图标" });
    
    // Current icon preview
    const iconPreview = iconGroup.createDiv({ cls: "todo-tag-edit-icon-preview" });
    const iconDisplay = iconPreview.createSpan({ cls: "todo-tag-edit-icon-display" });
    setIcon(iconDisplay, this.selectedIcon);
    const iconNameDisplay = iconPreview.createSpan({ cls: "todo-tag-edit-icon-name", text: this.selectedIcon });

    // Icon grid
    const gridEl = iconGroup.createDiv({ cls: "todo-tag-edit-icon-grid" });

    for (const iconName of ICON_OPTIONS) {
      const item = gridEl.createDiv({
        cls: "todo-tag-edit-icon-item" + (iconName === this.selectedIcon ? " selected" : ""),
      });
      item.title = iconName;
      setIcon(item, iconName);
      item.addEventListener("click", () => {
        this.selectedIcon = iconName;
        setIcon(iconDisplay, iconName);
        iconNameDisplay.setText(iconName);
        gridEl.querySelectorAll(".todo-tag-edit-icon-item").forEach((el) => el.removeClass("selected"));
        item.addClass("selected");
      });
    }

    // Color
    const colorRow = this.contentEl.createDiv({ cls: "todo-tag-edit-row" });
    colorRow.createEl("label", { text: "颜色" });
    this.colorInput = colorRow.createEl("input", { attr: { type: "color" } }) as HTMLInputElement;
    this.colorInput.value = this.tag?.color || "#6B7280";

    // Actions
    const actions = this.contentEl.createDiv({ cls: "todo-tag-edit-actions" });
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    const saveBtn = actions.createEl("button", { text: "保存", cls: "mod-cta" });
    saveBtn.addEventListener("click", () => {
      const name = this.nameInput.value.trim();
      if (!name) return;
      this.onSave({ name, icon: this.selectedIcon, color: this.colorInput.value });
      this.close();
    });

    window.setTimeout(() => this.nameInput.focus(), 30);
  }

  onClose(): void { this.contentEl.empty(); }
}
