import { Router } from 'express';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { randomBytes, randomUUID } from 'node:crypto';
import { buildCalendar, INVITATION_TTL_MS, isCurrentInvitation, publicProjection, validatePublication } from './event-invitations';

const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const unavailable = () => fail(404, 'Invitation unavailable. Ask the organizer for a current link.');
const validSession = (value: string) => /^[\w-]{1,128}$/.test(value);
const validToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
const incarnation = (snapshot: { createTime?: { seconds: number; nanoseconds: number } }) => snapshot.createTime ? `${snapshot.createTime.seconds}:${snapshot.createTime.nanoseconds}` : '';
export function createInvitationRouters(database: Firestore) {
  const publicRouter = Router(), memberRouter = Router();
  for (const router of [publicRouter, memberRouter]) router.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }); next();
  });
  async function readInvitation(transaction: Transaction, token: string) {
    if (!validToken(token)) throw unavailable();
    const invitation = (await transaction.get(database.doc(`eventInvitations/${token}`))).data();
    if (!invitation || !validSession(invitation.sessionId || '')) throw unavailable();
    const [publication, session] = await Promise.all([
      transaction.get(database.doc(`eventPublications/${invitation.sessionId}`)), transaction.get(database.doc(`sessions/${invitation.sessionId}`)),
    ]);
    const sessionCreatedAt = incarnation(session);
    if (!session.exists || invitation.sessionCreatedAt !== sessionCreatedAt || publication.data()?.sessionCreatedAt !== sessionCreatedAt || !isCurrentInvitation(token, invitation, publication.data(), Date.now())) throw unavailable();
    return { invitation, publication: publication.data()! };
  }
  publicRouter.get('/:token', async (req, res) => {
    try {
      const result = await database.runTransaction(async transaction => {
        const { invitation, publication } = await readInvitation(transaction, req.params.token);
        return publicProjection(publication as any, invitation.expiresAt);
      });
      res.json(result);
    } catch (issue) { res.status((issue as any).status || 503).json({ error: (issue as any).status ? (issue as Error).message : 'Invitation unavailable. Please try again.' }); }
  });
  publicRouter.get('/:token/calendar.ics', async (req, res) => {
    try {
      const calendar = await database.runTransaction(async transaction => {
        const { publication } = await readInvitation(transaction, req.params.token);
        if (!publication.calendarEnabled) throw unavailable();
        return buildCalendar(publication as any, publication.calendarUid, publication.updatedAt);
      });
      res.set('Content-Disposition', 'attachment; filename="event.ics"').type('text/calendar; charset=utf-8').send(calendar);
    } catch (issue) { res.status((issue as any).status || 503).json({ error: (issue as any).status ? (issue as Error).message : 'Calendar unavailable. Please try again.' }); }
  });
  // Installed after the existing verified-account middleware; resolution never registers.
  memberRouter.post('/invitations/:token/destination', async (req, res) => {
    try {
      const sessionId = await database.runTransaction(async transaction => {
        const { invitation, publication } = await readInvitation(transaction, req.params.token);
        if (publication.registrationRequired === false) throw unavailable();
        return invitation.sessionId;
      });
      res.json({ sessionId });
    } catch (issue) { res.status((issue as any).status || 503).json({ error: (issue as any).status ? (issue as Error).message : 'Invitation unavailable.' }); }
  });
  async function authorize(transaction: Transaction, sessionId: string, uid: string, email: string) {
    if (!validSession(sessionId)) throw fail(400, 'Invalid event.');
    const [session, access, role] = await Promise.all([
      transaction.get(database.doc(`sessions/${sessionId}`)), transaction.get(database.doc(`sessionAccess/${sessionId}`)), transaction.get(database.doc(`users/${uid}`)),
    ]);
    if (!session.exists || !(session.data()!.ownerId === uid || role.data()?.role === 'admin' || email === 'xaeltan@gmail.com' || (Array.isArray(access.data()?.adminEmails) && access.data()!.adminEmails.includes(email)))) throw fail(403, 'Only an event organizer may manage invitations.');
    return incarnation(session);
  }
  memberRouter.get('/events/:sessionId/invitation', async (req, res) => {
    try {
      if (!validSession(req.params.sessionId)) throw unavailable();
      const result = await database.runTransaction(async transaction => {
        const publication = (await transaction.get(database.doc(`eventPublications/${req.params.sessionId}`))).data();
        if (!publication?.currentToken) throw unavailable();
        const { invitation, publication: current } = await readInvitation(transaction, publication.currentToken);
        return { token: publication.currentToken, event: publicProjection(current as any, invitation.expiresAt) };
      });
      res.json(result);
    } catch (issue) { res.status((issue as any).status || 503).json({ error: 'No current invitation. Ask the organizer to publish or renew it.' }); }
  });
  memberRouter.get('/events/:sessionId/publication', async (req, res) => {
    try {
      const result = await database.runTransaction(async transaction => {
        const sessionCreatedAt = await authorize(transaction, req.params.sessionId, res.locals.uid, res.locals.claims.email);
        const stored = (await transaction.get(database.doc(`eventPublications/${req.params.sessionId}`))).data();
        const publication = stored?.sessionCreatedAt === sessionCreatedAt ? stored : undefined;
        const invitation = publication?.currentToken ? (await transaction.get(database.doc(`eventInvitations/${publication.currentToken}`))).data() : null;
        return { revision: publication?.revision || 0, published: publication?.published === true,
          fields: publication ? Object.fromEntries(['title', 'description', 'venue', 'viewingUrl', 'startLocal', 'endLocal', 'timeZone', 'registrationRequired', 'calendarEnabled'].filter(key => publication[key] !== undefined).map(key => [key, publication[key]])) : { registrationRequired: true, calendarEnabled: false },
          ...(invitation ? { expiresAt: invitation.expiresAt } : {}),
          ...(publication && isCurrentInvitation(publication.currentToken, invitation, publication, Date.now()) ? { token: publication.currentToken } : {}) };
      }); res.json(result);
    } catch (issue) { res.status((issue as any).status || 503).json({ error: (issue as any).status ? (issue as Error).message : 'Publication unavailable.' }); }
  });
  memberRouter.post('/events/:sessionId/publication/:action', async (req, res) => {
    try {
      const { action, sessionId } = req.params;
      if (!['publish', 'unpublish', 'revoke', 'renew'].includes(action) || !Number.isSafeInteger(req.body?.revision) || Object.keys(req.body).some(key => !['revision', 'fields'].includes(key))) throw fail(400, 'Invalid publication request.');
      let fields: ReturnType<typeof validatePublication> | undefined;
      if (action === 'publish') { try { fields = validatePublication(req.body.fields); } catch (issue) { throw fail(400, (issue as Error).message); } }
      await database.runTransaction(async transaction => {
        const sessionCreatedAt = await authorize(transaction, sessionId, res.locals.uid, res.locals.claims.email);
        const publicationRef = database.doc(`eventPublications/${sessionId}`);
        const stored = (await transaction.get(publicationRef)).data();
        const before = stored?.sessionCreatedAt === sessionCreatedAt ? stored : undefined;
        if ((before?.revision || 0) !== req.body.revision) throw fail(409, 'Publication changed. Reload before saving.');
        const oldToken = before?.currentToken;
        const oldRef = oldToken ? database.doc(`eventInvitations/${oldToken}`) : null;
        const oldInvitation = oldRef ? (await transaction.get(oldRef)).data() : null;
        const now = Date.now();
        if (action === 'renew' && !before?.published) throw fail(409, 'Publish event details before renewing.');
        let currentToken = oldToken || null;
        const shouldMint = action === 'renew' || (action === 'publish' && !isCurrentInvitation(oldToken, oldInvitation, before, now));
        // All reads (including a collision check) precede writes.
        const freshToken = shouldMint ? randomBytes(32).toString('base64url') : null;
        const freshRef = freshToken ? database.doc(`eventInvitations/${freshToken}`) : null;
        if (freshRef && (await transaction.get(freshRef)).exists) throw fail(409, 'Try publishing again.');
        if ((shouldMint || action === 'revoke' || action === 'unpublish') && oldRef && oldInvitation) transaction.update(oldRef, { revoked: true });
        if (freshRef) {
          transaction.create(freshRef, { sessionId, sessionCreatedAt, createdAt: now, expiresAt: now + INVITATION_TTL_MS, revoked: false }); currentToken = freshToken;
        }
        if (action === 'revoke' || action === 'unpublish') currentToken = null;
        transaction.set(publicationRef, { ...(fields || before || {}), sessionCreatedAt, calendarUid: before?.calendarUid || randomUUID(),
          published: action === 'publish' || action === 'renew' ? true : action === 'unpublish' ? false : before?.published === true,
          currentToken, revision: (before?.revision || 0) + 1, updatedAt: now });
      }); res.json({ saved: true });
    } catch (issue) { res.status((issue as any).status || 503).json({ error: (issue as any).status ? (issue as Error).message : 'Could not save publication. Please try again.' }); }
  });
  return { publicRouter, memberRouter };
}
