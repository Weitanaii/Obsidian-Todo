import { App, Modal, setIcon } from "obsidian";

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

export class IconPickerModal extends Modal {
  private currentIcon: string;
  private onSelect: (iconName: string) => void;

  constructor(app: App, currentIcon: string, onSelect: (iconName: string) => void) {
    super(app);
    this.currentIcon = currentIcon;
    this.onSelect = onSelect;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("todo-icon-picker");

    // Title
    contentEl.createDiv({ cls: "todo-icon-picker-title", text: "选择图标" });

    // Search input
    const searchInput = contentEl.createEl("input", {
      cls: "todo-icon-picker-search",
      attr: { type: "text", placeholder: "搜索图标..." },
    }) as HTMLInputElement;

    // Icon grid container
    const gridEl = contentEl.createDiv({ cls: "todo-icon-picker-grid" });

    const renderGrid = (filter: string) => {
      gridEl.empty();
      const lower = filter.toLowerCase();
      const filtered = lower
        ? LIST_ICONS.filter((icon) => icon.includes(lower))
        : LIST_ICONS;

      for (const iconName of filtered) {
        const item = gridEl.createDiv({
          cls: "todo-icon-picker-item" + (iconName === this.currentIcon ? " selected" : ""),
        });
        item.title = iconName;
        setIcon(item, iconName);
        item.addEventListener("click", () => {
          this.onSelect(iconName);
          this.close();
        });
      }

      if (filtered.length === 0) {
        gridEl.createDiv({ cls: "todo-icon-picker-empty", text: "没有匹配的图标" });
      }
    };

    searchInput.addEventListener("input", () => renderGrid(searchInput.value));
    renderGrid("");

    window.setTimeout(() => searchInput.focus(), 30);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}