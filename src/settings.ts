import { App, Modal, PluginSettingTab, setIcon, Setting } from "obsidian";
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
  selectedTaskId: string | null;
  selectedQuadrant: string | null;
  activePlanKind: PlanKind | null;
  sortConfig: SortConfig;
  birthday: string;
}

export const DEFAULT_SETTINGS: ObsidianTodoSettings = {
  todoFolder: "todo",
  defaultListName: "Tasks",
  logLevel: "INFO",
  activeViewNav: "myday",
  selectedListId: null,
  completedCollapsed: true,
  selectedTaskId: null,
  sortConfig: {
    primary: { field: "importance", direction: "desc" },
    secondary: { field: "createdAt", direction: "desc" },
  },
  selectedQuadrant: null,
  activePlanKind: null,
  birthday: "",
};

const ICON_OPTIONS = [
  "tag", "star", "bookmark", "flag", "folder", "file", "globe", "home",
  "mail", "phone", "rocket", "shield", "gift", "music", "camera",
  "compass", "map", "sun", "moon", "cloud", "zap", "heart",
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

    containerEl.createEl("h2", { text: "Obsidian Todo 设置" });

    new Setting(containerEl)
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

    new Setting(containerEl)
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


    // --- Birthday ---
    const birthdaySetting = new Setting(containerEl)
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
    // --- Tag Management ---
    containerEl.createEl("h2", { text: "标签管理" });

    const allTags = this.plugin.tagService.getAll();
    const quadrantTags = allTags.filter((t) => t.sortOrder < 4);
    const domainTags = allTags.filter((t) => t.sortOrder >= 4 && t.sortOrder < 10);
    const customTags = allTags.filter((t) => !t.isDefault);

    this.renderTagGroup(containerEl, "四象限标签", quadrantTags, false, "用于四象限视图的任务分类");
    this.renderTagGroup(containerEl, "领域标签", domainTags, false, "用于人生领域维度的任务分类");
    this.renderTagGroup(containerEl, "自定义标签", customTags, true, "自由创建的个性化标签");

    // --- Advanced Settings (collapsible) ---
    const advHeader = containerEl.createDiv({ cls: "todo-setting-adv-header" });
    advHeader.createSpan({ cls: "todo-setting-adv-arrow", text: "▶" });
    advHeader.createSpan({ text: "高级设置" });
    const advBody = containerEl.createDiv({ cls: "todo-setting-adv-body" });
    advBody.style.display = "none";
    advHeader.addEventListener("click", () => {
      const shown = advBody.style.display !== "none";
      advBody.style.display = shown ? "none" : "";
      const arrow = advHeader.querySelector(".todo-setting-adv-arrow");
      if (arrow) arrow.textContent = shown ? "▶" : "▼";
    });

    new Setting(advBody)
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
          const confirmed = confirm("确定删除标签 “" + tag.name + "” 吗？");
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

class TagEditModal extends Modal {
  private tag: { name: string; icon: string; color: string } | null;
  private onSave: (result: TagEditResult) => void;
  private nameInput!: HTMLInputElement;
  private iconSelect!: HTMLSelectElement;
  private colorInput!: HTMLInputElement;

  constructor(app: App, tag: { name: string; icon: string; color: string } | null, onSave: (result: TagEditResult) => void) {
    super(app);
    this.tag = tag;
    this.onSave = onSave;
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
    const iconRow = this.contentEl.createDiv({ cls: "todo-tag-edit-row" });
    iconRow.createEl("label", { text: "图标" });
    this.iconSelect = iconRow.createEl("select") as HTMLSelectElement;
    for (const icon of ICON_OPTIONS) {
      const opt = this.iconSelect.createEl("option", { value: icon, text: icon });
      if (this.tag && this.tag.icon === icon) opt.selected = true;
      if (!this.tag && icon === "tag") opt.selected = true;
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
      this.onSave({ name, icon: this.iconSelect.value, color: this.colorInput.value });
      this.close();
    });

    window.setTimeout(() => this.nameInput.focus(), 30);
  }

  onClose(): void { this.contentEl.empty(); }
}
