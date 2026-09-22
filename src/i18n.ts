export type TodoLanguage = "zh" | "en";

const translations: Record<string, string> = {
  "我的一天": "My Day",
  "所有任务": "All Tasks",
  "任务": "Tasks",
  "四象限": "Eisenhower Matrix",
  "重要紧急": "Urgent & Important",
  "重要不紧急": "Important, Not Urgent",
  "不重要紧急": "Urgent, Not Important",
  "不重要不紧急": "Not Urgent or Important",
  "事业": "Career",
  "财富": "Finance",
  "健康": "Health",
  "心理": "Wellbeing",
  "学习": "Learning",
  "家庭": "Family",
  "社交": "Social",
  "兴趣": "Interests",
  "娱乐": "Entertainment",
  "杂务": "Chores",
  "人生计划": "Life Plan",
  "年度计划": "Year Plan",
  "月度计划": "Month Plan",
  "新建列表": "New List",
  "新建分组": "New Group",
  "设置": "Settings",
  "统计": "Statistics",
  "复盘": "Review",
  "回收站": "Trash",
  "今天": "Today",
  "取消": "Cancel",
  "确认": "Confirm",
  "保存": "Save",
  "编辑": "Edit",
  "删除": "Delete",
  "恢复": "Restore",
  "按重要程度": "By Importance",
  "按截止日期": "By Due Date",
  "按创建时间": "By Created Time",
  "按标题": "By Title",
  "添加任务...": "Add task...",
  "显示设置": "Display Settings",
  "界面显示选项": "Interface display options",
  "显示农历": "Show lunar calendar",
  "在日历、日程视图和日期选择器中显示农历日期、节日和节气": "Show lunar dates, festivals, and solar terms in calendars, schedules, and date pickers",
  "语言": "Language",
  "选择插件界面语言": "Choose the plugin interface language",
  "中文": "Chinese",
  "英文": "English",
  "任务管理插件设置": "Task management plugin settings",
  "基本设置": "Basic Settings",
  "插件核心配置": "Core plugin configuration",
  "数据存储文件夹": "Data folder",
  "任务数据文件存储在 Vault 中的文件夹路径": "Folder in the Vault where task data is stored",
  "默认列表名称": "Default list name",
  "首次运行时自动创建的默认列表名称": "Default list name created on first run",
  "生日": "Birthday",
  "用于人生计划视图计算年龄（格式：YYYY-MM-DD）": "Used to calculate age in the life plan view (YYYY-MM-DD)",
  "标签管理": "Tag Management",
  "任务分类与标签配置": "Task categories and tag configuration",
  "四象限标签": "Quadrant Tags",
  "领域标签": "Domain Tags",
  "自定义标签": "Custom Tags",
  "高级设置": "Advanced Settings",
  "调试与日志": "Debugging and logging",
  "日志级别": "Log level",
  "控制控制台日志的详细程度": "Controls console log detail",
  "调试": "Debug",
  "信息": "Info",
  "警告": "Warning",
  "错误": "Error",
  "数据管理": "Data Management",
  "备份、清空与重置": "Backup, clear, and reset",
  "任务总数：": "Total tasks: ",
  "清空所有任务": "Clear all tasks",
  "删除所有任务，保留列表和标签配置": "Delete all tasks while keeping lists and tags",
  "清空任务": "Clear Tasks",
  "重置所有数据": "Reset all data",
  "清空所有任务、列表、标签、分组，恢复到初始状态": "Clear all tasks, lists, tags, and groups and restore defaults",
  "全部重置": "Reset Everything",
  "暂无标签": "No tags",
  "添加": "Add",
  "截止日期": "Due date",
  "开始日期": "Start date",
  "备注": "Notes",
  "重复": "Repeat",
  "重要": "Important",
  "未完成": "Active",
  "已完成": "Completed",
  "清空回收站": "Empty Trash",
  "回收站是空的": "Trash is empty",
  "没有任务": "No tasks",
  "今天还没有安排": "Nothing planned for today",
  "自定义": "Custom",
  "设置重复": "Set recurrence",
  "自定义重复": "Custom recurrence",
  "每天": "Daily",
  "每周": "Weekly",
  "每月": "Monthly",
  "每年": "Yearly",
  "按天": "By day",
  "按周": "By week",
  "按月": "By month",
  "按年": "By year",
  "全天": "All day",
  "早上": "Morning",
  "中午": "Noon",
  "晚上": "Evening",
  "下午": "Afternoon",
  "周日": "Sunday",
  "周一": "Monday",
  "周二": "Tuesday",
  "周三": "Wednesday",
  "周四": "Thursday",
  "周五": "Friday",
  "周六": "Saturday",
  "日": "Day",
  "周": "Week",
  "月": "Month",
  "季度计划": "Quarter Plan",
  "周计划": "Week Plan",
  "统计分布": "Statistics",
  "没有目标": "No goals",
  "添加目标": "Add goal",
  "新建人生目标...": "New life goal...",
  "新建年度目标...": "New yearly goal...",
  "新建月度目标...": "New monthly goal...",
  "新建任务...": "New task...",
  "添加任务到我的一天...": "Add task to My Day...",
  "添加任务到任务...": "Add task to Tasks...",
  "添加任务到当前列表...": "Add task to current list...",
  "输入任务标题": "Enter task title",
  "任务标题": "Task title",
  "选择一个任务查看详情": "Select a task to view details",
  "点击列表中的任务后，可在此处编辑标题、备注、日期、重复规则等属性。": "Select a task to edit its title, notes, dates, and recurrence here.",
  "移除": "Remove",
  "删除整个系列": "Delete entire series",
  "重复系列成员": "Recurring series member",
  "日程": "Schedule",
  "我的日程": "Schedule",
  "我的计划": "My Plans",
  "输入列表名称": "Enter list name",
  "输入分组名称": "Enter group name",
  "目标数": "Goals",
  "进行中": "In Progress",
  "逾期": "Overdue",
  "完成率": "Completion Rate",
  "卡片": "Cards",
  "列表": "List",
  "暂无年度目标": "No yearly goals",
  "暂无月度目标": "No monthly goals",
  "暂无季度目标": "No quarterly goals",
  "回到今年": "This year",
  "回到本月": "This month",
  "上一周期": "Previous period",
  "下一周期": "Next period",
  "回到当前": "Back to current",
  "搜索标签...": "Search tags...",
  "搜索任务...": "Search tasks...",
};

let currentLanguage: TodoLanguage = "zh";

export function setLanguage(language: TodoLanguage): void {
  currentLanguage = language;
}

export function getLanguage(): TodoLanguage {
  return currentLanguage;
}

export function isEnglish(): boolean {
  return currentLanguage === "en";
}

export function t(text: string): string {
  return currentLanguage === "en" ? (translations[text] || text) : text;
}

export function systemTagName(tag: { name: string; isDefault?: boolean }): string {
  return tag.isDefault ? t(tag.name) : tag.name;
}

export function localizeDom(root: HTMLElement): void {
  if (currentLanguage !== "en") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  for (const textNode of nodes) {
    const value = textNode.nodeValue?.trim();
    if (!value) continue;
    let translated = translations[value];
    if (!translated && value.startsWith("+ ")) {
      const tail = value.slice(2);
      const tailTranslation = translations[tail];
      if (tailTranslation) translated = "+ " + tailTranslation;
    }
    const dateMatch = value.match(/^我的一天 · (\d{1,2})月(\d{1,2})日$/);
    if (dateMatch) translated = `My Day · ${dateMatch[1]}/${dateMatch[2]}`;
    const myDayDateMatch = value.match(/^(\d{1,2})月(\d{1,2})日 (周日|周一|周二|周三|周四|周五|周六)( \(今天\))?$/);
    if (myDayDateMatch) {
      const dayName = translations[myDayDateMatch[3]] || myDayDateMatch[3];
      translated = `${myDayDateMatch[1]}/${myDayDateMatch[2]} ${dayName}${myDayDateMatch[4] ? " (Today)" : ""}`;
    }
    if (translated && textNode.nodeValue !== translated) textNode.nodeValue = textNode.nodeValue!.replace(value, translated);
  }
  root.querySelectorAll<HTMLElement>("[title], [aria-label], input[placeholder]").forEach((el) => {
    for (const attr of ["title", "aria-label", "placeholder"]) {
      const value = el.getAttribute(attr);
      if (value && translations[value]) el.setAttribute(attr, translations[value]);
    }
  });
}
