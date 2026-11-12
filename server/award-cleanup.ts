import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { AwardRecipient } from '../shared/awards';

// PR1 integration adapter. The caller MUST persist this plan in its durable
// generation manifest before scrubbing any personal discovery fields. Retrying
// discovery alone after partial scrubbing loses recovery IDs.
export type AwardCleanupPlan = { resultIds: string[]; auditIds: string[]; achievementIds: string[]; participantIds: string[] };
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
  return { resultIds: [...new Set(results.flatMap(group => group.docs.map(record => record.id)))], auditIds: [...new Set(audits.flatMap(group => group.docs.map(record => record.id)))], achievementIds: achievements.docs.map(record => record.id), participantIds };
}

// The parent supplies its final generation-fence assertion inside EVERY
// transaction. Never adapt this to raw BulkWriter writes or a state-only check.
// One record per transaction permits bounded, idempotent retries at any point.
export async function scrubAwardRecord(database: Firestore, uid: string, plan: AwardCleanupPlan, type: 'result' | 'audit' | 'achievement', recordId: string, assertGeneration: (transaction: Transaction) => Promise<void>) {
  const planned = type === 'result' ? plan.resultIds : type === 'audit' ? plan.auditIds : plan.achievementIds;
  if (!planned.includes(recordId)) throw new Error('Award cleanup record is outside the durable manifest.');
  await database.runTransaction(async transaction => {
    await assertGeneration(transaction);
    const path = type === 'result' ? `awardResults/${recordId}` : type === 'audit' ? `awardAudits/${recordId}` : `memberAchievements/${uid}/awards/${recordId}`;
    const record = await transaction.get(database.doc(path));
    if (!record.exists) return;
    const source = record.data()!;
    if (type === 'achievement') { transaction.delete(record.ref); return; }
    const subjectUids = (source.subjectUids || []).filter((memberId: string) => memberId !== uid);
    if (type === 'audit') {
      transaction.update(record.ref, { subjectUids, actorUid: source.actorUid === uid ? null : source.actorUid, reason: null });
      return;
    }
    const changes: Record<string, unknown> = { subjectUids, participantIds: (source.participantIds || []).filter((participantId: string) => !plan.participantIds.includes(participantId)) };
    if (source.updatedBy === uid) changes.updatedBy = null;
    if (plan.participantIds.includes(source.target?.participantId)) {
      changes.target = null;
      if (source.status === 'draft') changes.status = 'revoked';
    }
    if (source.snapshot) changes.snapshot = { ...source.snapshot, recipients: source.snapshot.recipients.map((recipient: AwardRecipient) => recipient.memberId === uid || (recipient.participantId && plan.participantIds.includes(recipient.participantId))
      ? { participantId: null, memberId: null, name: 'Deleted recipient', credit: 'deleted' }
      : recipient) };
    transaction.update(record.ref, changes);
  });
}
