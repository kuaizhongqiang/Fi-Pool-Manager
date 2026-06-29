/**
 * 字数统计与截断工具
 *
 * 职责：
 * - 统计中文字符数、综合字数（中文 + 英文）
 * - 按限制截断文本
 * - 估算 Token 数（用于 LLM 上下文窗口控制）
 *
 * @module services/word-count
 */

/**
 * 统计字符串中的中文字符数。
 * 仅统计 Unicode 中的 CJK 统一表意文字（一-鿿）。
 *
 * @param text - 待统计的文本
 * @returns 中文字符数量
 *
 * @example
 * countChineseChars('Hello 世界') // => 2
 */
export function countChineseChars(text: string): number {
  const matches = text.match(/[一-鿿]/g);
  return matches ? matches.length : 0;
}

/**
 * 综合字数统计。
 * - 中文字符：每个计 1 字
 * - 英文单词：按空白或标点分隔的连续字母序列，每个计 1 词
 * - 数字序列：每个连续数字序列计 1 词
 *
 * @param text - 待统计的文本
 * @returns 综合字数
 *
 * @example
 * countWords('Hello 世界 foo bar') // => 4 (Hello + 世界 + foo + bar)
 */
export function countWords(text: string): number {
  const chineseCount = countChineseChars(text);
  // 移去中文字符后，按空白和标点分割英文/数字单词
  const nonChinese = text.replace(/[一-鿿]/g, ' ');
  const englishWords = nonChinese
    .split(/[\s,.;:!?()\[\]{}"'\-_/@#$%^&*+=<>~`|]+/)
    .filter(Boolean);
  return chineseCount + englishWords.length;
}

/**
 * 将文本截断至指定字数限制，保留完整单词。
 * 截断后追加 `[已截断]` 标记。
 * 如果文本已在限制内，则原样返回。
 *
 * @param text - 原始文本
 * @param limit - 字数上限
 * @returns 截断后的文本（带标记）或原文本
 *
 * @example
 * truncateToLimit('这是一段很长的文本内容', 3)
 * // => '这是一[已截断]'
 */
export function truncateToLimit(text: string, limit: number): string {
  if (limit <= 0) return '[已截断]';

  const currentCount = countWords(text);
  if (currentCount <= limit) return text;

  // 按字符遍历，逐个检查累计字数
  let result = '';
  let accumulated = 0;

  for (const char of text) {
    const isChinese = /[一-鿿]/.test(char);
    const isSpaceOrPunct = /[\s,.;:!?()\[\]{}"'\-_/@#$%^&*+=<>~`|]/.test(char);

    if (isChinese) {
      if (accumulated + 1 > limit) break;
      result += char;
      accumulated += 1;
    } else if (isSpaceOrPunct) {
      // 标点和空白不计入字数，但保留
      result += char;
    } else {
      // 英文字母或数字：尝试读入完整单词
      const remaining = text.slice(text.length - text.slice(result.length).length);
      const wordMatch = remaining.match(/^[^\s一-鿿]+/);
      if (wordMatch) {
        const word = wordMatch[0];
        if (accumulated + 1 > limit) break;
        result += word;
        accumulated += 1;
      } else {
        result += char;
      }
    }
  }

  return result + '[已截断]';
}

/**
 * 粗略估算 Token 数。
 * - 中文：约每 1.5 个字符计 1 token
 * - 英文：按空格分词，每词约 1.3 token
 *
 * @param text - 待估算的文本
 * @returns 预估 Token 数量
 *
 * @example
 * estimateTokens('Hello 世界') // => ~3 (2 english tokens + 1.3 chinese tokens)
 */
export function estimateTokens(text: string): number {
  const chineseCount = countChineseChars(text);
  const chineseTokens = Math.ceil(chineseCount / 1.5);

  const nonChinese = text.replace(/[一-鿿]/g, ' ');
  const englishWords = nonChinese
    .split(/[\s,.;:!?()\[\]{}"'\-_/@#$%^&*+=<>~`|]+/)
    .filter(Boolean);
  const englishTokens = englishWords.reduce((sum, w) => sum + Math.ceil(w.length / 3), 0);

  return chineseTokens + englishTokens;
}
