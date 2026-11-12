import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { AwardRecipient } from '../shared/awards';
import { withProfileDeletionFence } from './profile-cleanup';

// PR1 integration adapter. The caller MUST persist this plan in its durable
// generation manifest before scrubbing any personal discovery fields. Retrying
// discovery alone after partial scrubbing loses recovery IDs.
export type AwardCleanupPlan = { resultIds: string[]; auditIds: string[]; achievementIds: string[]; participantIds: string[]; completed: boolean };
export async function planAwardCleanup(database: Firestore, transaction: Transaction, uid: string, participantIds: string[]): Promise<AwardCleanupPlan> {
  const resultQueries = [
    database.collection('awardResults').where('subjectUids', 'array-contains', uid),
    database.collection('awardResults').where('updatedBy', '==', uid),
    ...participantIds.flatMap(participantId => [
      database.collection('awardResults').where('participantIds', 'array-contains', participantId),
      database.collection('awardResults').where('target.participantId', '==', participantId),
    ]),
  ];
  const auditQueries = [database.collection('awardAudits').where('actorUid', '==', uid), database.collection('awardAudits').where('subjectUids', 'array-contains', uid)];
  const results = await Promise.all(resultQueries.map(query => transaction.get(query)));
  const audits = await Promise.all(auditQueries.map(query => transaction.get(query)));
  const achievements = await transaction.get(database.collection(`memberAchievements/${uid}/awards`));
  return { resultIds: [...new Set(results.flatMap(group => group.docs.map(record => record.id)))], auditIds: [...new Set(audits.flatMap(group => group.docs.map(record => record.id)))], achievementIds: achievements.docs.map(record => record.id), participantIds, completed: false };
}

// Both discovery/persistence and every subsequent write share PR1/PR6's attempt
// fence. A stale caller cannot create a manifest after completion/recreation.
export async function prepareAwardCleanup(database: Firestore, uid: string, attemptId: string): Promise<AwardCleanupPlan> {
  return withProfileDeletionFence(database, uid, attemptId, async (transaction, job) => {
    if (job.data()?.awardPlan) return job.data()!.awardPlan as AwardCleanupPlan;
    const plan = await planAwardCleanup(database, transaction, uid, job.data()!.participantIds);
    transaction.update(job.ref, { awardPlan: plan });
    return plan;
  });
}

// One current-record transaction per item permits bounded idempotent recovery.
// The authoritative saved plan is re-read inside the fence, never supplied by
// an old worker. Conditional changes preserve unrelated/newer staff attribution.
export async function scrubAwardRecord(database: Firestore, uid: string, attemptId: string, type: 'result' | 'audit' | 'achievement', recordId: string) {
  await withProfileDeletionFence(database, uid, attemptId, async (transaction, job) => {
    const plan = job.data()?.awardPlan as AwardCleanupPlan | undefined;
    const planned = type === 'result' ? plan?.resultIds : type === 'audit' ? plan?.auditIds : plan?.achievementIds;
    if (!planned?.includes(recordId)) throw new Error('Award cleanup record is outside the durable manifest.');
    const path = type === 'result' ? `awardResults/${recordId}` : type === 'audit' ? `awardAudits/${recordId}` : `memberAchievements/${uid}/awards/${recordId}`;
    const record = await transaction.get(database.doc(path));
    if (!record.exists) return;
    const source = record.data()!;
    if (type === 'achievement') { transaction.delete(record.ref); return; }
    const subjectMatch = source.subjectUids?.includes(uid);
    if (type === 'audit') {
      const actorMatch = source.actorUid === uid;
      if (!subjectMatch && !actorMatch) return;
      transaction.update(record.ref, { ...(subjectMatch ? { subjectUids: source.subjectUids.filter((memberId: string) => memberId !== uid) } : {}), ...(actorMatch ? { actorUid: null } : {}), reason: null });
      return;
    }
    const changes: Record<string, unknown> = {};
    if (subjectMatch) changes.subjectUids = source.subjectUids.filter((memberId: string) => memberId !== uid);
    if (source.participantIds?.some((participantId: string) => plan.participantIds.includes(participantId))) changes.participantIds = source.participantIds.filter((participantId: string) => !plan.participantIds.includes(participantId));
    if (source.updatedBy === uid) changes.updatedBy = null;
    if (plan.participantIds.includes(source.target?.participantId)) {
      changes.target = null;
      if (source.status === 'draft') changes.status = 'revoked';
    }
    if (source.snapshot?.recipients.some((recipient: AwardRecipient) => recipient.memberId === uid || (recipient.participantId && plan.participantIds.includes(recipient.participantId)))) changes.snapshot = { ...source.snapshot, recipients: source.snapshot.recipients.map((recipient: AwardRecipient) => recipient.memberId === uid || (recipient.participantId && plan.participantIds.includes(recipient.participantId))
      ? { participantId: null, memberId: null, name: 'Deleted recipient', credit: 'deleted' }
      : recipient) };
    if (Object.keys(changes).length) transaction.update(record.ref, changes);
  });
}

export async function cleanupAwards(database: Firestore, uid: string, attemptId: string) {
  const plan = await prepareAwardCleanup(database, uid, attemptId);
  if (plan.completed) return;
  for (const [type, recordIds] of [['result', plan.resultIds], ['audit', plan.auditIds], ['achievement', plan.achievementIds]] as const) {
    for (const recordId of recordIds) await scrubAwardRecord(database, uid, attemptId, type, recordId);
  }
  await withProfileDeletionFence(database, uid, attemptId, async (transaction, job) => {
    transaction.update(job.ref, { 'awardPlan.completed': true });
  });
}
