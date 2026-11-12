import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { connectionActions, contactProjection, nextConnectionState, type ConnectionAction, type ConnectionCore } from '../shared/connections';
import { contactFields, emptyDetails, validateProfileEdit } from '../shared/profile';

export const pairKey = (first: string, second: string) => createHash('sha256').update(JSON.stringify([first, second].sort())).digest('hex');
export const blockKey = (uid: string) => createHash('sha256').update(JSON.stringify(['connection-block-v1', uid])).digest('hex');
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const viewPath = (owner: string, peer: string) => `connectionViews/${owner}/peers/${peer}`;

// Mounted AFTER verified, non-anonymous identity middleware. Payload identities
// never select the actor. Canonical relation and both private views commit together.
export function connectionsRouter(database: Firestore) {
  const router = Router();
  router.post('/connections/:action', async (req, res) => {
    try {
      const actor = res.locals.uid as string;
      const action = req.params.action as ConnectionAction | 'inspect';
      const { peerUid, generation } = req.body || {};
      if (!req.body || Object.keys(req.body).some(key => !['peerUid', 'generation'].includes(key)) || typeof peerUid !== 'string' || !peerUid || peerUid.length > 128 || peerUid.includes('/') || peerUid === actor || ![...connectionActions, 'inspect'].includes(action) || (generation !== undefined && (typeof generation !== 'string' || generation.length > 100))) throw fail(400, 'Invalid connection operation.');
      const result = await database.runTransaction(async transaction => {
        const relationRef = database.doc(`connectionPairs/${pairKey(actor, peerUid)}`);
        const ownViewRef = database.doc(viewPath(actor, peerUid));
        const peerViewRef = database.doc(viewPath(peerUid, actor));
        const ownBlockRef = database.doc(`connectionBlocks/${actor}/targets/${blockKey(peerUid)}`);
        const [ownProfile, peerProfile, relation, ownBlock, peerBlock, ownView, peerView, ownSource, peerSource] = await Promise.all([
          transaction.get(database.doc(`profiles/${actor}`)), transaction.get(database.doc(`profiles/${peerUid}`)), transaction.get(relationRef),
          transaction.get(ownBlockRef), transaction.get(database.doc(`connectionBlocks/${peerUid}/targets/${blockKey(actor)}`)), transaction.get(ownViewRef), transaction.get(peerViewRef),
          transaction.get(database.doc(`profileDetails/${actor}`)), transaction.get(database.doc(`profileDetails/${peerUid}`)),
        ]);
        if (ownProfile.data()?.state !== 'active' || peerProfile.data()?.state !== 'active') throw fail(409, 'Member unavailable.');
        const current = relation.exists ? relation.data() as ConnectionCore : undefined;
        const projectionFor = (source: typeof ownSource, profile: typeof ownProfile) => contactProjection(source.exists ? validateProfileEdit({ name: profile.data()!.name, ...source.data() }).details : emptyDetails());
        if (action === 'inspect') {
          if (ownBlock.exists || peerBlock.exists) return { state: 'blocked' };
          // Only keys, never private source or unapproved contact values.
          const ownProjection = projectionFor(ownSource, ownProfile);
          const peerProjection = current?.state === 'pending' || current?.state === 'accepted' ? projectionFor(peerSource, peerProfile) : {};
          return { state: current?.state || 'none', ownFields: contactFields.filter(field => !!ownProjection[field]), peerFields: contactFields.filter(field => !!peerProjection[field]) };
        }
        if (action !== 'block' && (ownBlock.exists || peerBlock.exists)) throw fail(409, 'Connection unavailable.');
        if (!['request', 'block'].includes(action) && (!current || generation !== current.generation)) throw fail(409, 'Connection changed. Refresh and try again.');
        let state;
        try { state = nextConnectionState(action, actor, current); } catch (issue) { throw fail(409, (issue as Error).message); }
        if (action === 'seen') {
          if (ownView.exists) transaction.update(ownViewRef, { unread: false });
          return { ...ownView.data(), unread: false };
        }
        if (action === 'request' && current && ['pending', 'accepted'].includes(current.state)) return ownView.data();
        const next = { requester: action === 'request' ? actor : current?.requester || actor, generation: action === 'request' || action === 'block' ? randomUUID() : current!.generation, state };
        if (state === 'accepted') {
          // Initializes existing PR2 selections without a bulk migration. Reads
          // conflict with saves/deletion; project only validated canonical fields.
          transaction.set(database.doc(`connectionContacts/${actor}`), projectionFor(ownSource, ownProfile));
          transaction.set(database.doc(`connectionContacts/${peerUid}`), projectionFor(peerSource, peerProfile));
        }
        transaction.set(relationRef, { ...next, members: [actor, peerUid].sort() });
        const ownNext = { ...next, pairId: relationRef.id, peerUid, unread: false };
        transaction.set(ownViewRef, ownNext);
        transaction.set(peerViewRef, { ...next, pairId: relationRef.id, peerUid: actor, state: state === 'blocked' ? 'removed' : state, unread: state === 'pending' || state === 'accepted' ? true : false });
        if (action === 'block') transaction.set(ownBlockRef, {});
        return ownNext;
      });
      res.json(result);
    } catch (issue) { res.status((issue as any).status || 500).json({ error: (issue as Error).message }); }
  });
  return router;
}

// Called after beginProfileDeletion marks deleting. Discovery only: every
// delete runs through the parent attempt-fenced transaction queue, including
// targets discovered after a stale worker resumes. No raw cleanup writes.
// Preserve OTHER members' empty, hashed safety preferences across recreation.
export async function queueConnectionCleanup(database: Firestore, uid: string, cleanup: { delete: (reference: DocumentReference) => void }) {
  const [relations, ownViews, ownBlocks, incomingViews] = await Promise.all([
    database.collection('connectionPairs').where('members', 'array-contains', uid).get(),
    database.collection(`connectionViews/${uid}/peers`).get(), database.collection(`connectionBlocks/${uid}/targets`).get(),
    database.collectionGroup('peers').where('peerUid', '==', uid).get(),
  ]);
  const removals = new Map<string, DocumentReference>();
  const include = (reference: DocumentReference) => removals.set(reference.path, reference);
  for (const relation of relations.docs) {
    for (const peer of relation.data().members as string[]) if (peer !== uid) include(database.doc(viewPath(peer, uid)));
    include(relation.ref);
  }
  for (const record of [...ownViews.docs, ...ownBlocks.docs, ...incomingViews.docs]) include(record.ref);
  for (const reference of removals.values()) cleanup.delete(reference);
}
