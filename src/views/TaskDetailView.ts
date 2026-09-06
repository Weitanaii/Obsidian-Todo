import { App, Modal, Notice, setIcon, TFile, TFolder } from "obsidian";
import type { TodoPluginLike } from "./TodoView";
import type { Task } from "../models/Task";
import { ResourceSuggestModal } from "../ui/ResourceSuggestModal";

export class TaskDetailView {
  private app: App;
  private plugin: TodoPluginLike;
  private root: HTMLElement;
  private taskId: string | null = null;
  private titleInput!: HTMLInputElement;
  private noteInput!: HTMLTextAreaElement;
  private propsEl!: HTMLElement;
  private relatedEl!: HTMLElement;
  private pendingSave: Promise<void> | null = null;
  private onTaskUpdated?: (taskId: string) => void;
  private onClose?: () => void;

  constructor(app: App, plugin: TodoPluginLike, root: HTMLElement, onTaskUpdated?: (taskId: string) => void, onClose?: () => void) {
    this.app = app;
    this.plugin = plugin;
    this.root = root;
    this.onTaskUpdated = onTaskUpdated;
    this.onClose = onClose;
    this.root.addClass("todo-detail-panel");
    this.renderEmpty();
  }

  isActive(): boolean { return this.taskId !== null; }
  getTaskId(): string | null { return this.taskId; }

  open(taskId: string): void {
    this.taskId = taskId;
    void this.renderCurrentTask();
  }

  close(): void {
    this.taskId = null;
    this.renderEmpty();
  }

  refresh(task: Task): void {
    if (task.id !== this.taskId) return;
    this.applyValues(task);
  }

  private renderEmpty(): void {
    this.root.empty();
    this.root.removeClass("todo-detail-active");
    const empty = this.root.createDiv({ cls: "todo-detail-empty" });
    empty.createDiv({ cls: "todo-detail-empty-title", text: "选择一个任务查看详情" });
    empty.createDiv({ cls: "todo-detail-empty-desc", text: "点击列表中的任务后，可在此处编辑标题、备注、日期、重复规则等属性。" });
  }

  private async renderCurrentTask(): Promise<void> {
    if (this.pendingSave) await this.pendingSave;
    const task = this.getTask();
    if (!task) { this.renderEmpty(); return; }
    this.root.empty();
    this.root.addClass("todo-detail-active");    // --- Header ---
    const header = this.root.createDiv({ cls: "todo-detail-header" });
    const headerLeft = header.createDiv({ cls: "todo-detail-header-left" });
    const closeBtn = header.createEl("button", { cls: "todo-detail-close" });
    setIcon(closeBtn, "x");
    closeBtn.addEventListener("click", () => {
      this.plugin.settings.selectedTaskId = null;
      void this.plugin.saveSettings();
      this.close();
      this.onClose?.();
    });

    // --- Title row + star ---
    const titleRow = this.root.createDiv({ cls: "todo-detail-title-row" });
    this.titleInput = titleRow.createEl("input", { cls: "todo-detail-title-input", attr: { type: "text", placeholder: "任务标题" } }) as HTMLInputElement;
    this.titleInput.value = task.title || "";
    const starBtn = titleRow.createDiv({ cls: "todo-detail-star" + (task.isImportant ? " is-important" : "") });
    setIcon(starBtn, "star");
    starBtn.addEventListener("click", () => void this.toggleImportant(starBtn, task));
    this.titleInput.addEventListener("blur", () => {
      const next = this.titleInput.value.trim();
      if (!next) { this.titleInput.value = task.title || ""; return; }
      if (next !== task.title) void this.saveChanges({ title: next });
    });
    this.titleInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); this.titleInput.blur(); }
    });

    // --- Property rows ---
    const props = this.root.createDiv({ cls: "todo-detail-props" });
    this.propsEl = props;
    this.renderPropertyRows(props, task);

    // --- Note area ---
    const noteSection = this.root.createDiv({ cls: "todo-detail-note-section" });
    const noteLabel = noteSection.createDiv({ cls: "todo-detail-label" });
    setIcon(noteLabel, "pen-line");
    noteLabel.createSpan({ text: " 备注" });
    this.noteInput = noteSection.createEl("textarea", { cls: "todo-detail-textarea", attr: { rows: "2" } }) as HTMLTextAreaElement;
    this.noteInput.value = task.note || "";
    this.noteInput.addEventListener("blur", () => {
      const next = this.noteInput.value;
      if (next !== (task.note || "")) void this.saveChanges({ note: next });
    });

    // --- Related resources ---
    this.relatedEl = this.root.createDiv({ cls: "todo-detail-related" });
    this.renderRelatedSection(this.relatedEl, task);
    // --- Bottom bar ---
    const bottomBar = this.root.createDiv({ cls: "todo-detail-bottom" });
    bottomBar.createDiv({ cls: "todo-detail-created", text: this.formatCreatedDate(task.createdAt) });
    const deleteBtn = bottomBar.createDiv({ cls: "todo-detail-delete" });
    setIcon(deleteBtn, "trash-2");
    deleteBtn.addEventListener("click", () => void this.deleteTask(task));
  }
  private updateStarState(starBtn: HTMLElement, isImportant: boolean): void {
    starBtn.toggleClass("is-important", isImportant);
    setIcon(starBtn, "star");
  }

  private async toggleImportant(starBtn: HTMLElement, _task: Task): Promise<void> {
    const current = starBtn.hasClass("is-important");
    const next = !current;
    this.updateStarState(starBtn, next);
    await this.saveChanges({ isImportant: next });
  }

  private createPropertyRow(parent: HTMLElement, _task: Task, opts: { icon: string; unsetText: string; isSet: boolean; displayText: string; onClick: () => void; onClear: () => void; }): void {
    const row = parent.createDiv({ cls: "todo-prop-row" });
    const iconEl = row.createDiv({ cls: "todo-prop-icon" });
    setIcon(iconEl, opts.icon);
    const textEl = row.createDiv({ cls: "todo-prop-text" + (opts.isSet ? " is-set" : "") });
    textEl.textContent = opts.isSet ? opts.displayText : opts.unsetText;
    textEl.addEventListener("click", opts.onClick);
    if (opts.isSet) {
      const clearBtn = row.createDiv({ cls: "todo-prop-clear" });
      clearBtn.textContent = "\u00d7";
      clearBtn.title = "移除";
      clearBtn.addEventListener("click", opts.onClear);
    }
  }

  private createMyDayRow(parent: HTMLElement, task: Task): void {
    this.createPropertyRow(parent, task, {
      icon: "sun",
      unsetText: "添加到\u201c我的一天\u201d",
      isSet: task.isMyDay,
      displayText: "\u5df2\u5728\u201c\u6211\u7684\u4e00\u5929\u201d\u4e2d",
      onClick: () => { void this.saveChanges({ isMyDay: !task.isMyDay }); },
      onClear: () => { void this.saveChanges({ isMyDay: false }); },
    });
  }

  private createDueDateRow(parent: HTMLElement, task: Task): void {
    const hasDue = !!task.dueDate;
    let display = "添加截止日期";
    if (hasDue && task.dueDate) { display = "截止日期：" + this.formatDisplayDate(task.dueDate); }
    this.createPropertyRow(parent, task, {
      icon: "calendar",
      unsetText: "添加截止日期",
      isSet: hasDue,
      displayText: display,
      onClick: () => { new DatePickerModal(this.app, task.dueDate, "end", (date) => { void this.saveChanges({ dueDate: date }); }).open(); },
      onClear: () => { void this.saveChanges({ dueDate: null }); },
    });
  }

  private createStartDateRow(parent: HTMLElement, task: Task): void {
    const hasStart = !!task.startDate;
    let display = "添加开始日期";
    if (hasStart && task.startDate) { display = "开始日期：" + this.formatDisplayDate(task.startDate); }
    this.createPropertyRow(parent, task, {
      icon: "calendar-days",
      unsetText: "添加开始日期",
      isSet: hasStart,
      displayText: display,
      onClick: () => { new DatePickerModal(this.app, task.startDate, "start", (date) => { void this.saveChanges({ startDate: date }); }, (startIso, endIso) => { void this.saveChanges({ startDate: startIso, dueDate: endIso }); }).open(); },
      onClear: () => { void this.saveChanges({ startDate: null }); },
    });
  }

  private createRecurrenceRow(parent: HTMLElement, task: Task): void {
    const hasRec = !!task.recurrence;
    let display = "设置重复";
    if (hasRec && task.recurrence) { display = "重复：" + this.formatRecurrenceDisplay(task.recurrence); }
    this.createPropertyRow(parent, task, {
      icon: "repeat",
      unsetText: "设置重复",
      isSet: hasRec,
      displayText: display,
      onClick: () => { new RecurrencePickerModal(this.app, task.recurrence, (rec) => { void this.saveChanges({ recurrence: rec }); }).open(); },
      onClear: () => { void this.saveChanges({ recurrence: null }); },
    });
  }
  private applyValues(task: Task): void {
    if (!this.root.hasClass("todo-detail-active")) return;
    this.titleInput.value = task.title || "";
    this.noteInput.value = task.note || "";
    const starBtn = this.root.querySelector(".todo-detail-star") as HTMLElement | null;
    if (starBtn) this.updateStarState(starBtn, task.isImportant);
    // Refresh property rows
    this.propsEl.empty();
    this.renderPropertyRows(this.propsEl, task);
    this.relatedEl.empty();
    this.renderRelatedSection(this.relatedEl, task);
  }
  private renderPropertyRows(container: HTMLElement, task: Task): void {
    this.createMyDayRow(container, task);
    this.createStartDateRow(container, task);
    this.createDueDateRow(container, task);
    this.createRecurrenceRow(container, task);
  }

  private renderRelatedSection(container: HTMLElement, task: Task): void {
    const directPaths = task.relatedPaths || [];
    const folderPaths = task.relatedFolders || [];

    // Resolve folders to file lists
    const folderContents: { folderPath: string; files: string[] }[] = [];
    const allDisplayItems: { path: string; isFolder: boolean; fromFolder?: string }[] = [];

    for (const fp of directPaths) {
      allDisplayItems.push({ path: fp, isFolder: false });
    }

    for (const folderPath of folderPaths) {
      const abs = this.app.vault.getAbstractFileByPath(folderPath);
      if (abs instanceof TFolder) {
        const files: string[] = [];
        const collect = (folder: TFolder) => {
          for (const child of folder.children) {
            if (child instanceof TFile) {
              files.push(child.path);
            } else if (child instanceof TFolder) {
              collect(child);
            }
          }
        };
        collect(abs);
        folderContents.push({ folderPath, files });
        allDisplayItems.push({ path: folderPath, isFolder: true });
        for (const f of files) {
          allDisplayItems.push({ path: f, isFolder: false, fromFolder: folderPath });
        }
      }
    }

    const totalCount = allDisplayItems.length;
    const titleRow = container.createDiv({ cls: "todo-related-title-row" });
    const titleIcon = titleRow.createDiv({ cls: "todo-prop-icon" });
    setIcon(titleIcon, "link");
    const labelText = totalCount > 0 ? "关联 (" + totalCount + ")" : "关联";
    titleRow.createSpan({ cls: "todo-related-label", text: labelText });

    if (totalCount > 0) {
      const list = container.createDiv({ cls: "todo-related-list" });
      for (const item of allDisplayItems) {
        const row = list.createDiv({ cls: "todo-related-item" + (item.isFolder ? " is-folder" : " is-file") });
        const itemIcon = row.createSpan({ cls: "todo-related-item-icon" });
        setIcon(itemIcon, item.isFolder ? "folder" : "file-text");
        const pathParts = item.path.split('/');
        const displayName = pathParts.length >= 2 ? pathParts.slice(-2).join('/') : item.path;
        const nameEl = row.createSpan({ cls: "todo-related-item-name", text: displayName });
        nameEl.title = item.path;
        if (!item.isFolder) {
          nameEl.addEventListener("click", () => {
            this.app.workspace.openLinkText(item.path, "", true);
          });
        }
        const removeBtn = row.createSpan({ cls: "todo-related-item-remove" });
        setIcon(removeBtn, "x");
        removeBtn.addEventListener("click", () => {
          if (item.isFolder) {
            const next = folderPaths.filter((fp) => fp !== item.path);
            void this.saveChanges({ relatedFolders: next });
          } else if (item.fromFolder) {
            const next = folderPaths.filter((fp) => fp !== item.fromFolder);
            void this.saveChanges({ relatedFolders: next });
          } else {
            const next = directPaths.filter((dp) => dp !== item.path);
            void this.saveChanges({ relatedPaths: next });
          }
        });
      }
    }

    const addBtn = container.createDiv({ cls: "todo-related-add" });
    setIcon(addBtn, "plus");
    addBtn.createSpan({ text: " 添加关联" });
    addBtn.addEventListener("click", () => {
      const excludePaths = [...directPaths, ...folderPaths];
      new ResourceSuggestModal(this.app, excludePaths, (result) => {
        if (result.isFolder) {
          const next = [...folderPaths, result.path];
          void this.saveChanges({ relatedFolders: next });
        } else {
          const next = [...directPaths, result.path];
          void this.saveChanges({ relatedPaths: next });
        }
      }).open();
    });
  }

  private async saveChanges(changes: Partial<Task>): Promise<void> {
    const taskId = this.taskId;
    if (!taskId) return;
    const p = this.plugin.taskService.update(taskId, changes).then((updated) => {
      if (updated && this.taskId === taskId) this.applyValues(updated);
      if (this.pendingSave === p) this.pendingSave = null;
      this.onTaskUpdated?.(taskId);
    });
    this.pendingSave = p;
    return p;
  }

  private getTask(): Task | undefined {
    const taskId = this.taskId;
    if (!taskId) return undefined;
    return this.plugin.taskService.getAll().find((t) => t.id === taskId);
  }

  private formatDisplayDate(isoValue: string): string {
    if (!isoValue) return "";
    const d = new Date(isoValue);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    const h = pad(d.getHours());
    const m = pad(d.getMinutes());
    if (h === "00" && m === "00") {
      return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
    }
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 " + h + ":" + m;
  }

  private formatCreatedDate(isoValue: string): string {
    if (!isoValue) return "";
    const d = new Date(isoValue);
    if (Number.isNaN(d.getTime())) return "";
    return "创建于 " + d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  private formatRecurrenceDisplay(rec: string): string {
    const map: Record<string, string> = { daily: "每天", weekly: "每周", monthly: "每月", yearly: "每年" };
    if (map[rec]) return map[rec];
    if (rec.startsWith("custom:")) return "自定义";
    return rec;
  }

  private async deleteTask(task: Task): Promise<void> {
    await this.plugin.taskService.delete(task.id);
    new Notice("任务已删除");
    this.plugin.settings.selectedTaskId = null;
    await this.plugin.saveSettings();
    this.close();
    this.onClose?.();
    this.onTaskUpdated?.(task.id);
  }
}

class DatePickerModal extends Modal {
  private currentDate: Date;
  private onSelect: (isoDate: string | null) => void;
  private onLinkedUpdate?: (startIso: string, endIso: string) => void;
  private mode: "start" | "end";
  private selectedHour: number;
  private selectedMinute: number;

  constructor(
    app: App,
    currentIsoDate: string | null,
    mode: "start" | "end",
    onSelect: (isoDate: string | null) => void,
    onLinkedUpdate?: (startIso: string, endIso: string) => void
  ) {
    super(app);
    this.mode = mode;
    this.onSelect = onSelect;
    this.onLinkedUpdate = onLinkedUpdate;
    const d = currentIsoDate ? new Date(currentIsoDate) : new Date();
    this.currentDate = Number.isNaN(d.getTime()) ? new Date() : d;
    this.selectedHour = this.currentDate.getHours();
    this.selectedMinute = this.currentDate.getMinutes();
  }

  onOpen(): void {
    this.contentEl.addClass("todo-date-picker");
    this.renderCalendar(this.currentDate.getFullYear(), this.currentDate.getMonth());
  }

  onClose(): void { this.contentEl.empty(); }

    private formatIso(d: Date, h: number, m: number): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(h) + ":" + pad(m) + ":00";
  }

  private renderCalendar(year: number, month: number): void {
    this.contentEl.empty();
    const selY = this.currentDate.getFullYear();
    const selM = this.currentDate.getMonth();
    const selD = this.currentDate.getDate();

    // Month navigation
    const nav = this.contentEl.createDiv({ cls: "todo-dp-nav" });
    nav.createEl("button", { cls: "todo-dp-nav-btn", text: "\u276e" }).addEventListener("click", () => {
      this.renderCalendar(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1);
    });
    nav.createDiv({ cls: "todo-dp-nav-title", text: year + "年" + (month + 1) + "月" });
    nav.createEl("button", { cls: "todo-dp-nav-btn", text: "\u276f" }).addEventListener("click", () => {
      this.renderCalendar(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1);
    });

    // Weekday headers
    const wd = this.contentEl.createDiv({ cls: "todo-dp-weekdays" });
    ["一","二","三","四","五","六","日"].forEach((d) => wd.createDiv({ cls: "todo-dp-weekday", text: d }));

    // Day grid
    const grid = this.contentEl.createDiv({ cls: "todo-dp-grid" });
    const firstDay = new Date(year, month, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < offset; i++) { grid.createDiv({ cls: "todo-dp-day todo-dp-day-empty" }); }
    for (let day = 1; day <= daysInMonth; day++) {
      const dayEl = grid.createDiv({ cls: "todo-dp-day", text: String(day) });
      if (year === selY && month === selM && day === selD) dayEl.addClass("is-selected");
      dayEl.addEventListener("click", () => {
        this.currentDate = new Date(year, month, day);
        this.renderCalendar(year, month);
      });
    }
    const trailing = 42 - offset - daysInMonth;
    for (let i = 0; i < trailing; i++) { grid.createDiv({ cls: "todo-dp-day todo-dp-day-empty" }); }

    // Quick time presets
    const presets = this.contentEl.createDiv({ cls: "todo-dp-presets" });
    const presetData = [
      { label: "全天", icon: "🕐", hour: 7, minute: 0, endHour: 23, endMinute: 30 },
      { label: "早上", icon: "🌅", hour: 7, minute: 0, endHour: 12, endMinute: 0 },
      { label: "中午", icon: "🌞", hour: 12, minute: 0, endHour: 14, endMinute: 0 },
      { label: "下午", icon: "☀️", hour: 14, minute: 0, endHour: 18, endMinute: 0 },
      { label: "晚上", icon: "🌙", hour: 18, minute: 0, endHour: 23, endMinute: 30 },
    ];
    presetData.forEach((p) => {
      const btn = presets.createEl("button", { cls: "todo-dp-preset-btn", text: p.icon + " " + p.label });
      btn.addEventListener("click", () => {
        this.selectedHour = p.hour;
        this.selectedMinute = p.minute;
        this.currentDate.setHours(p.hour, p.minute);
        // Update dropdowns to reflect selected preset
        hourSelect.value = String(p.hour);
        minuteSelect.value = String(p.minute);
        // If start mode and linked update exists, trigger linked update
        if (this.mode === "start" && this.onLinkedUpdate) {
          const startIso = this.formatIso(this.currentDate, p.hour, p.minute);
          const endDate = new Date(this.currentDate);
          endDate.setHours(p.endHour, p.endMinute);
          const endIso = this.formatIso(endDate, p.endHour, p.endMinute);
          this.onLinkedUpdate(startIso, endIso);
        }
      });
    });

    // Time picker
    const timeRow = this.contentEl.createDiv({ cls: "todo-dp-time" });
    timeRow.createSpan({ text: "时间: " });
    const hourSelect = timeRow.createEl("select", { cls: "todo-dp-time-select" });
    for (let h = 0; h < 24; h++) {
      const opt = hourSelect.createEl("option", { value: String(h), text: String(h).padStart(2, "0") });
      if (h === this.selectedHour) opt.selected = true;
    }
    hourSelect.addEventListener("change", () => {
      this.selectedHour = parseInt(hourSelect.value);
    });
    timeRow.createSpan({ text: " : " });
    const minuteSelect = timeRow.createEl("select", { cls: "todo-dp-time-select" });
    [0, 15, 30, 45].forEach((m) => {
      const opt = minuteSelect.createEl("option", { value: String(m), text: String(m).padStart(2, "0") });
      if (m === this.selectedMinute) opt.selected = true;
    });
    minuteSelect.addEventListener("change", () => {
      this.selectedMinute = parseInt(minuteSelect.value);
    });

    // Action buttons
    const actions = this.contentEl.createDiv({ cls: "todo-dp-actions" });
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    actions.createEl("button", { text: "保存", cls: "mod-cta" }).addEventListener("click", () => {
      this.currentDate.setHours(this.selectedHour, this.selectedMinute);
      const isoStr = this.formatIso(this.currentDate, this.selectedHour, this.selectedMinute);
      this.onSelect(isoStr);
      this.close();
    });
  }
}

class RecurrencePickerModal extends Modal {
  private currentRecurrence: string | null;
  private onSelect: (recurrence: string | null) => void;

  constructor(app: App, currentRecurrence: string | null, onSelect: (recurrence: string | null) => void) {
    super(app);
    this.currentRecurrence = currentRecurrence;
    this.onSelect = onSelect;
  }

  onOpen(): void {
    this.contentEl.addClass("todo-recurrence-picker");
    this.contentEl.createDiv({ cls: "todo-rec-title", text: "设置重复" });

    const options: { label: string; value: string }[] = [
      { label: "每天", value: "daily" },
      { label: "每周", value: "weekly" },
      { label: "每月", value: "monthly" },
      { label: "每年", value: "yearly" },
    ];

    options.forEach((opt) => {
      const item = this.contentEl.createDiv({ cls: "todo-rec-option" + (this.currentRecurrence === opt.value ? " is-selected" : "") });
      item.textContent = opt.label;
      item.addEventListener("click", () => { this.onSelect(opt.value); this.close(); });
    });

    const customItem = this.contentEl.createDiv({ cls: "todo-rec-option" });
    customItem.textContent = "自定义";
    customItem.addEventListener("click", () => { this.contentEl.empty(); this.renderCustomPanel(); });
  }

  onClose(): void { this.contentEl.empty(); }

  private renderCustomPanel(): void {
    this.contentEl.createDiv({ cls: "todo-rec-title", text: "自定义重复" });

    const intervalRow = this.contentEl.createDiv({ cls: "todo-rec-row" });
    intervalRow.createEl("span", { text: "每 " });
    const intervalInput = intervalRow.createEl("input", { attr: { type: "number", min: "1", value: "1" } }) as HTMLInputElement;
    intervalInput.style.width = "50px";
    const unitSelect = intervalRow.createEl("select") as HTMLSelectElement;
    [{ v: "day", l: "天" }, { v: "week", l: "周" }, { v: "month", l: "月" }, { v: "year", l: "年" }].forEach((u) => {
      const opt = unitSelect.createEl("option", { value: u.v, text: u.l });
      if (u.v === "day") opt.selected = true;
    });

    const actions = this.contentEl.createDiv({ cls: "todo-dp-actions" });
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => { this.contentEl.empty(); this.onOpen(); });
    actions.createEl("button", { text: "保存", cls: "mod-cta" }).addEventListener("click", () => {
      const interval = Math.max(1, parseInt(intervalInput.value) || 1);
      this.onSelect("custom:" + interval + ":" + unitSelect.value);
      this.close();
    });
  }
}

