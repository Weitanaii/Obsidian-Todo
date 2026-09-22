import { App, Modal, setIcon } from "obsidian";
import { t } from "../i18n";

export interface CreateListResult {
  name: string;
  icon: string;
}

const LIST_ICONS: string[] = [
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

export class CreateListModal extends Modal {
  private resolve!: (value: CreateListResult | null) => void;
  private selectedIcon = "list-checks";
  private nameInput!: HTMLInputElement;
  private editName: string;
  private editIcon: string;

  constructor(app: App, editList?: { name: string; icon?: string }) {
    super(app);
    this.editName = editList?.name || "";
    this.editIcon = editList?.icon || "list-checks";
    if (editList) this.selectedIcon = editList.icon || "list-checks";
  }

  async openAndGetValue(): Promise<CreateListResult | null> {
    return new Promise<CreateListResult | null>((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("todo-create-list-modal");

    // Title
    contentEl.createDiv({ cls: "todo-create-list-title", text: this.editName ? t("编辑列表") : t("新建列表") });

    // Wait for onOpen to set nameInput value

    // Name input
    const nameGroup = contentEl.createDiv({ cls: "todo-create-list-group" });
    nameGroup.createDiv({ cls: "todo-create-list-label", text: t("列表名称") });
    this.nameInput = nameGroup.createEl("input", {
      cls: "todo-create-list-input",
      attr: { type: "text", placeholder: t("输入列表名称...") },
    }) as HTMLInputElement;
    if (this.editName) this.nameInput.value = this.editName;

    // Icon selector
    const iconGroup = contentEl.createDiv({ cls: "todo-create-list-group" });
    iconGroup.createDiv({ cls: "todo-create-list-label", text: t("选择图标") });

    // Current icon preview
    const iconPreview = iconGroup.createDiv({ cls: "todo-create-list-icon-preview" });
    const iconDisplay = iconPreview.createSpan({ cls: "todo-create-list-icon-display" });
    setIcon(iconDisplay, this.selectedIcon);
    const iconNameDisplay = iconPreview.createSpan({ cls: "todo-create-list-icon-name", text: this.selectedIcon });

    // Search input
    const searchInput = iconGroup.createEl("input", {
      cls: "todo-create-list-search",
      attr: { type: "text", placeholder: t("搜索图标...") },
    }) as HTMLInputElement;

    // Icon grid
    const gridEl = iconGroup.createDiv({ cls: "todo-create-list-icon-grid" });

    const renderGrid = (filter: string) => {
      gridEl.empty();
      const lower = filter.toLowerCase();
      const filtered = lower
        ? LIST_ICONS.filter((icon) => icon.includes(lower))
        : LIST_ICONS;

      for (const iconName of filtered) {
        const item = gridEl.createDiv({
          cls: "todo-create-list-icon-item" + (iconName === this.selectedIcon ? " selected" : ""),
        });
        item.title = iconName;
        setIcon(item, iconName);
        item.addEventListener("click", () => {
          this.selectedIcon = iconName;
          setIcon(iconDisplay, iconName);
          iconNameDisplay.setText(iconName);
          gridEl.querySelectorAll(".todo-create-list-icon-item").forEach((el) => el.removeClass("selected"));
          item.addClass("selected");
        });
      }

      if (filtered.length === 0) {
        gridEl.createDiv({ cls: "todo-create-list-icon-empty", text: t("没有匹配的图标") });
      }
    };

    searchInput.addEventListener("input", () => renderGrid(searchInput.value));
    renderGrid("");

    // Actions
    const actions = contentEl.createDiv({ cls: "todo-create-list-actions" });
    const cancelBtn = actions.createEl("button", { text: t("取消") });
    const confirmBtn = actions.createEl("button", { text: this.editName ? t("保存") : t("创建"), cls: "mod-cta" });

    cancelBtn.addEventListener("click", () => this.finish(null));
    confirmBtn.addEventListener("click", () => this.finish({ name: this.nameInput.value.trim(), icon: this.selectedIcon }));

    this.nameInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this.finish({ name: this.nameInput.value.trim(), icon: this.selectedIcon });
      }
    });

    window.setTimeout(() => this.nameInput.focus(), 30);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private finish(value: CreateListResult | null): void {
    this.resolve(value);
    this.close();
  }
}
