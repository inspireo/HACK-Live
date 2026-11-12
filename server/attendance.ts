import { createHash } from 'node:crypto';
import type { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { attendanceEligible, eventSnapshot, historySummary } from '../shared/attendance';

const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const validId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const validParticipantId = (value: unknown): value is string => typeof value === 'string' && /^[\w~-]{1,256}$/.test(value);
export async function attendanceStaff(database: Firestore, transaction: Transaction, sessionId: string, uid: string, email: string) {
  const [event, access, platform] = await Promise.all([
    transaction.get(database.doc(`sessions/${sessionId}`)), transaction.get(database.doc(`sessionAccess/${sessionId}`)), transaction.get(database.doc(`users/${uid}`)),
  ]);
  if (!event.exists) throw fail(404, 'Event unavailable.');
  if (!(event.data()?.ownerId === uid || access.data()?.adminEmails?.includes(email) || platform.data()?.role === 'admin' || email === 'xaeltan@gmail.com')) throw fail(403, 'Only event staff can verify attendance.');
  return event;
}

// Installed only after identity.ts verifies a nonanonymous, verified bearer.
export function installAttendanceRoutes(router: Router, database: Firestore, accounts: Auth) {
  router.post('/attendance', async (req, res) => {
    try {
      const { sessionId, memberUid, requestId, action = 'check-in', method = 'staff_check_in', occurredAt = null, evidence = '', reason = '', expectedRevision = null } = req.body;
      if (!validId(sessionId) || !validId(memberUid) || !validId(requestId) || !['check-in', 'correct'].includes(action) || !['staff_check_in', 'manual_evidence'].includes(method) || typeof evidence !== 'string' || evidence.length > 2000 || typeof reason !== 'string' || reason.length > 1000) throw fail(400, 'Invalid attendance request.');
      const status = action === 'check-in' ? 'attended' : req.body.status;
      if (!['attended', 'removed'].includes(status) || (action === 'correct' && (!Number.isInteger(expectedRevision) || expectedRevision < 1 || !reason.trim()))) throw fail(400, 'Corrections require a reason and the current revision.');
      const now = new Date().toISOString();
      if (occurredAt !== null && (typeof occurredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(occurredAt) || !Number.isFinite(Date.parse(occurredAt)))) throw fail(400, 'Use an explicit occurrence date and timezone.');
      const occurrence = occurredAt === null ? now : new Date(occurredAt).toISOString();
      if (Date.parse(occurrence) > Date.now() + 60000) throw fail(400, 'Attendance cannot occur in the future.');
      if ((action === 'correct' || method === 'manual_evidence' || Date.parse(now) - Date.parse(occurrence) > 86400000) && (occurredAt === null || !evidence.trim())) throw fail(400, 'Manual or past attendance and corrections require an explicit date and evidence.');
      if (memberUid === res.locals.uid) throw fail(403, 'Another staff member must verify your attendance.');
      const attendanceId = `${sessionId}~${memberUid}`;
      const fingerprint = createHash('sha256').update(JSON.stringify({ sessionId, memberUid, action, method, occurredAt, evidence, reason, expectedRevision, status })).digest('hex');
      const result = await database.runTransaction(async transaction => {
        const event = await attendanceStaff(database, transaction, sessionId, res.locals.uid, res.locals.claims.email);
        const account = await accounts.getUser(memberUid).catch(issue => {
          if (issue.code === 'auth/user-not-found') throw fail(409, 'A verified member is required.');
          throw issue;
        });
        if (!account.emailVerified || account.disabled || !account.providerData.length) throw fail(409, 'A verified member is required.');
        const knownEvent = eventSnapshot(event.data()!);
        if ((event.data()?.status === 'Closed' || (knownEvent.date && Date.parse(now) - Date.parse(knownEvent.date) > 86400000)) && (occurredAt === null || !evidence.trim())) throw fail(400, 'Past events require an explicit attendance date and evidence.');
        const attendanceRef = database.doc(`attendance/${attendanceId}`);
        const auditRef = database.doc(`attendanceAudit/${attendanceId}~${requestId}`);
        const [profile, actorProfile, pointer, current, replay] = await Promise.all([
          transaction.get(database.doc(`profiles/${memberUid}`)), transaction.get(database.doc(`profiles/${res.locals.uid}`)),
          transaction.get(database.doc(`registrations/${attendanceId}`)), transaction.get(attendanceRef), transaction.get(auditRef),
        ]);
        // Both profile reads serialize with deletion, including verifier erasure.
        if (profile.data()?.state !== 'active' || actorProfile.data()?.state !== 'active') throw fail(409, 'An active member and staff profile are required.');
        if (!pointer.exists || pointer.data()?.uid !== memberUid || pointer.data()?.sessionId !== sessionId || !validParticipantId(pointer.data()?.participantId)) throw fail(409, 'Use the existing linked event registration.');
        const participant = await transaction.get(database.doc(`participants/${pointer.data()!.participantId}`));
        if (!participant.exists || !attendanceEligible(participant.data()!, sessionId, memberUid)) throw fail(409, 'Active linked event participation is required.');
        if (replay.exists) {
          if (replay.data()?.fingerprint !== fingerprint || replay.data()?.staffUid !== res.locals.uid) throw fail(409, 'Request identifier already used.');
          return { attendanceId, revision: replay.data()!.revision, duplicate: true };
        }
        const previous = current.data();
        if (action === 'check-in' && current.exists) {
          if (previous?.status === 'attended') return { attendanceId, revision: previous.revision, duplicate: true };
          throw fail(409, 'Use a correction to restore removed attendance.');
        }
        if (action === 'correct' && (!current.exists || previous?.revision !== expectedRevision)) throw fail(409, 'Attendance changed. Refresh before correcting.');
        const revision = (previous?.revision || 0) + 1;
        const record = { sessionId, uid: memberUid, participantId: participant.id, status, occurredAt: occurrence, recordedAt: now, verifiedBy: res.locals.uid, method, revision, event: previous?.event || eventSnapshot(event.data()!) };
        transaction.set(attendanceRef, record);
        transaction.create(auditRef, { attendanceId, sessionId, memberUid, staffUid: res.locals.uid, action, status, occurredAt: occurrence, recordedAt: now, method, reason: reason.trim(), evidence: evidence.trim(), revision, fingerprint, previous: previous ? { status: previous.status, occurredAt: previous.occurredAt, revision: previous.revision } : null });
        return { attendanceId, revision, duplicate: false };
      });
      res.json(result);
    } catch (issue: any) { res.status(issue.status || 500).json({ error: issue.message }); }
  });

  router.post('/event-attendance', async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!validId(sessionId)) throw fail(400, 'Invalid event.');
      const records = await database.runTransaction(async transaction => {
        await attendanceStaff(database, transaction, sessionId, res.locals.uid, res.locals.claims.email);
        const [attendance, audit] = await Promise.all([
          transaction.get(database.collection('attendance').where('sessionId', '==', sessionId)),
          transaction.get(database.collection('attendanceAudit').where('sessionId', '==', sessionId)),
        ]);
        return attendance.docs.map(entry => ({ ...entry.data(), audit: audit.docs.filter(change => change.data().attendanceId === entry.id).map(change => { const { fingerprint, ...details } = change.data(); return details; }).sort((first, second) => first.revision - second.revision) }));
      });
      res.json({ records });
    } catch (issue: any) { res.status(issue.status || 500).json({ error: issue.message }); }
  });

  router.post('/member-history', async (req, res) => {
    try {
      const memberUid = req.body.memberUid || res.locals.uid;
      if (!validId(memberUid)) throw fail(400, 'Invalid member.');
      const entries = await database.runTransaction(async transaction => {
        const [profile, actorProfile, pointers, records, visibility] = await Promise.all([
          transaction.get(database.doc(`profiles/${memberUid}`)), transaction.get(database.doc(`profiles/${res.locals.uid}`)),
          transaction.get(database.collection('registrations').where('uid', '==', memberUid)),
          transaction.get(database.collection('attendance').where('uid', '==', memberUid)),
          transaction.get(database.collection('historyVisibility').where('uid', '==', memberUid)),
        ]);
        if (profile.data()?.state !== 'active' || actorProfile.data()?.state !== 'active') throw fail(404, 'History unavailable.');
        const own = memberUid === res.locals.uid;
        const sessions = new Set([...pointers.docs.map(entry => entry.data().sessionId), ...records.docs.map(entry => entry.data().sessionId)]);
        const history = [];
        for (const sessionId of sessions) {
          if (!validId(sessionId)) continue;
          const selection = visibility.docs.find(entry => entry.id === `${sessionId}~${memberUid}` && entry.data().sessionId === sessionId)?.data()?.visible === true;
          if (!own && !selection) continue;
          const pointer = pointers.docs.find(entry => entry.id === `${sessionId}~${memberUid}` && entry.data().sessionId === sessionId)?.data();
          const attendance = records.docs.find(entry => entry.id === `${sessionId}~${memberUid}`)?.data();
          const event = await transaction.get(database.doc(`sessions/${sessionId}`));
          // Saved metadata preserves history; createdAt is never an event date.
          const snapshot = attendance?.event || pointer?.event || eventSnapshot(event.data() || {});
          const summary = historySummary(sessionId, snapshot, attendance, !!pointer);
          if (own) {
            const audit = await transaction.get(database.collection('attendanceAudit').where('attendanceId', '==', `${sessionId}~${memberUid}`));
            history.push({ ...summary, visible: selection, revision: attendance?.revision || 0, recordedAt: attendance?.recordedAt || null, method: attendance?.method || null, audit: audit.docs.map(change => { const { fingerprint, ...details } = change.data(); return details; }).sort((first, second) => first.revision - second.revision) });
          } else history.push(summary);
        }
        return history.sort((first, second) => first.sessionId.localeCompare(second.sessionId));
      });
      res.json({ entries });
    } catch (issue: any) { res.status(issue.status || 500).json({ error: issue.message }); }
  });

  router.post('/history-visibility', async (req, res) => {
    try {
      const { sessionId, visible } = req.body;
      if (!validId(sessionId) || typeof visible !== 'boolean') throw fail(400, 'Invalid history selection.');
      const uid = res.locals.uid;
      await database.runTransaction(async transaction => {
        const [profile, pointer, attendance] = await Promise.all([
          transaction.get(database.doc(`profiles/${uid}`)), transaction.get(database.doc(`registrations/${sessionId}~${uid}`)), transaction.get(database.doc(`attendance/${sessionId}~${uid}`)),
        ]);
        if (profile.data()?.state !== 'active' || !(pointer.data()?.uid === uid || attendance.data()?.uid === uid)) throw fail(409, 'History entry unavailable.');
        transaction.set(database.doc(`historyVisibility/${sessionId}~${uid}`), { uid, sessionId, visible });
      });
      res.json({ updated: true });
    } catch (issue: any) { res.status(issue.status || 500).json({ error: issue.message }); }
  });
}
