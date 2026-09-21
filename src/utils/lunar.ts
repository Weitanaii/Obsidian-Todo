import { Solar } from "lunar-typescript";

/** 允许显示的公历节日白名单 */
const SOLAR_FESTIVAL_WHITELIST = new Set([
  "元旦", "情人节", "妇女节", "劳动节", "青年节", "儿童节",
  "建党节", "建军节", "教师节", "国庆节", "万圣夜", "万圣节",
  "平安夜", "圣诞节", "母亲节", "父亲节",
]);

/**
 * 获取农历显示文本（用于日历格子等紧凑场景）
 * 优先级：农历节日 > 中元节 > 公历节日 > 节气 > 农历日期
 * 农历初一显示月份名（如"正月"、"腊月"），其余显示日期（如"初八"、"十五"）
 */
export function getLunarDisplayText(year: number, month: number, day: number): string {
  const solar = Solar.fromYmd(year, month, day);
  const lunar = solar.getLunar();

  // 农历节日（春节、中秋、端午等）
  const lunarFestivals = lunar.getFestivals();
  if (lunarFestivals.length > 0) return lunarFestivals[0];

  // 农历其他节日（仅保留中元节）
  if (lunar.getMonth() === 7 && lunar.getDay() === 15) {
    const otherFestivals = lunar.getOtherFestivals();
    if (otherFestivals.length > 0) return otherFestivals[0];
  }

  // 公历节日（仅白名单）
  const solarFestivals = solar.getFestivals().filter(f => SOLAR_FESTIVAL_WHITELIST.has(f));
  if (solarFestivals.length > 0) return solarFestivals[0];

  // 节气
  const jieQi = lunar.getJieQi();
  if (jieQi) return jieQi;

  // 农历日期：初一显示月份名
  const lunarDay = lunar.getDay();
  if (lunarDay === 1) {
    return lunar.getMonthInChinese() + "月";
  }
  return lunar.getDayInChinese();
}

/**
 * 判断是否为节日或节气（用于特殊样式高亮）
 */
export function isLunarSpecialDay(year: number, month: number, day: number): boolean {
  const solar = Solar.fromYmd(year, month, day);
  const lunar = solar.getLunar();
  return lunar.getFestivals().length > 0
    || (lunar.getMonth() === 7 && lunar.getDay() === 15)
    || solar.getFestivals().filter(f => SOLAR_FESTIVAL_WHITELIST.has(f)).length > 0
    || !!lunar.getJieQi();
}