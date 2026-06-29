/**
 * Integration tests for session management.
 *
 * Tests the runtime in-memory session store functions from `src/services/session.ts`:
 *   createSession, switchSession, appendMessage, getSession,
 *   listSessions, clearSession, getCurrentSession
 *
 * Note: Session state is shared across the module (singleton Map).
 * Each test group uses `beforeEach` to reset state via clearSession().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession,
  switchSession,
  appendMessage,
  getSession,
  listSessions,
  clearSession,
  getCurrentSession,
} from '../../src/services/session.js';

// ─── Setup ──────────────────────────────────────────────────────

beforeEach(() => {
  // Reset all sessions before each test to avoid cross-test pollution
  clearSession();
});

// ─── createSession ──────────────────────────────────────────────

describe('createSession', () => {
  it('creates a new session and sets it as current', () => {
    const id = createSession();
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const current = getCurrentSession();
    expect(current).toBeDefined();
    expect(current!.id).toBe(id);
  });

  it('creates sessions with unique IDs', () => {
    const id1 = createSession();
    const id2 = createSession();
    // After createSession, the second one becomes current
    expect(id1).not.toBe(id2);
  });

  it('creates a session with an empty messages array', () => {
    const id = createSession();
    const session = getSession(id);
    expect(session).toBeDefined();
    expect(session!.messages).toEqual([]);
  });

  it('sets createdAt to a valid ISO string', () => {
    const id = createSession();
    const session = getSession(id);
    expect(session!.createdAt).toBeDefined();
    expect(() => new Date(session!.createdAt)).not.toThrow();
    expect(new Date(session!.createdAt).toISOString()).toBe(session!.createdAt);
  });
});

// ─── switchSession ──────────────────────────────────────────────

describe('switchSession', () => {
  it('switches to an existing session', () => {
    const id1 = createSession();
    const id2 = createSession();

    const result = switchSession(id1);
    expect(result.sessionId).toBe(id1);
    expect(result.previousId).toBe(id2);
    expect(getCurrentSession()!.id).toBe(id1);
  });

  it('creates a new session when switching to a non-existent ID', () => {
    createSession();
    const result = switchSession('non-existent-id');
    expect(result.sessionId).toBe('non-existent-id');
    expect(result.previousId).toBeDefined();

    const session = getSession('non-existent-id');
    expect(session).toBeDefined();
    expect(session!.messages).toEqual([]);
  });

  it('returns undefined previousId when no previous session', () => {
    const result = switchSession('first-session');
    expect(result.sessionId).toBe('first-session');
    expect(result.previousId).toBeUndefined();
  });
});

// ─── appendMessage ──────────────────────────────────────────────

describe('appendMessage', () => {
  it('appends a message to the session', () => {
    const id = createSession();
    appendMessage(id, 'user', '分析贵州茅台');
    const session = getSession(id);
    expect(session!.messages).toHaveLength(1);
    expect(session!.messages[0].role).toBe('user');
    expect(session!.messages[0].content).toBe('分析贵州茅台');
  });

  it('throws error for non-existent session', () => {
    expect(() => appendMessage('no-such-session', 'user', 'test')).toThrow('会话不存在');
  });

  it('appends multiple messages in order', () => {
    const id = createSession();
    appendMessage(id, 'user', 'Hello');
    appendMessage(id, 'assistant', 'Hi');
    appendMessage(id, 'user', 'How are you?');

    const session = getSession(id);
    expect(session!.messages).toHaveLength(3);
    expect(session!.messages[0].content).toBe('Hello');
    expect(session!.messages[1].content).toBe('Hi');
    expect(session!.messages[2].content).toBe('How are you?');
  });

  it('auto-trims when exceeding MAX_MESSAGES (20)', () => {
    const id = createSession();

    // Add more than 20 messages. Trim is triggered incrementally
    // each time the length exceeds MAX_MESSAGES (20), removing
    // (excess + TRIM_COUNT) earliest non-system messages.
    //
    // After message 20 (i=19): length=20, no trim.
    // After message 21 (i=20): length=21, excess=1, toRemove=6,
    //   messages 6-20 remain (15 msgs).
    // Messages 22-24 append without further trim.
    for (let i = 0; i < 25; i++) {
      appendMessage(id, 'user', `Message ${i}`);
    }

    const session = getSession(id);
    // After trim, length = 19 (not 25)
    expect(session!.messages.length).toBeLessThan(25);
    // The first remaining message is 'Message 6' because each trim
    // removes 6 messages (excess=1, TRIM_COUNT=5), and only one trim
    // trigger happens in this sequence
    expect(session!.messages[0].content).toBe('Message 6');
  });

  it('preserves system messages during auto-trim', () => {
    const id = createSession();

    // Add a system message first
    appendMessage(id, 'system', 'System config');
    for (let i = 0; i < 25; i++) {
      appendMessage(id, 'user', `Message ${i}`);
    }

    const session = getSession(id);
    // System message should be preserved
    expect(session!.messages.some((m) => m.role === 'system' && m.content === 'System config')).toBe(true);
  });
});

// ─── getSession ─────────────────────────────────────────────────

describe('getSession', () => {
  it('returns undefined for non-existent session', () => {
    expect(getSession('no-such-id')).toBeUndefined();
  });

  it('returns the correct session data', () => {
    const id = createSession();
    appendMessage(id, 'user', 'test');
    const session = getSession(id);
    expect(session!.id).toBe(id);
    expect(session!.messages).toHaveLength(1);
  });
});

// ─── listSessions ───────────────────────────────────────────────

describe('listSessions', () => {
  it('returns empty array when no sessions exist', () => {
    // clearSession() was called in beforeEach, so no sessions
    expect(listSessions()).toEqual([]);
  });

  it('lists all created sessions', () => {
    const id1 = createSession();
    const id2 = createSession();
    const id3 = createSession();

    const sessions = listSessions();
    expect(sessions).toHaveLength(3);
    const ids = sessions.map((s) => s.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
    expect(ids).toContain(id3);
  });

  it('returned summaries have id and createdAt fields', () => {
    createSession();
    const sessions = listSessions();
    expect(sessions[0]).toHaveProperty('id');
    expect(sessions[0]).toHaveProperty('createdAt');
    expect(sessions[0]).not.toHaveProperty('messages');
  });
});

// ─── getCurrentSession ──────────────────────────────────────────

describe('getCurrentSession', () => {
  it('returns undefined when no session is active', () => {
    // After clearSession(), currentSessionId is undefined
    expect(getCurrentSession()).toBeUndefined();
  });

  it('returns the current session', () => {
    const id = createSession();
    const current = getCurrentSession();
    expect(current).toBeDefined();
    expect(current!.id).toBe(id);
  });

  it('updates after switchSession', () => {
    const id1 = createSession();
    const id2 = createSession();
    expect(getCurrentSession()!.id).toBe(id2);

    switchSession(id1);
    expect(getCurrentSession()!.id).toBe(id1);
  });
});

// ─── clearSession ───────────────────────────────────────────────

describe('clearSession', () => {
  it('clears messages for a specific session when sessionId is given', () => {
    const id = createSession();
    appendMessage(id, 'user', 'Hello');
    clearSession(id);
    const session = getSession(id);
    expect(session).toBeDefined();
    expect(session!.messages).toEqual([]);
  });

  it('clears all sessions when no sessionId is given', () => {
    createSession();
    createSession();
    clearSession();
    expect(listSessions()).toHaveLength(0);
    expect(getCurrentSession()).toBeUndefined();
  });

  it('does nothing when clearing a non-existent session', () => {
    expect(() => clearSession('no-such')).not.toThrow();
  });
});
