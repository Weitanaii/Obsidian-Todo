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
  "编辑列表": "Edit List",
  "列表名称": "List name",
  "列表标签": "List tags",
  "输入列表名称...": "Enter list name...",
  "选择图标": "Choose icon",
  "搜索图标...": "Search icons...",
  "没有匹配的图标": "No matching icons",
  "创建": "Create",
  "新建分组": "New Group",
  "设置": "Settings",
  "统计": "Statistics",
  "复盘": "Review",
  "回收站": "Trash",
  "今天": "Today",
  "取消": "Cancel",
  "确认": "Confirm",
  "是否将新的时间同步到后续未完成的重复任务？": "Sync the new time with future incomplete recurring tasks?",
  "同步后续任务": "Sync future tasks",
  "仅修改当前任务": "Only update this task",
  "释放以创建同名月度目标": "Drop to create a matching monthly goal",
  "是否为当前月份创建同名月度目标，并关联此季度目标？": "Create a matching monthly goal for this month and link it to this quarterly goal?",
  "创建月度目标": "Create monthly goal",
  "该季度目标已关联当前月份目标": "This quarterly goal is already linked to a goal for this month",
  "保存": "Save",
  "关闭": "Close",
  "暂无任务": "No tasks",
  "编辑": "Edit",
  "编辑标签": "Edit Tag",
  "新增标签": "New Tag",
  "名称": "Name",
  "标签名称": "Tag name",
  "图标": "Icon",
  "颜色": "Color",
  "删除": "Delete",
  "已搁置": "Shelved",
  "已放弃": "Abandoned",
  "搁置": "Shelve",
  "放弃": "Abandon",
  "搁置任务": "Shelve task",
  "放弃任务": "Abandon task",
  "恢复为进行中": "Restore to active",
  "搁置目标": "Shelve goal",
  "放弃目标": "Abandon goal",
  "恢复": "Restore",
  "移动到列表...": "Move to list...",
  "移动到季度...": "Move to quarter...",
  "移动到周...": "Move to week...",
  "添加到我的计划": "Add to My Plans",
  "添加到本周计划": "Add to This Week's Plan",
  "添加到本月计划": "Add to This Month's Plan",
  "添加到本季度计划": "Add to This Quarter's Plan",
  "添加到本年度计划": "Add to This Year's Plan",
  "返回": "Back",
  "未分组": "Ungrouped",
  "按重要程度": "By Importance",
  "按截止日期": "By Due Date",
  "按创建时间": "By Created Time",
  "按标题": "By Title",
  "AI 推荐": "AI Suggestions",
  "AI 推荐功能即将推出": "AI suggestions are coming soon",
  "AI 周计划推荐功能即将推出": "AI weekly plan suggestions are coming soon",
  "AI 日待办推荐": "AI daily task suggestions",
  "AI 周待办推荐": "AI weekly task suggestions",
  "已加入我的一天": "Added to My Day",
  "已选周待办": "Selected weekly tasks",
  "AI 候选": "AI candidates",
  "刷新候选": "Refresh candidates",
  "加入我的一天": "Add to My Day",
  "写入周计划": "Add to Week Plan",
  "正在生成推荐...": "Generating suggestions...",
  "暂无可生成的周待办": "No weekly tasks can be generated",
  "暂无新的推荐任务": "No new task suggestions",
  "AI 推荐失败，请稍后重试": "AI suggestions failed. Please try again later.",
  "当前月份没有月度目标，请先创建月度目标": "This month has no monthly goal. Create one first.",
  "预计时间": "Estimated time",
  "父任务": "Parent task",
  "加入": "Add",
  "移除推荐": "Remove suggestion",
  "刷新推荐": "Refresh suggestions",
  "长任务已拆分为连续日任务。": "Long task split into consecutive daily tasks.",
  "长任务将需要拆分或跨天安排。": "This long task needs to be split or scheduled across days.",
  "重要任务优先": "Important task prioritized",
  "根据截止日期和未完成状态推荐": "Recommended based on due date and incomplete status",
  "按周次、前置顺序和容量均衡拆分": "Split by week order, dependencies, and balanced capacity",
  "围绕月度目标": "Around the monthly goal",
  "请先选择至少一个推荐": "Select at least one suggestion first",
  "已保存": "Saved",
  "日推荐只能创建普通任务": "Daily suggestions can only create regular tasks",
  "跳过重复或无效项": "duplicate or invalid items skipped",
  "AI 规划": "AI Planning",
  "控制 AI 推荐的每日和每周容量": "Controls daily and weekly capacity for AI suggestions",
  "计划强度": "Planning intensity",
  "轻量": "Light",
  "稳健": "Balanced",
  "高强度": "High",
  "轻量、稳健或高强度会影响推荐任务容量，不会改变任务优先级": "Light, balanced, or high changes capacity without changing task priority",
  "添加任务...": "Add task...",
  "显示农历": "Show lunar calendar",
  "在日历、日程视图和日期选择器中显示农历日期、节日和节气": "Show lunar dates, festivals, and solar terms in calendars, schedules, and date pickers",
  "语言": "Language",
  "选择插件界面语言": "Choose the plugin interface language",
  "中文": "Chinese",
  "英文": "English",
  "基本设置": "Basic Settings",
  "显示设置": "Display Settings",
  "界面显示选项": "Interface display options",
  "插件核心配置": "Core plugin configuration",
  "数据存储文件夹": "Data folder",
  "任务数据文件存储在 Vault 中的文件夹路径": "Folder in the Vault where task data is stored",
  "默认列表名称": "Default list name",
  "首次运行时自动创建的默认列表名称": "Default list name created on first run",
  "生日": "Birthday",
  "任务管理插件设置": "Task management plugin settings",
  "用于人生计划视图计算年龄（格式：YYYY-MM-DD）": "Used to calculate age in the life plan view (YYYY-MM-DD)",
  "标签管理": "Tag Management",
  "任务分类与标签配置": "Task categories and tag configuration",
  "四象限标签": "Quadrant Tags",
  "领域标签": "Domain Tags",
  "自定义标签": "Custom Tags",
  "用于四象限视图的任务分类": "Task categories used by the quadrant view",
  "用于人生领域维度的任务分类": "Task categories used for life domains",
  "自由创建的个性化标签": "Custom personal tags",
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
  "删除所有任务数据，保留列表和标签配置": "Delete all task data while keeping lists and tag settings",
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
  "全部": "All",
  "状态筛选": "Status filter",
  "已过去": "Past",
  "当前": "Current",
  "未来": "Future",
  "清空回收站": "Empty Trash",
  "回收站是空的": "Trash is empty",
  "已删除的任务将保留 30 天，之后自动清理": "Deleted tasks are kept for 30 days, then automatically cleared",
  "彻底删除": "Delete permanently",
  "删除于": "Deleted on",
  "共": "Total",
  "个任务": " tasks",
  "确定永久删除回收站中的任务吗？此操作不可撤销。": "Permanently delete the tasks in the trash? This action cannot be undone.",
  "确定永久删除吗？此操作不可撤销。": "Permanently delete this task? This action cannot be undone.",
  "没有任务": "No tasks",
  "还没有列表": "No lists yet",
  "今天还没有安排": "Nothing planned for today",
  "从下方输入一个任务，或从其它列表把重要事项加入今天计划。": "Enter a task below, or add an important item from another list to today's plan.",
  "添加一个今日任务": "Add today's task",
  "还没有任务": "No tasks yet",
  "在输入框里写下第一件要做的事，按回车即可创建。": "Write the first thing to do in the input box and press Enter to create it.",
  "立即创建任务": "Create a task now",
  "任务是空的": "Tasks is empty",
  "将任务从其他列表移动到此处，或右键任务选择“移动到任务”。": "Move tasks here from another list, or right-click a task and choose \"Move to Tasks\".",
  "当前列表是空的": "This list is empty",
  "给这个清单起一个明确目标，然后先添加第一件最小行动项。": "Give this list a clear goal, then add the first small action.",
  "为当前列表新增任务": "Add a task to this list",
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
  "年": "Year",
  "季度计划": "Quarter Plan",
  "周计划": "Week Plan",
  "统计分布": "Statistics",
  "今日任务": "Today's Tasks",
  "今日完成": "Completed Today",
  "昨日逾期": "Overdue Yesterday",
  "本周任务": "This Week's Tasks",
  "本周完成": "Completed This Week",
  "逾期任务": "Overdue Tasks",
  "本月任务": "This Month's Tasks",
  "本月完成": "Completed This Month",
  "本年完成": "Completed This Year",
  "完成": "Completed",
  "四象限分布": "Quadrant Distribution",
  "领域分布": "Domain Distribution",
  "每日任务趋势": "Daily Task Trend",
  "月度打卡": "Monthly Activity",
  "每周任务趋势": "Weekly Task Trend",
  "年度打卡": "Yearly Activity",
  "每月任务趋势": "Monthly Task Trend",
  "本年任务": "This Year's Tasks",
  "没有目标": "No goals",
  "添加目标": "Add goal",
  "新建人生目标...": "New life goal...",
  "新建年度目标...": "New yearly goal...",
  "新建月度目标...": "New monthly goal...",
  "新建任务...": "New task...",
  "添加任务到我的一天...": "Add task to My Day...",
  "添加任务到任务...": "Add task to Tasks...",
  "添加任务到当前列表...": "Add task to current list...",
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
  "输入新名称": "Enter a new name",
  "输入任务标题": "Enter task title",
  "确定删除列表吗？": "Delete this list?",
  "确定删除分组吗？组内列表将变为未分组。": "Delete this group? Its lists will become ungrouped.",
  "确定删除标签吗？": "Delete this tag?",
  "将删除个未完成实例，已完成的保留。确定继续？": "Uncompleted instances will be deleted while completed ones are kept. Continue?",
  "任务有个子任务，删除后子任务也将被删除。确定继续？": "This task has child tasks, which will also be deleted. Continue?",
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
  if (currentLanguage !== "en") return text;
  if (translations[text]) return translations[text];
  let match = text.match(/^确定删除[「『](.+?)[」』]吗？列表中的任务也会被删除。$/);
  if (match) return `Delete "${match[1]}"? All tasks in this list will also be deleted.`;
  match = text.match(/^确定删除列表[「『](.+?)[」』]？$/);
  if (match) return `Delete list "${match[1]}"?`;
  match = text.match(/^确定删除分组[「『](.+?)[」』]？组内列表将变为未分组。$/);
  if (match) return `Delete group "${match[1]}"? Its lists will become ungrouped.`;
  match = text.match(/^确定删除标签[「『](.+?)[」』]吗？$/);
  if (match) return `Delete tag "${match[1]}"?`;
  match = text.match(/^即将删除 (\d+) 个任务，此操作不可撤销。确认清空吗？$/);
  if (match) return `About to delete ${match[1]} tasks. This action cannot be undone. Empty all tasks?`;
  if (text === "即将重置所有数据（任务、列表、标签、分组），此操作不可撤销。确认重置吗？") return "About to reset all data (tasks, lists, tags, and groups). This action cannot be undone. Reset everything?";
  match = text.match(/^将删除 (\d+) 个未完成实例，已完成的保留。确定继续？$/);
  if (match) return `This will delete ${match[1]} incomplete instances while keeping completed ones. Continue?`;
  match = text.match(/^任务[「『](.+?)[」』]有 (\d+) 个子任务，删除后子任务也将被删除。确定继续？$/);
  if (match) return `Task "${match[1]}" has ${match[2]} child tasks, which will also be deleted. Continue?`;
  return text;
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
