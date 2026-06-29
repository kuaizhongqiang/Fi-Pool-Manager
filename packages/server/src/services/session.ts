/**
 * LLM 会话管理（运行时内存存储）
 *
 * 管理多角色 LLM 分析过程中的会话状态。
 * 每个会话存储一系列消息，支持自动裁剪以避免超出上下文窗口。
 * 会话数据不持久化，仅在内存中维护。
 *
 * @module services/session
 */

/**
 * 单条消息结构。
 */
export interface SessionMessage {
  /** 消息来源角色，如 'user'、'assistant'、'system' 或具体角色名 */
  role: string;
  /** 消息文本内容 */
  content: string;
}

/**
 * 会话结构。
 */
export interface Session {
  /** 会话唯一标识 */
  id: string;
  /** 创建时间 ISO 字符串 */
  createdAt: string;
  /** 消息列表 */
  messages: SessionMessage[];
}

// ─── 模块级状态 ────────────────────────────────────────────

/** 内存中的会话存储 */
const sessions = new Map<string, Session>();

/** 当前激活的会话 ID */
let currentSessionId: string | undefined;

/** 单个会话允许的最大消息数 */
const MAX_MESSAGES = 20;

/**
 * 超过 MAX_MESSAGES 时一次性裁剪的消息数。
 * 从最早的消息开始移除。
 */
const TRIM_COUNT = 5;

// ─── 工具函数 ──────────────────────────────────────────────

/**
 * 生成一个简短随机字符串作为会话 ID。
 * 格式：8 位十六进制字符。
 *
 * @returns 随机 ID
 */
function generateId(): string {
  return Math.random().toString(16).slice(2, 10);
}

// ─── 公开 API ──────────────────────────────────────────────

/**
 * 创建一个新的空会话并将其设为当前会话。
 *
 * @returns 新会话的 ID
 *
 * @example
 * const sessionId = createSession();
 * console.log(sessionId); // 'a1b2c3d4'
 */
export function createSession(): string {
  const id = generateId();
  const session: Session = {
    id,
    createdAt: new Date().toISOString(),
    messages: [],
  };
  sessions.set(id, session);
  currentSessionId = id;
  return id;
}

/**
 * 切换到指定会话作为当前会话。
 * 如果指定 ID 不存在则会自动创建新会话。
 *
 * @param sessionId - 目标会话 ID
 * @returns 包含当前会话 ID 和上一个会话 ID 的对象
 *
 * @example
 * const { sessionId, previousId } = switchSession('a1b2c3d4');
 * // 如果之前有活动会话，previousId 是其 ID
 */
export function switchSession(sessionId: string): {
  sessionId: string;
  previousId?: string;
} {
  const previousId = currentSessionId;

  // 如果会话不存在则自动创建
  if (!sessions.has(sessionId)) {
    const session: Session = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      messages: [],
    };
    sessions.set(sessionId, session);
  }

  currentSessionId = sessionId;
  return { sessionId, previousId };
}

/**
 * 向指定会话追加一条消息。
 * 如果会话消息数超过 MAX_MESSAGES，自动裁剪最早的非系统消息。
 *
 * @param sessionId - 目标会话 ID
 * @param role - 消息角色
 * @param content - 消息内容
 *
 * @example
 * appendMessage('a1b2c3d4', 'user', '分析贵州茅台');
 * appendMessage('a1b2c3d4', 'assistant', '贵州茅台最新股价...');
 */
export function appendMessage(
  sessionId: string,
  role: string,
  content: string,
): void {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`会话不存在: ${sessionId}`);
  }

  session.messages.push({ role, content });

  // 超出限制时裁剪最早的消息（保留系统消息）
  if (session.messages.length > MAX_MESSAGES) {
    // 计算需要移除的消息数
    const excess = session.messages.length - MAX_MESSAGES;
    const toRemove = Math.min(excess + TRIM_COUNT, session.messages.length);

    // 保留所有 system 消息，移除最早的非 system 消息
    const systemMessages = session.messages.filter((m) => m.role === 'system');
    const nonSystemMessages = session.messages.filter((m) => m.role !== 'system');
    const trimmed = nonSystemMessages.slice(toRemove);

    session.messages = [...systemMessages, ...trimmed];
  }
}

/**
 * 获取指定会话的完整数据。
 *
 * @param sessionId - 会话 ID
 * @returns 会话对象，不存在返回 undefined
 *
 * @example
 * const session = getSession('a1b2c3d4');
 * if (session) console.log(session.messages.length);
 */
export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

/**
 * 列出所有已创建的会话（摘要信息）。
 *
 * @returns 会话摘要列表，包含 id 和 createdAt
 *
 * @example
 * const list = listSessions();
 * list.forEach(s => console.log(s.id, s.createdAt));
 */
export function listSessions(): { id: string; createdAt: string }[] {
  return Array.from(sessions.values()).map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
  }));
}

/**
 * 获取当前激活的会话。
 *
 * @returns 当前会话对象，无活动会话时返回 undefined
 *
 * @example
 * const session = getCurrentSession();
 * if (session) console.log(session.id);
 */
export function getCurrentSession(): Session | undefined {
  if (!currentSessionId) return undefined;
  return sessions.get(currentSessionId);
}

/**
 * 清空会话消息。
 *
 * - 不指定 sessionId：清空所有会话（重置整个内存存储）
 * - 指定 sessionId：仅清空该会话的消息列表（会话保留）
 *
 * @param sessionId - 可选的目标会话 ID
 *
 * @example
 * // 清空特定会话
 * clearSession('a1b2c3d4');
 * // 清空全部
 * clearSession();
 */
export function clearSession(sessionId?: string): void {
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
      session.messages = [];
    }
  } else {
    sessions.clear();
    currentSessionId = undefined;
  }
}
