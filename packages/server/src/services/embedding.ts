/**
 * 向量嵌入服务
 *
 * 对接 OpenAI 兼容的 Embedding API 生成文本向量，
 * 存入 SQLite 数据库（BLOB 字段），
 * 并提供基于余弦相似度的语义检索能力。
 *
 * sqlite-vec 扩展可用时优先使用，否则回退到 JS 内存计算。
 *
 * @module services/embedding
 */

import { fetchJson, fetchWithRetry } from '../utils/http-client.js';
import { getDatabase, getSqlite } from '../db/index.js';
import { vecEmbedding } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

// ─── 配置 ────────────────────────────────────────────────────────

/** Embedding API 地址 */
const API_URL =
  process.env.EMBEDDING_API_URL ||
  'http://127.0.0.1:1234/v1/embeddings';

/** Embedding API 认证密钥 */
const API_KEY = process.env.EMBEDDING_API_KEY || 'not-needed';

/** 嵌入模型名称 */
const MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-baai-bge-m3-568m';

// ─── 类型 ────────────────────────────────────────────────────────

/** Embedding API 响应 */
interface EmbeddingResponse {
  object: string;
  data: { object: string; index: number; embedding: number[] }[];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

/** 语义搜索结果条目 */
export interface SearchResult {
  type: string;
  code: string;
  date: string;
  relevance: number;
  snippet: string;
}

// ─── 工具函数 ────────────────────────────────────────────────────

/**
 * 计算两个向量之间的余弦相似度。
 *
 * 余弦相似度 = (A · B) / (|A| * |B|)，值域 [-1, 1]。
 * 当任一向量为零向量时返回 0。
 *
 * @param a - 第一个向量
 * @param b - 第二个向量
 * @returns 余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * 将 number[] 向量转换为 Buffer（Float32LE），用于 BLOB 存储。
 *
 * @param embedding - 浮点数向量
 * @returns Buffer 对象
 */
function embeddingToBuffer(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}

/**
 * 将 Buffer（Float32LE）转换回 number[] 向量。
 *
 * @param buffer - 数据库读取的 BLOB
 * @returns 浮点数向量
 */
function bufferToEmbedding(buffer: Buffer): number[] {
  const floatArray = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  return Array.from(floatArray);
}

// ─── 公开 API ────────────────────────────────────────────────────

/**
 * 调用 Embedding API 获取文本的向量表示。
 *
 * @param text - 输入文本
 * @returns 浮点数向量数组
 *
 * @throws 当 API 不可达或返回空结果时抛出
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const data = await fetchWithRetry<EmbeddingResponse>(
    () =>
      fetchJson<EmbeddingResponse>(
        API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            input: text,
            model: MODEL,
          }),
        },
      ),
    2,
    1000,
  );

  if (!data.data || data.data.length === 0) {
    throw new Error(`Embedding API 返回空结果 (model=${MODEL})`);
  }

  return data.data[0].embedding;
}

/**
 * 将向量嵌入存入 vec_embedding 表。
 *
 * 自动将 number[] 转换为 BLOB 存储。
 *
 * @param params.contentType  - 内容类型（'analysis' | 'final'）
 * @param params.contentCode  - 股票代码
 * @param params.contentDate  - 报告日期（yyyy-MM-dd）
 * @param params.contentText  - 原始文本
 * @param params.embedding    - 向量数据
 */
export async function storeEmbedding(params: {
  contentType: string;
  contentCode: string;
  contentDate: string;
  contentText: string;
  embedding: number[];
}): Promise<void> {
  const db = getDatabase();
  const buffer = embeddingToBuffer(params.embedding);

  await db.insert(vecEmbedding).values({
    contentType: params.contentType,
    contentCode: params.contentCode,
    contentDate: params.contentDate,
    contentText: params.contentText,
    embedding: buffer,
  });
}

/**
 * 查询与给定文本语义相似的已存储向量。
 *
 * 实现策略：
 * 1. 获取查询文本的嵌入向量
 * 2. 从 vec_embedding 表中加载匹配条件的候选记录
 * 3. 尝试使用 sqlite-vec 扩展加速（暂未集成，统一使用 JS 计算）
 * 4. 逐条计算余弦相似度
 * 5. 按相似度降序返回 top-k 结果
 *
 * @param params.query    - 搜索查询文本
 * @param params.type     - 可选，按 content_type 过滤
 * @param params.code     - 可选，按股票代码过滤
 * @param params.limit    - 返回最大条数，默认 10
 * @param params.minScore - 最低相似度阈值，默认 0.7
 * @returns 搜索结果数组，按相关性降序排列
 */
export async function searchSimilar(params: {
  query: string;
  type?: string;
  code?: string;
  limit?: number;
  minScore?: number;
}): Promise<SearchResult[]> {
  const limit = params.limit ?? 10;
  const minScore = params.minScore ?? 0.7;

  // 1. 获取查询向量
  let queryEmbedding: number[];
  try {
    queryEmbedding = await getEmbedding(params.query);
  } catch (err) {
    console.warn('[embedding] 获取查询向量失败，跳过向量检索:', (err as Error).message);
    return [];
  }

  // 2. 构建查询条件
  const db = getDatabase();
  const conditions: ReturnType<typeof eq>[] = [];

  if (params.type) {
    conditions.push(eq(vecEmbedding.contentType, params.type));
  }
  if (params.code) {
    conditions.push(eq(vecEmbedding.contentCode, params.code));
  }

  // 3. 加载候选向量
  let candidates: {
    contentType: string;
    contentCode: string;
    contentDate: string;
    contentText: string;
    embedding: unknown;
  }[];

  if (conditions.length > 0) {
    candidates = db
      .select({
        contentType: vecEmbedding.contentType,
        contentCode: vecEmbedding.contentCode,
        contentDate: vecEmbedding.contentDate,
        contentText: vecEmbedding.contentText,
        embedding: vecEmbedding.embedding,
      })
      .from(vecEmbedding)
      .where(and(...conditions))
      .all();
  } else {
    candidates = db
      .select({
        contentType: vecEmbedding.contentType,
        contentCode: vecEmbedding.contentCode,
        contentDate: vecEmbedding.contentDate,
        contentText: vecEmbedding.contentText,
        embedding: vecEmbedding.embedding,
      })
      .from(vecEmbedding)
      .all();
  }

  if (candidates.length === 0) {
    return [];
  }

  // 4. 逐条计算余弦相似度
  const results: SearchResult[] = [];

  for (const row of candidates) {
    if (!row.embedding) continue;

    try {
      const candidateVector = bufferToEmbedding(row.embedding as Buffer);
      const score = cosineSimilarity(queryEmbedding, candidateVector);

      if (score >= minScore) {
        results.push({
          type: row.contentType,
          code: row.contentCode,
          date: row.contentDate,
          relevance: Math.round(score * 10000) / 10000, // 保留 4 位小数
          snippet: row.contentText.slice(0, 200),
        });
      }
    } catch {
      // 跳过无法解析的向量
      continue;
    }
  }

  // 5. 排序并截取
  results.sort((a, b) => b.relevance - a.relevance);
  return results.slice(0, limit);
}

/**
 * 删除指定股票和类型的向量嵌入。
 *
 * @param contentCode - 股票代码
 * @param contentType - 可选内容类型，不传则删除该股票的所有向量
 */
export async function deleteEmbeddings(
  contentCode: string,
  contentType?: string,
): Promise<void> {
  const db = getDatabase();
  const conditions: ReturnType<typeof eq>[] = [
    eq(vecEmbedding.contentCode, contentCode),
  ];

  if (contentType) {
    conditions.push(eq(vecEmbedding.contentType, contentType));
  }

  await db.delete(vecEmbedding).where(and(...conditions));
}
