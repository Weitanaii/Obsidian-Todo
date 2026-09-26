import type { Task } from "../models/Task";
import type { TaskService } from "./TaskService";
import type { TagService } from "./TagService";
import type { ListService } from "./ListService";
import { extractLocalDate } from "../utils/recurrence";
import { getISOWeekRange } from "../utils/period";

export interface ReviewStats {
  completedCount: number;
  createdCount: number;
  completionRate: number;
  overdueCompleted: number;
  overdueActive: number;
  currentStreak: number;
  checkInDays: number;
  maxStreak: number;
  quadrantDist: Record<string, number>;
  domainDist: Record<string, number>;
  listDist: Record<string, number>;
  hourlyDist: number[];
  dailyTrend: { date: string; count: number; rate: number; uncompleted: number }[];
}

export interface StatusSummary {
  total: number;
  completed: number;
  active: number;
  shelved: number;
  abandoned: number;
  overdue: number;
  completionRate: number;
}

export class StatsService {
  private taskService: TaskService;
  private tagService: TagService;
  private listService: ListService;

  constructor(taskService: TaskService, tagService: TagService, listService: ListService) {
    this.taskService = taskService;
    this.tagService = tagService;
    this.listService = listService;
  }

  getStatusSummary(start: string, end: string): StatusSummary {
    const today = this.localToday();
    const tasks = this.taskService.getAll().filter((task) => {
      if (!this.isIncludedInStats(task) || task.isDeleted || task.isRecurrenceTemplate) return false;
      if (task.isCompleted && task.completedAt) {
        const completedDate = extractLocalDate(task.completedAt);
        return completedDate >= start && completedDate <= end;
      }
      if (!task.dueDate) return false;
      const dueDate = extractLocalDate(task.dueDate);
      return dueDate >= start && dueDate <= end;
    });
    const completed = tasks.filter((task) => task.isCompleted);
    const overdueTasks = tasks.filter((task) =>
      !task.isCompleted &&
      task.status === "active" &&
      task.dueDate &&
      extractLocalDate(task.dueDate) < today,
    );
    const overdueIds = new Set(overdueTasks.map((task) => task.id));
    const active = tasks.filter((task) => !task.isCompleted && task.status === "active" && !overdueIds.has(task.id));
    const shelved = tasks.filter((task) => !task.isCompleted && task.status === "shelved");
    const abandoned = tasks.filter((task) => !task.isCompleted && task.status === "abandoned");
    const overdue = overdueTasks.length;
    const denominator = completed.length + active.length + overdue;
    return {
      total: tasks.length,
      completed: completed.length,
      active: active.length,
      shelved: shelved.length,
      abandoned: abandoned.length,
      overdue,
      completionRate: denominator > 0 ? Math.round((completed.length / denominator) * 100) : 0,
    };
  }

  getDayStats(date: string): ReviewStats {
    const completed = this.getCompletedTasks(date, date);
    const allInPeriod = this.getAllInPeriod(date, date);
    const active = this.getActiveTasks();
    const today = this.localToday();
    const overdue = this.getOverdueTasks(today);
    const myDayTasks = this.taskService.getAll().filter(t => this.isIncludedInStats(t) && t.myDayDate === date);
    const myDayCompleted = myDayTasks.filter(t => t.isCompleted && t.completedAt && extractLocalDate(t.completedAt) === date).length;

    const completedCount = completed.length;
    const createdCount = allInPeriod.filter(t => extractLocalDate(t.createdAt) === date).length;
    const denom = completedCount + active.length;
    const completionRate = denom > 0 ? completedCount / denom : 0;
    const overdueCompleted = completed.filter(t => t.dueDate && t.completedAt && extractLocalDate(t.dueDate) < extractLocalDate(t.completedAt)).length;
    const overdueActive = overdue.length;
    const currentStreak = this.calcStreak(date);
    const uniqueDays = new Set(completed.map(t => extractLocalDate(t.completedAt!)));
    const checkInDays = uniqueDays.size;
    const { quadrantDist, domainDist, listDist, hourlyDist } = this.calcDistributions(completed);
    const dailyTrend = this.calcDailyTrend(date, date, completed);

    return { completedCount, createdCount, completionRate, overdueCompleted, overdueActive, currentStreak, checkInDays, maxStreak: 0, quadrantDist, domainDist, listDist, hourlyDist, dailyTrend };
  }

  getWeekStats(year: number, week: number): ReviewStats {
    const range = getISOWeekRange(year, week);
    const start = this.dateToStr(range.start);
    const end = this.dateToStr(range.end);
    const completed = this.getCompletedTasks(start, end);
    const allInPeriod = this.getAllInPeriod(start, end);
    const active = this.getActiveTasks();
    const today = this.localToday();
    const overdue = this.getOverdueTasks(today);
    const completedCount = completed.length;
    const createdCount = allInPeriod.filter(t => { const d = extractLocalDate(t.createdAt); return d >= start && d <= end; }).length;
    const denom = completedCount + active.length;
    const completionRate = denom > 0 ? completedCount / denom : 0;
    const overdueCompleted = completed.filter(t => t.dueDate && t.completedAt && extractLocalDate(t.dueDate) < extractLocalDate(t.completedAt)).length;
    const overdueActive = overdue.length;
    const currentStreak = this.calcStreak(today);
    const uniqueDays = new Set(completed.map(t => extractLocalDate(t.completedAt!)));
    const checkInDays = uniqueDays.size;
    const maxStreak = this.calcMaxStreak(start, end);
    const { quadrantDist, domainDist, listDist, hourlyDist } = this.calcDistributions(completed);
    const dailyTrend = this.calcDailyTrend(start, end, completed);
    return { completedCount, createdCount, completionRate, overdueCompleted, overdueActive, currentStreak, checkInDays, maxStreak, quadrantDist, domainDist, listDist, hourlyDist, dailyTrend };
  }

  getMonthStats(year: number, month: number): ReviewStats {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    const start = this.dateToStr(startDate);
    const end = this.dateToStr(endDate);
    const completed = this.getCompletedTasks(start, end);
    const allInPeriod = this.getAllInPeriod(start, end);
    const active = this.getActiveTasks();
    const today = this.localToday();
    const overdue = this.getOverdueTasks(today);
    const completedCount = completed.length;
    const createdCount = allInPeriod.filter(t => { const d = extractLocalDate(t.createdAt); return d >= start && d <= end; }).length;
    const denom = completedCount + active.length;
    const completionRate = denom > 0 ? completedCount / denom : 0;
    const overdueCompleted = completed.filter(t => t.dueDate && t.completedAt && extractLocalDate(t.dueDate) < extractLocalDate(t.completedAt)).length;
    const overdueActive = overdue.length;
    const currentStreak = this.calcStreak(today);
    const uniqueDays = new Set(completed.map(t => extractLocalDate(t.completedAt!)));
    const checkInDays = uniqueDays.size;
    const maxStreak = this.calcMaxStreak(start, end);
    const { quadrantDist, domainDist, listDist, hourlyDist } = this.calcDistributions(completed);
    const dailyTrend = this.calcDailyTrend(start, end, completed);
    return { completedCount, createdCount, completionRate, overdueCompleted, overdueActive, currentStreak, checkInDays, maxStreak, quadrantDist, domainDist, listDist, hourlyDist, dailyTrend };
  }

  getYearStats(year: number): ReviewStats {
    const start = year + "-01-01";
    const end = year + "-12-31";
    const completed = this.getCompletedTasks(start, end);
    const allInPeriod = this.getAllInPeriod(start, end);
    const active = this.getActiveTasks();
    const today = this.localToday();
    const overdue = this.getOverdueTasks(today);
    const completedCount = completed.length;
    const createdCount = allInPeriod.filter(t => { const d = extractLocalDate(t.createdAt); return d >= start && d <= end; }).length;
    const denom = completedCount + active.length;
    const completionRate = denom > 0 ? completedCount / denom : 0;
    const overdueCompleted = completed.filter(t => t.dueDate && t.completedAt && extractLocalDate(t.dueDate) < extractLocalDate(t.completedAt)).length;
    const overdueActive = overdue.length;
    const currentStreak = this.calcStreak(today);
    const uniqueDays = new Set(completed.map(t => extractLocalDate(t.completedAt!)));
    const checkInDays = uniqueDays.size;
    const maxStreak = this.calcMaxStreak(start, end);
    const { quadrantDist, domainDist, listDist, hourlyDist } = this.calcDistributions(completed);
    const dailyTrend = this.calcDailyTrend(start, end, completed);
    return { completedCount, createdCount, completionRate, overdueCompleted, overdueActive, currentStreak, checkInDays, maxStreak, quadrantDist, domainDist, listDist, hourlyDist, dailyTrend };
  }

  calcStreak(fromDate: string): number {
    let streak = 0;
    const allTasks = this.taskService.getAllIncludingDeleted();
    const d = new Date(fromDate + "T00:00:00");
    while (true) {
      const dateStr = this.dateToStr(d);
      const hasCompleted = allTasks.some(t => this.isIncludedInStats(t) && t.isCompleted && !t.isDeleted && !t.isRecurrenceTemplate && t.completedAt && extractLocalDate(t.completedAt) === dateStr);
      if (!hasCompleted) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  calcMaxStreak(startDate: string, endDate: string): number {
    let maxStreak = 0;
    let current = 0;
    const d = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const allTasks = this.taskService.getAllIncludingDeleted();
    while (d <= end) {
      const dateStr = this.dateToStr(d);
      const hasCompleted = allTasks.some(t => this.isIncludedInStats(t) && t.isCompleted && !t.isDeleted && !t.isRecurrenceTemplate && t.completedAt && extractLocalDate(t.completedAt) === dateStr);
      if (hasCompleted) { current++; if (current > maxStreak) maxStreak = current; } else { current = 0; }
      d.setDate(d.getDate() + 1);
    }
    return maxStreak;
  }

  private getCompletedTasks(start: string, end: string): Task[] {
    return this.taskService.getAllIncludingDeleted().filter(t =>
      this.isIncludedInStats(t) && t.isCompleted && !t.isDeleted && !t.isRecurrenceTemplate && t.completedAt &&
      (() => { const d = extractLocalDate(t.completedAt); return d >= start && d <= end; })()
    );
  }

  private getAllInPeriod(start: string, end: string): Task[] {
    return this.taskService.getAllIncludingDeleted().filter(t =>
      this.isIncludedInStats(t) && !t.isDeleted && !t.isRecurrenceTemplate &&
      (() => { const d = extractLocalDate(t.createdAt); return d >= start && d <= end; })()
    );
  }

  private getActiveTasks(): Task[] {
    return this.taskService.getAll().filter(t => this.isIncludedInStats(t) && !t.isCompleted);
  }

  private getOverdueTasks(beforeDate: string): Task[] {
    return this.taskService.getAll().filter(t =>
      this.isIncludedInStats(t) && !t.isCompleted && t.dueDate && extractLocalDate(t.dueDate) < beforeDate
    );
  }

  private calcDistributions(completed: Task[]): { quadrantDist: Record<string, number>; domainDist: Record<string, number>; listDist: Record<string, number>; hourlyDist: number[] } {
    const quadrantDist: Record<string, number> = {};
    const domainDist: Record<string, number> = {};
    const listDist: Record<string, number> = {};
    const hourlyDist: number[] = Array(24).fill(0);
    for (const task of completed) {
      const qTag = task.tags.find(tid => { const tag = this.tagService.getById(tid); return tag && tag.sortOrder < 4; });
      const qName = qTag ? (this.tagService.getById(qTag)?.name ?? "\u672a\u5206\u7c7b") : "\u672a\u5206\u7c7b";
      quadrantDist[qName] = (quadrantDist[qName] || 0) + 1;
      const dTag = task.tags.find(tid => { const tag = this.tagService.getById(tid); return tag && tag.sortOrder >= 4; });
      const dName = dTag ? (this.tagService.getById(dTag)?.name ?? "\u672a\u5206\u7c7b") : "\u672a\u5206\u7c7b";
      domainDist[dName] = (domainDist[dName] || 0) + 1;
      const list = this.listService.getById(task.listId);
      const listName = list ? list.name : "\u672a\u77e5\u5217\u8868";
      listDist[listName] = (listDist[listName] || 0) + 1;
      if (task.completedAt) { const h = new Date(task.completedAt).getHours(); hourlyDist[h]++; }
    }
    return { quadrantDist, domainDist, listDist, hourlyDist };
  }

  private calcDailyTrend(start: string, end: string, completed: Task[]): { date: string; count: number; rate: number; uncompleted: number }[] {
    const trend: { date: string; count: number; rate: number; uncompleted: number }[] = [];
    const d = new Date(start + "T00:00:00");
    const endDate = new Date(end + "T00:00:00");
    const allTasks = this.taskService.getAll().filter(t => this.isIncludedInStats(t));
    while (d <= endDate) {
      const dateStr = this.dateToStr(d);
      const dayCompleted = completed.filter(t => t.completedAt && extractLocalDate(t.completedAt) === dateStr).length;
      const dayUncompleted = allTasks.filter(t => t.dueDate && extractLocalDate(t.dueDate) === dateStr && (!t.isCompleted || (t.completedAt && extractLocalDate(t.completedAt) > dateStr))).length;
      const denom = dayCompleted + dayUncompleted;
      trend.push({ date: dateStr, count: dayCompleted, rate: denom > 0 ? dayCompleted / denom : 0, uncompleted: dayUncompleted });
      d.setDate(d.getDate() + 1);
    }
    return trend;
  }

  private localToday(): string {
    const now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  }

  private isIncludedInStats(task: Task): boolean {
    return task.planKind !== "life";
  }

  private dateToStr(d: Date): string {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
}
