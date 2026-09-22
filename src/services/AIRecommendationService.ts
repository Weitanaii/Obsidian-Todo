import type { Task, MyDayGroup, PlanKind } from "../models/Task";
import { extractLocalDate } from "../utils/recurrence";
import { getISOWeekRange, getSubPeriodKeysForParent } from "../utils/period";

export type PlanningIntensity = "light" | "balanced" | "high";

export interface AIRecommendation {
  id: string;
  title: string;
  note: string;
  listId: string;
  tags: string[];
  isImportant: boolean;
  durationMinutes: number;
  myDayDate?: string;
  myDayGroup?: MyDayGroup;
  startDate?: string | null;
  dueDate?: string | null;
  planKind?: PlanKind;
  planPeriodKey?: string;
  parentId?: string;
  weekStart?: string;
  weekEnd?: string;
  sourceTaskId?: string;
  reason?: string;
  warning?: string;
}

export interface RecommendationContext {
  tasks: Task[];
  date?: string;
  monthKey?: string;
  intensity: PlanningIntensity;
}

export interface AIProvider {
  recommendMyDay(context: RecommendationContext): Promise<AIRecommendation[]>;
  recommendMonthWeeks(context: RecommendationContext): Promise<AIRecommendation[]>;
}

const CAPACITY: Record<PlanningIntensity, { day: number; week: number }> = {
  light: { day: 240, week: 1200 },
  balanced: { day: 360, week: 1800 },
  high: { day: 480, week: 2400 },
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function estimateDuration(task: Pick<Task, "title" | "note">): number {
  const text = (task.title + " " + task.note).toLowerCase();
  if (/五小时|5小时|半天|全天|multiple clients|客户|项目|研究|深度|报告|搬家|travel/.test(text)) return 300;
  if (/运动|跑步|健身|workout|exercise/.test(text)) return 60;
  if (/会议|沟通|电话|meeting|call/.test(text)) return 45;
  if (/整理|收拾|回复|邮件|email|clean|review/.test(text)) return 30;
  return 60;
}

function groupForTitle(title: string): MyDayGroup {
  const text = title.toLowerCase();
  if (/运动|跑步|健身|exercise|workout/.test(text)) return "afternoon";
  if (/整理|收拾|回复|邮件|email|行政/.test(text)) return "evening";
  if (/会议|沟通|电话|meeting|call/.test(text)) return "afternoon";
  return "morning";
}

function toDateOnly(date: Date): string {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function addDays(date: string, days: number): string {
  const parts = date.split("-").map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + days);
  return toDateOnly(d);
}

function isSimilar(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na));
}

export class LocalAIProvider implements AIProvider {
  async recommendMyDay(context: RecommendationContext): Promise<AIRecommendation[]> {
    const date = context.date ?? toDateOnly(new Date());
    const current = context.tasks.filter((task) => !task.isDeleted && !task.isCompleted);
    const existing = current.filter((task) => task.myDayDate === date);
    const capacity = CAPACITY[context.intensity].day;
    let used = existing.reduce((sum, task) => sum + estimateDuration(task), 0);
    const result: AIRecommendation[] = [];
    const sorted = current
      .filter((task) => task.myDayDate !== date && (!task.planKind || task.planKind === "week"))
      .sort((a, b) => {
        const importance = Number(b.isImportant) - Number(a.isImportant);
        if (importance) return importance;
        const ad = a.dueDate ? extractLocalDate(a.dueDate) : "9999-99-99";
        const bd = b.dueDate ? extractLocalDate(b.dueDate) : "9999-99-99";
        return ad.localeCompare(bd);
      });
    for (const task of sorted) {
      if (result.length >= 5) break;
      const duration = estimateDuration(task);
      const segmentCount = Math.max(1, Math.ceil(duration / 90));
      if (used + Math.min(duration, 90) > capacity) continue;
      const group = groupForTitle(task.title);
      for (let segment = 0; segment < segmentCount && result.length < 5; segment++) {
        const segmentDate = addDays(date, segment);
        const segmentMinutes = Math.min(90, duration - segment * 90);
        const title = segmentCount > 1 ? `${task.title} · ${segment + 1}/${segmentCount}` : task.title;
        result.push({
          id: crypto.randomUUID(), title, note: task.note, listId: task.listId, tags: [...task.tags],
          isImportant: task.isImportant, durationMinutes: segmentMinutes, myDayDate: segmentDate, myDayGroup: group,
          startDate: segmentDate + (group === "morning" ? "T09:00:00" : group === "afternoon" ? "T14:00:00" : "T18:00:00"),
          dueDate: segmentDate + (group === "morning" ? "T10:00:00" : group === "afternoon" ? "T15:00:00" : "T19:00:00"),
          parentId: task.planKind === "week" ? task.id : task.parentId,
          sourceTaskId: segmentCount === 1 && task.planKind !== "week" ? task.id : undefined,
          reason: task.isImportant ? "重要任务优先" : "根据截止日期和未完成状态推荐",
          warning: segmentCount > 1 ? "长任务已拆分为连续日任务。" : undefined,
        });
      }
      used += Math.min(duration, 90);
    }
    return result;
  }

  async recommendMonthWeeks(context: RecommendationContext): Promise<AIRecommendation[]> {
    if (!context.monthKey) return [];
    const monthGoals = context.tasks.filter((task) => task.planKind === "month" && task.planPeriodKey === context.monthKey && !task.isDeleted);
    if (!monthGoals.length) return [];
    const weekKeys = getSubPeriodKeysForParent("month", context.monthKey);
    const result: AIRecommendation[] = [];
    const existingWeeks = context.tasks.filter((task) => task.planKind === "week" && !task.isDeleted);
    const max = Math.min(5, weekKeys.length);
    for (let i = 0; i < max; i++) {
      const weekKey = weekKeys[i];
      const goal = monthGoals[i % monthGoals.length];
      const rangeParts = weekKey.split("-W");
      const range = getISOWeekRange(Number(rangeParts[0]), Number(rangeParts[1]));
      const start = toDateOnly(range.start);
      const end = toDateOnly(range.end);
      const title = `${goal.title} · 第${i + 1}周行动`;
      const duplicate = existingWeeks.some((task) => task.planPeriodKey === weekKey && isSimilar(task.title, title));
      if (duplicate) continue;
      result.push({
        id: crypto.randomUUID(), title, note: `围绕月度目标“${goal.title}”推进本周关键行动。`, listId: goal.listId,
        tags: [...goal.tags], isImportant: goal.isImportant, durationMinutes: 300, planKind: "week", planPeriodKey: weekKey,
        weekStart: start, weekEnd: end, parentId: goal.id, reason: "按周次、前置顺序和容量均衡拆分",
      });
    }
    return result;
  }
}

export function validateRecommendation(item: AIRecommendation): string | null {
  if (!item.title.trim()) return "任务标题不能为空";
  if (item.durationMinutes <= 0 || item.durationMinutes > 1440) return "任务时长不合法";
  if (item.planKind === "week" && (!item.planPeriodKey || !item.weekStart || !item.weekEnd)) return "周任务缺少周期信息";
  if (item.myDayDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.myDayDate)) return "日期格式不合法";
  return null;
}

export { CAPACITY, estimateDuration, isSimilar, addDays };
