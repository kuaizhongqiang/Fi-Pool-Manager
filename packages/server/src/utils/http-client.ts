/**
 * HTTP 客户端工具模块
 *
 * 基于 Node.js 内置 fetch（Node 22+），提供带超时控制、
 * 错误处理和重试机制的 HTTP 请求封装。
 *
 * @module http-client
 */

// ─── 常量 ─────────────────────────────────────────────────────

/** 默认请求超时时间（毫秒） */
const DEFAULT_TIMEOUT_MS = 15_000;

/** 默认最大重试次数 */
const DEFAULT_RETRIES = 2;

/** 默认重试间隔（毫秒） */
const DEFAULT_RETRY_DELAY_MS = 1_000;

// ─── 错误类型 ─────────────────────────────────────────────────

/**
 * HTTP 请求错误
 *
 * 当服务端返回非 2xx 状态码时抛出，包含状态码、状态文本和响应体。
 */
export class HttpError extends Error {
  /** HTTP 状态码 */
  public readonly status: number;

  /** HTTP 状态文本 */
  public readonly statusText: string;

  /** 响应体文本 */
  public readonly body: string;

  constructor(status: number, statusText: string, body: string) {
    super(`HTTP ${status} ${statusText}`);
    this.name = 'HttpError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

// ─── 底层请求函数 ─────────────────────────────────────────────

/**
 * 核心请求函数：发起 HTTP 请求并返回 Response
 *
 * 内置超时控制，超时时抛出 AbortError。
 *
 * @param url     - 请求 URL
 * @param options - fetch 选项（method、headers、body 等）
 * @param signal  - 外部 AbortSignal（可与内部超时同时生效）
 * @returns Response 对象
 * @throws {HttpError}  当响应状态码非 2xx 时
 * @throws {AbortError} 当请求超时或被外部中止时
 */
async function request(url: string, options?: RequestInit, signal?: AbortSignal): Promise<Response> {
  // 如果外部传入了 signal，与内部超时 signal 合并
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    // 合并 AbortSignal：外部 signal 与内部超时 signal
    const combinedSignal = signal
      ? combineAbortSignals(signal, controller.signal)
      : controller.signal;

    const fetchOptions: RequestInit = {
      ...options,
      signal: combinedSignal,
    };

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const body = await response.text();
      throw new HttpError(response.status, response.statusText, body);
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 合并两个 AbortSignal，任一 signal 中止则合并后的 signal 中止
 */
function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      return controller.signal;
    }
    sig.addEventListener('abort', () => controller.abort(sig.reason), { once: true });
  }

  return controller.signal;
}

// ─── 公开函数 ─────────────────────────────────────────────────

/**
 * 发起 HTTP 请求并解析响应为 JSON
 *
 * @typeParam T    - 期望的 JSON 数据类型
 * @param url     - 请求 URL
 * @param options - 可选的 fetch 选项（method、headers、body 等）
 * @param signal  - 可选的 AbortSignal，用于外部控制中止
 * @returns 解析后的 JSON 数据
 *
 * @example
 * ```typescript
 * const data = await fetchJson<{ code: string; price: number }>(
 *   'https://api.example.com/stock/600519'
 * );
 * ```
 *
 * @throws {HttpError}  当响应状态码非 2xx 时
 * @throws {AbortError} 当请求超时或被中止时
 * @throws {SyntaxError} 当响应体不是合法 JSON 时
 */
export async function fetchJson<T>(url: string, options?: RequestInit, signal?: AbortSignal): Promise<T> {
  const response = await request(url, options, signal);
  const text = await response.text();

  if (text.length === 0) {
    throw new SyntaxError('响应体为空，无法解析为 JSON');
  }

  return JSON.parse(text) as T;
}

/**
 * 发起 HTTP 请求并获取原始文本
 *
 * @param url     - 请求 URL
 * @param options - 可选的 fetch 选项（method、headers、body 等）
 * @param signal  - 可选的 AbortSignal，用于外部控制中止
 * @returns 响应文本
 *
 * @example
 * ```typescript
 * const html = await fetchText('https://example.com');
 * ```
 *
 * @throws {HttpError}  当响应状态码非 2xx 时
 * @throws {AbortError} 当请求超时或被中止时
 */
export async function fetchText(url: string, options?: RequestInit, signal?: AbortSignal): Promise<string> {
  const response = await request(url, options, signal);
  return response.text();
}

/**
 * 判断一个错误是否应该触发重试
 *
 * 重试条件：
 * - 网络错误（TypeError）
 * - 服务端错误（HTTP 5xx）
 *
 * @param error - 捕获的异常
 * @returns 是否应重试
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // TypeError 通常表示网络层面错误（DNS 解析失败、连接重置等）
    return true;
  }

  if (error instanceof HttpError) {
    // 5xx 服务端错误可以重试
    return error.status >= 500 && error.status < 600;
  }

  // 非 HttpError 或 TypeError 的错误（如 JSON 解析错误）不重试
  return false;
}

/**
 * 带退避重试机制的异步函数执行器
 *
 * 对传入的异步函数进行重试，仅在遇到可重试错误
 *（网络异常或服务端 5xx 状态码）时触发。
 * 重试间隔恒定（非指数退避），适用于高频数据轮询场景。
 *
 * @param fn      - 要执行的异步函数（通常是 fetch 调用）
 * @param retries - 最大重试次数，默认 2（共执行 1 + retries = 3 次）
 * @param delay   - 每次重试前的等待时间（毫秒），默认 1000
 * @returns 函数执行结果
 *
 * @example
 * ```typescript
 * const data = await fetchWithRetry(
 *   () => fetchJson<StockData>('https://api.example.com/stock'),
 *   3,   // 最多重试 3 次
 *   500  // 间隔 500ms
 * );
 * ```
 *
 * @throws 最后一次尝试抛出的原始错误（非可重试错误直接透传）
 */
export async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  retries: number = DEFAULT_RETRIES,
  delay: number = DEFAULT_RETRY_DELAY_MS,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      if (attempt < retries && isRetryableError(error)) {
        await sleep(delay);
        continue;
      }

      // 非可重试错误或已达最大重试次数，直接抛出
      throw error;
    }
  }

  // TypeScript 控制流无法推断此处不可达，显式抛出
  throw lastError;
}

/**
 * 延迟函数
 *
 * @param ms - 等待毫秒数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
