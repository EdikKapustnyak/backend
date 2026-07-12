import { sessionRepository } from './session.repository.js';
import type { SessionDocument } from './session.model.js';
import type { PublicSession } from './session.types.js';

export function toPublicSession(session: SessionDocument, currentSessionId: string): PublicSession {
  return {
    id: session._id.toString(),
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    isCurrent: session._id.toString() === currentSessionId,
  };
}

export const sessionService = {
  /** Every active session (device/browser) for this user, newest-used first. */
  async listSessions(userId: string, currentSessionId: string): Promise<PublicSession[]> {
    const sessions = await sessionRepository.findAllByUser(userId);
    return sessions.map((session) => toPublicSession(session, currentSessionId));
  },

  /** Revokes one specific session (e.g. "log out that old phone"). Returns false if it wasn't found. */
  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    return sessionRepository.deleteByIdAndUser(sessionId, userId);
  },

  /** "Log out everywhere" - revokes every session for the user, including the current one. */
  async revokeAllSessions(userId: string): Promise<void> {
    await sessionRepository.deleteAllByUser(userId);
  },
};
