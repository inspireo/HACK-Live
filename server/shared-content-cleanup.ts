import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { createProfileCleanup, withProfileDeletionFence } from './profile-cleanup';

type AttributionTarget = { path: string; proposalId: string; slots: string[]; submitterName: string | null };
type SharedContentPlan = { proposals: { path: string; submitterName: string | null }[]; challenges: AttributionTarget[] };
type Manifest = { participantIds: string[]; proposalIds: string[] };
type CleanupQueue = Pick<ReturnType<typeof createProfileCleanup>, 'transform'>;
const attributionPattern = () => /<p><em>Proposed by:[\s\S]*?<\/em><\/p>/gi;

// Remember the original attribution slots, not editable prose. Retry must not
// learn a newer surviving author's attribution as the identity to erase.
async function sharedContentPlan(database: Firestore, uid: string, attemptId: string, manifest: Manifest): Promise<SharedContentPlan> {
  return withProfileDeletionFence(database, uid, attemptId, async (transaction, job) => {
    if (job.data()?.sharedContentPlan) return job.data()!.sharedContentPlan as SharedContentPlan;
    const plan: SharedContentPlan = { proposals: [], challenges: [] };
    const participants = await Promise.all(manifest.participantIds.map(participantId => transaction.get(database.doc(`participants/${participantId}`))));
    const memberNames = participants.map(participant => participant.data()?.name).filter((name): name is string => typeof name === 'string' && !!name.trim());
    for (const proposalId of manifest.proposalIds) {
      const proposal = await transaction.get(database.doc(`proposedChallenges/${proposalId}`));
      plan.proposals.push({ path: proposal.ref.path, submitterName: typeof proposal.data()?.submitterName === 'string' ? proposal.data()!.submitterName : null });
      const owner = proposal.data()?.uid || proposal.data()?.submitterParticipantId;
      const ownProposal = !owner || owner === uid || manifest.participantIds.includes(owner);
      const originalNames = new Set([...memberNames, ...(ownProposal ? [proposal.data()?.submitterName, proposal.data()?.submitterRealName] : [])].filter((name): name is string => typeof name === 'string' && !!name.trim()).map(name => name.trim()));
      const published = await transaction.get(database.collection('challenges').where('proposedChallengeId', '==', proposalId));
      const references = new Map(published.docs.map(challenge => [challenge.ref.path, challenge.ref]));
      if (proposal.data()?.publishedChallengeId) {
        const reference = database.doc(`challenges/${proposal.data()!.publishedChallengeId}`);
        references.set(reference.path, reference);
      }
      for (const reference of references.values()) {
        const challenge = await transaction.get(reference);
        const data = challenge.data();
        if (data) plan.challenges.push({ path: reference.path, proposalId, slots: typeof data.summary === 'string' ? (data.summary.match(attributionPattern()) || []).filter((slot: string) => originalNames.has(slot.replace(/^<p><em>Proposed by:\s*|<\/em><\/p>$/gi, '').trim())) : [], submitterName: typeof data.submitterName === 'string' && originalNames.has(data.submitterName.trim()) ? data.submitterName : null });
      }
    }
    transaction.update(job.ref, { sharedContentPlan: plan });
    return plan;
  });
}

export async function queueSharedContentCleanup(database: Firestore, uid: string, attemptId: string, manifest: Manifest, cleanup: CleanupQueue) {
  const plan = await sharedContentPlan(database, uid, attemptId, manifest);
  const ownedIdentity = (value: unknown) => value === uid || typeof value === 'string' && manifest.participantIds.includes(value);
  for (const target of plan.proposals) cleanup.transform(database.doc(target.path), current => {
    const data = current.data()!;
    const currentOwner = data.uid || data.submitterParticipantId;
    if (!ownedIdentity(data.uid) && !ownedIdentity(data.submitterParticipantId) && (currentOwner || target.submitterName === null || data.submitterName !== target.submitterName)) return null;
    return { kind: 'update', changes: { uid: null, submitterName: 'Deleted member', submitterRealName: FieldValue.delete(), submitterProfileDescriptor: FieldValue.delete(), submitterParticipantId: FieldValue.delete() } };
  });
  for (const target of plan.challenges) cleanup.transform(database.doc(target.path), current => {
    const data = current.data()!;
    if (data.proposedChallengeId && data.proposedChallengeId !== target.proposalId) return null;
    const changes: Record<string, unknown> = {};
    if (typeof data.summary === 'string') {
      const summary = data.summary.replace(attributionPattern(), slot => target.slots.includes(slot) ? '<p><em>Proposed by: Deleted member</em></p>' : slot);
      if (summary !== data.summary) changes.summary = summary;
    }
    if (target.submitterName !== null && data.submitterName === target.submitterName && data.submitterName !== 'Deleted member') changes.submitterName = 'Deleted member';
    return Object.keys(changes).length ? { kind: 'update', changes } : null;
  });
  for (const collectionName of ['teams', 'discoveryTeams', 'formingTeams', 'formingDiscoveryTeams']) {
    const records = await database.collection(collectionName).get();
    for (const record of records.docs) cleanup.transform(record.ref, current => {
      const team = current.data()!;
      if (collectionName.startsWith('forming') && ownedIdentity(team.leaderId)) return { kind: 'delete' };
      const changes: Record<string, unknown> = {};
      if (Array.isArray(team.memberIds) && team.memberIds.some(ownedIdentity)) changes.memberIds = team.memberIds.filter((member: unknown) => !ownedIdentity(member));
      for (const field of ['leaderId', 'createdBy', 'nameSubmittedBy']) if (ownedIdentity(team[field])) changes[field] = FieldValue.delete();
      return Object.keys(changes).length ? { kind: 'update', changes } : null;
    });
  }
}
