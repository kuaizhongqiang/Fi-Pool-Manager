/**
 * LLM 推理服务 — LM Studio (OpenAI 兼容 API)
 *
 * 通过 LM Studio 的 OpenAI 兼容 HTTP 接口调用本地 LLM 模型。
 * 支持聊天补全、模型列表查询和连接检查。
 *
 * @module services/llm
 */

import { fetchJson, fetchWithRetry } from '../utils/http-client.js';

// ─── 配置（惰性读取，避免 dotenv 加载前初始化）─────────────────────

/**
 * LM Studio 服务地址。
 * 使用惰性 getter 而非模块级常量，确保 dotenv 加载后的值生效。
 */
function getBaseUrl(): string {
  return process.env.LLM_BASE_URL || 'http://127.0.0.1:1234';
}

/** 默认使用的模型名称 */
function getDefaultModel(): string {
  return process.env.LLM_MODEL || 'qwen/qwen3.5-9b';
}

/** LLM 上下文窗口限制（token），默认 262144 */
function resolveContextLimit(): number {
  return parseInt(process.env.LLM_CONTEXT_LIMIT || '262144', 10);
}

// ─── 类型 ────────────────────────────────────────────────────────

/** 聊天补全请求 body */
interface ChatCompletionRequest {
  model: string;
  messages: { role: string; content: string }[];
  max_tokens?: number;
  temperature?: number;
  stream: false;
}

/** 聊天补全响应 */
interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** 模型列表响应 */
interface ModelListResponse {
  object: string;
  data: { id: string; object: string; created: number; owned_by: string }[];
}

// ─── 公开 API ────────────────────────────────────────────────────

/**
 * 调用 LM Studio 聊天补全 API。
 *
 * 向本地 LLM 发送消息列表并获取回复文本。
 * 内置超时（60s）和重试（2 次）机制。
 *
 * @param params.model     - 模型名称，不传则使用环境变量 LLM_MODEL
 * @param params.messages  - 对话消息列表（role: system/user/assistant）
 * @param params.maxTokens - 最大生成 token 数，不传则由模型决定
 * @param params.temperature - 采样温度，默认 0.7
 * @param params.sessionId   - 会话 ID（透传，暂未用于 LM Studio 本身）
 * @returns LLM 回复文本
 *
 * @throws 当 LM Studio 不可达、返回错误或结果为空白时抛出
 *
 * @example
 * const reply = await chatCompletion({
 *   messages: [{ role: 'user', content: '分析贵州茅台' }],
 *   maxTokens: 500,
 * });
 */
export async function chatCompletion(
  params: {
    model?: string;
    messages: { role: string; content: string }[];
    maxTokens?: number;
    temperature?: number;
    sessionId?: string;
  },
): Promise<string> {
  const url = `${getBaseUrl()}/v1/chat/completions`;

  const body: ChatCompletionRequest = {
    model: params.model || getDefaultModel(),
    messages: params.messages,
    max_tokens: params.maxTokens,
    temperature: params.temperature ?? 0.7,
    stream: false,
  };

  // 使用 fetchWithRetry：传入一个返回 Promise 的函数
  // LLM 推理可能较慢（尤其首次加载模型），超时设为 120s
  const LLM_TIMEOUT = 120_000;
  let data: ChatCompletionResponse;
  try {
    data = await fetchWithRetry<ChatCompletionResponse>(
      () =>
        fetchJson<ChatCompletionResponse>(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          },
          undefined, // signal
          LLM_TIMEOUT,
        ),
      2,
      1000,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const baseUrl = getBaseUrl();
    // 友好化常见错误
    if (msg.includes('fetch failed') || msg.includes('connect') || msg.includes('ECONNREFUSED')) {
      throw new Error(
        `LLM 连接失败（${baseUrl}），请确认：\n` +
        `  1. LM Studio 是否已启动\n` +
        `  2. LLM_BASE_URL 配置是否正确（当前: ${baseUrl}）\n` +
        `  3. 模型是否已加载（${getDefaultModel()}）\n` +
        `  测试连接: curl ${baseUrl}/v1/models`,
      );
    }
    if (msg.includes('timed out') || msg.includes('abort') || msg.includes('timeout')) {
      throw new Error(
        `LLM 请求超时（${LLM_TIMEOUT / 1000}s），请确认：\n` +
        `  1. 模型推理速度是否正常\n` +
        `  2. 可尝试减小 LLM_CONTEXT_LIMIT（当前: ${resolveContextLimit()}）`,
      );
    }
    throw new Error(`LLM 调用失败: ${msg}`);
  }

  if (!data.choices || data.choices.length === 0) {
    throw new Error(`LLM 返回空结果: 无 choices (model=${body.model})`);
  }

  const content = data.choices[0].message?.content;
  if (content === undefined || content === null) {
    throw new Error(`LLM 返回空消息内容 (model=${body.model})`);
  }

  return content;
}

/**
 * 列出 LM Studio 中可用的模型。
 *
 * @returns 模型 ID 数组
 *
 * @example
 * const models = await listModels();
 * // ['qwen/qwen3.5-9b', '...']
 */
export async function listModels(): Promise<string[]> {
  const url = `${getBaseUrl()}/v1/models`;

  const data = await fetchJson<ModelListResponse>(url);

  if (!data.data || !Array.isArray(data.data)) {
    throw new Error(`模型列表响应格式异常: ${JSON.stringify(data).slice(0, 200)}`);
  }

  return data.data.map((m) => m.id);
}

/**
 * 检查 LM Studio 服务是否可达。
 *
 * 通过调用 listModels() 验证连接，不抛出异常即为可达。
 *
 * @returns true 表示连接正常，false 表示不可达
 */
export async function checkConnection(): Promise<boolean> {
  try {
    await listModels();
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 LLM 上下文窗口限制。
 *
 * @returns 环境变量 LLM_CONTEXT_LIMIT 的值（默认 262144）
 */
export function getContextLimit(): number {
  return resolveContextLimit();
}
