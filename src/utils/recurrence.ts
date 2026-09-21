// 重复任务日期计算工具

/** 将 ISO 日期字符串解析为本地日期组件（兼容 UTC 和本地格式） */
export function parseLocalDate(isoStr: string): { y: number; m: number; d: number } {
  if (!isoStr) { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() }; }
  // 兼容 "2026-09-14T06:00:00"（本地）和 "2026-09-13T20:00:00Z"（UTC）
  const dt = new Date(isoStr);
  const local = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  // 如果解析结果和直接解析差>=12小时，说明是UTC格式，需要修正
  const direct = new Date(isoStr.substring(0, 10) + "T00:00:00");
  const diffHours = Math.abs(dt.getTime() - direct.getTime()) / 3600000;
  if (diffHours > 12) {
    // UTC 格式，用 UTC 方法提取日期再构造本地 Date
    const utcDate = new Date(isoStr);
    const ld = new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
    return { y: ld.getFullYear(), m: ld.getMonth(), d: ld.getDate() };
  }
  return { y: local.getFullYear(), m: local.getMonth(), d: local.getDate() };
}

/** 将本地日期组件格式化为 ISO 日期字符串（无时区后缀） */
export function formatDateStr(y: number, m: number, d: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return y + "-" + pad(m + 1) + "-" + pad(d);
}

/** 从 ISO 日期字符串中提取本地日期部分 "YYYY-MM-DD" */
export function extractLocalDate(isoStr: string): string {
  if (!isoStr) return "";
  const { y, m, d } = parseLocalDate(isoStr);
  return formatDateStr(y, m, d);
}

/**
 * 计算下一次重复日期
 * @param fromDate 起算日期（本地时间 Date）
 * @param recurrence 重复规则字符串
 */
export function getNextOccurrenceDate(fromDate: Date, recurrence: string): Date {
  if (recurrence === "daily") return addDays(fromDate, 1);
  if (recurrence === "weekly") return addDays(fromDate, 7);
  if (recurrence === "monthly") return addMonthsClamp(fromDate, 1);
  if (recurrence === "yearly") return addYearsClamp(fromDate, 1);
  if (recurrence === "lunar-yearly" || recurrence === "lunar-monthly") return getNextLunarOccurrence(fromDate, recurrence);

  if (recurrence.startsWith("custom:")) {
    const parts = recurrence.split(":");
    const n = parseInt(parts[1], 10) || 1;
    const unit = parts[2];
    if (unit === "day") return addDays(fromDate, n);
    if (unit === "week") return addDays(fromDate, n * 7);
    if (unit === "month") return addMonthsClamp(fromDate, n);
    if (unit === "year") return addYearsClamp(fromDate, n);
  }

  return addDays(fromDate, 1);
}

/**
 * 获取预生成实例数量
 */
export function getPreGenerateCount(recurrence: string): number {
  if (recurrence === "daily") return 28;
  if (recurrence === "weekly") return 8;
  if (recurrence === "monthly") return 6;
  if (recurrence === "yearly") return 2;

  if (recurrence.startsWith("custom:")) {
    const parts = recurrence.split(":");
    const n = parseInt(parts[1], 10) || 1;
    const unit = parts[2];
    if (unit === "day") return Math.min(28, Math.ceil(28 / n));
    if (unit === "week") return Math.min(8, Math.ceil(8 / n));
    if (unit === "month") return Math.min(6, Math.ceil(6 / n));
    if (unit === "year") return Math.min(2, Math.ceil(2 / n));
  }

  if (recurrence === "lunar-yearly" || recurrence === "lunar-monthly") return getLunarPreGenerateCount(recurrence);
  return 28;
}

/**
 * 格式化重复规则的显示文案
 */
export function formatRecurrenceDisplay(rec: string): string {
  const map: Record<string, string> = { daily: "每天", weekly: "每周", monthly: "每月", yearly: "每年", "lunar-yearly": "每年（农历）", "lunar-monthly": "每月（农历）" };
  if (map[rec]) return map[rec];
  if (rec.startsWith("custom:")) {
    const parts = rec.split(":");
    const n = parseInt(parts[1], 10) || 1;
    const unitMap: Record<string, string> = { day: "天", week: "周", month: "月", year: "年" };
    const unit = unitMap[parts[2]] || parts[2];
    return "每" + n + unit;
  }
  return rec;
}

// ===== 内部辅助函数（统一本地时间） =====

function addDays(d: Date, n: number): Date {
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  result.setDate(result.getDate() + n);
  return result;
}

function addMonthsClamp(d: Date, n: number): Date {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const targetM = m + n;
  const lastDay = new Date(y, targetM + 1, 0).getDate();
  return new Date(y, targetM, Math.min(day, lastDay));
}

function addYearsClamp(d: Date, n: number): Date {
  const y = d.getFullYear() + n;
  const m = d.getMonth();
  const day = d.getDate();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, lastDay));
}

// ===== 农历重复日期计算 =====

import { Solar, Lunar } from "lunar-typescript";

/**
 * 从公历日期反推农历月/日，再计算下一次该农历日期对应的公历日期
 * @param fromDate 起算公历日期（本地）
 * @param type "lunar-yearly" 每年 | "lunar-monthly" 每月
 */
export function getNextLunarOccurrence(fromDate: Date, type: string): Date {
  const solar = Solar.fromYmd(fromDate.getFullYear(), fromDate.getMonth() + 1, fromDate.getDate());
  const lunar = solar.getLunar();
  const lunarMonth = lunar.getMonth();
  const lunarDay = lunar.getDay();

  if (type === "lunar-monthly") {
    // 从 fromDate 的下一天开始，找下一个相同农历日
    const search = addDays(fromDate, 1);
    for (let i = 0; i < 40; i++) {
      const s = Solar.fromYmd(search.getFullYear(), search.getMonth() + 1, search.getDate());
      const l = s.getLunar();
      if (l.getMonth() === lunarMonth && l.getDay() === lunarDay) return search;
      search.setDate(search.getDate() + 1);
    }
    return addDays(fromDate, 30); // fallback
  }

  // lunar-yearly: 从下一年的正月初一往前找
  const nextYear = fromDate.getFullYear() + 1;
  // 尝试直接转换（lunar-typescript 处理闰月：如果该年无此农历月，取最近有效日期）
  try {
    const targetSolar = Lunar.fromYmd(nextYear, lunarMonth, lunarDay).getSolar();
    return new Date(targetSolar.getYear(), targetSolar.getMonth() - 1, targetSolar.getDay());
  } catch {
    // 该年无对应农历日期（闰月缺失），fallback 到公历 +1 年
    return addYearsClamp(fromDate, 1);
  }
}

/** 获取农历重复的预生成数量 */
export function getLunarPreGenerateCount(type: string): number {
  return type === "lunar-monthly" ? 6 : 2;
}