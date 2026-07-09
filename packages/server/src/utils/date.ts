/**
 * 日期工具
 *
 * 统一处理"今日日期"的获取，确保整个项目中
 * execute.ts / query.ts / pipeline.ts 等模块使用同一套日期逻辑。
 *
 * 时区通过 FI_POOL_TIMEZONE 环境变量配置，默认 Asia/Shanghai。
 *
 * @module utils/date
 */

/**
 * 获取今日日期字符串（yyyy-MM-dd 格式）。
 *
 * 使用 Intl.DateTimeFormat + 可配置时区，避免 UTC+8 硬编码
 * 与 query.ts 中 UTC 日期不一致导致断点重开误判（#144）。
 *
 * @returns 今日日期，如 '2026-07-09'
 *
 * @example
 * import { getTodayDate } from '../utils/date.js';
 * console.log(getTodayDate()); // '2026-07-09'
 */
export function getTodayDate(): string {
  const tz = process.env.FI_POOL_TIMEZONE || 'Asia/Shanghai';
  const now = new Date();
  // 'en-CA' locale 输出 yyyy-MM-dd 格式
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}
