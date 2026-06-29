/**
 * 舆情搜索服务 — DashScope (阿里云百炼)
 *
 * 通过 DashScope 的 OpenAI 兼容接口调用 qwen 模型
 * 并启用联网搜索（enable_search=true）获取股票舆情信息。
 *
 * @module services/sentiment
 */

import { fetchJson, fetchWithRetry } from '../utils/http-client.js';

// ─── 类型 ────────────────────────────────────────────────────────

/** DashScope 聊天补全响应 */
interface DashScopeResponse {
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    output_tokens: number;
    input_tokens: number;
    total_tokens: number;
  };
}

// ─── 公开 API ────────────────────────────────────────────────────

/**
 * 获取指定股票的舆情信息。
 *
 * 调用 DashScope API 搜索最近三天的新闻和市场舆情，
 * 返回摘要报告和信息来源列表。
 *
 * 当 DASHSCOPE_API_KEY 未配置时，跳过搜索并返回提示信息，
 * 而非抛出异常。
 *
 * @param code - 六位股票代码（如 '600519'）
 * @param name - 股票名称（如 '贵州茅台'）
 * @returns 包含报告文本和来源 URL 列表的对象
 *
 * @example
 * const { report, sources } = await fetchSentiment('600519', '贵州茅台');
 * console.log(report);
 * sources.forEach(url => console.log(url));
 */
export async function fetchSentiment(
  code: string,
  name: string,
): Promise<{ report: string; sources: string[] }> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return {
      report: '舆情搜索未配置（DASHSCOPE_API_KEY 未设置）',
      sources: [],
    };
  }

  const baseUrl =
    process.env.DASHSCOPE_BASE_URL ||
    'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const model = process.env.DASHSCOPE_MODEL || 'qwen3.5-flash';
  const url = `${baseUrl}/chat/completions`;

  const prompt = `搜索 ${code} ${name} 最近三天的相关新闻和市场舆情信息，总结成简要报告并列出信息来源`;

  try {
    const data = await fetchWithRetry<DashScopeResponse>(
      () =>
        fetchJson<DashScopeResponse>(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: prompt }],
              enable_search: true,
              stream: false,
            }),
          },
          undefined,   // signal
          60_000,      // 舆情搜索超时 60s（联网搜索较慢）
        ),
      1,   // 重试 1 次（共 2 次）
      2000,
    );

    if (!data.choices || data.choices.length === 0) {
      console.warn(`[sentiment] DashScope 返回空 choices (${code} ${name})`);
      return { report: '舆情搜索返回空结果', sources: [] };
    }

    const content = data.choices[0].message?.content || '';

    // 从返回内容中提取可能的来源 URL
    const urlRegex = /https?:\/\/[^\s，。、\n'"）)]+/g;
    const sources = content.match(urlRegex) || [];

    return { report: content, sources };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[sentiment] 舆情搜索失败 (${code} ${name}): ${message}`);
    return {
      report: `舆情搜索失败: ${message}`,
      sources: [],
    };
  }
}
