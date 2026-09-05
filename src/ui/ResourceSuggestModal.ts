import { App, SuggestModal, setIcon, TAbstractFile, TFile, TFolder } from "obsidian";

export type ResourceSelectResult = { path: string; isFolder: boolean };

export class ResourceSuggestModal extends SuggestModal<TAbstractFile> {
  private excludePaths: Set<string>;
  private onSelect: (result: ResourceSelectResult) => void;

  constructor(
    app: App,
    excludePaths: string[],
    onSelect: (result: ResourceSelectResult) => void,
  ) {
    super(app);
    this.excludePaths = new Set(excludePaths);
    this.onSelect = onSelect;
    this.setPlaceholder("搜索页面、文件或文件夹…");
    this.limit = 20;
  }

  getSuggestions(query: string): TAbstractFile[] {
    const lower = query.toLowerCase();
    const results: TAbstractFile[] = [];

    const walk = (folder: TFolder) => {
      for (const child of folder.children) {
        if (this.excludePaths.has(child.path)) continue;
        if (child instanceof TFolder) {
          if (child.path.toLowerCase().contains(lower)) {
            results.push(child);
          }
          walk(child);
        } else if (child instanceof TFile) {
          if (
            child.path.toLowerCase().contains(lower) ||
            child.basename.toLowerCase().contains(lower)
          ) {
            results.push(child);
          }
        }
      }
    };

    walk(this.app.vault.getRoot());
    return results;
  }

  renderSuggestion(file: TAbstractFile, el: HTMLElement): void {
    el.addClass("todo-resource-suggest-item");
    const iconEl = el.createSpan({ cls: "todo-resource-suggest-icon" });
    const nameEl = el.createSpan({ cls: "todo-resource-suggest-name" });

    if (file instanceof TFolder) {
      setIcon(iconEl, "folder");
      nameEl.setText(file.path + "/");
    } else {
      setIcon(iconEl, "file-text");
      nameEl.setText(file.path);
    }
  }

  onChooseSuggestion(file: TAbstractFile): void {
    const isFolder = file instanceof TFolder;
    this.onSelect({ path: file.path, isFolder });
  }
}