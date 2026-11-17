import { InfoHelp } from './ui/InfoHelp';
import { useState } from 'react';
import { EVENT_ROLES } from '../../shared/participation';
import { identityRequest } from '../identity';

export default function EventRolesEditor({ sessionId, participants, challenges }: { sessionId: string; participants: any[]; challenges: any[] }) {
  const [memberUid, setMemberUid] = useState('');
  const [roles, setRoles] = useState<string[]>(['participant']);
  const [challengeId, setChallengeId] = useState('');
  const [participationState, setParticipationState] = useState('active');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return <details className="rounded-xl border border-zinc-700 p-4"><summary>Official event roles</summary>
    <InfoHelp label="Official event roles">Issue roles to a verified member, including yourself if you already administer this event. Roles describe event participation and do not grant administration access. Keep Participant selected for people joining discovery or solution teams.</InfoHelp><p className="ui-privacy">Keep Participant selected for people joining discovery or solution teams.</p>
    <form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage('');
      try { await identityRequest('event-roles', { sessionId, memberUid, roles, challengeId: roles.includes('challenge owner') && challengeId ? challengeId : null, participationState }); setMessage('Official event roles saved.'); }
      catch (issue: any) { setMessage(issue.message); } finally { setBusy(false); }
    }}>
      <label className="block">Registered member account ID<input required className="block w-full bg-zinc-950 p-3 rounded" value={memberUid} list="role-members" onChange={event => {
        setMemberUid(event.target.value); const member = participants.find(participant => participant.memberId === event.target.value);
        setRoles(member?.officialRoles ?? ['participant']); setChallengeId(member?.roleChallengeId || ''); setParticipationState(member?.participationState || 'active');
      }} /></label>
      <datalist id="role-members">{participants.filter(member => member.memberId).map(member => <option key={member.id} value={member.memberId}>{member.name}</option>)}</datalist>
      <fieldset><legend>Official event roles</legend><div className="flex flex-wrap gap-3">{EVENT_ROLES.map(role => <label key={role} className="capitalize"><input type="checkbox" checked={roles.includes(role)} onChange={event => setRoles(event.target.checked ? [...roles, role] : roles.filter(existing => existing !== role))} /> {role}</label>)}</div></fieldset>
      {roles.includes('challenge owner') && <label className="block">Relevant challenge (optional)<select className="block bg-zinc-950 p-3" value={challengeId} onChange={event => setChallengeId(event.target.value)}><option value="">No specific challenge</option>{challenges.map(challenge => <option key={challenge.id} value={challenge.id}>{challenge.title}</option>)}</select></label>}
      <label className="block">Participation<select className="block bg-zinc-950 p-3" value={participationState} onChange={event => setParticipationState(event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <p className="text-sm">Remove forming and final team memberships before removing Participant or deactivating participation.</p>
      <button disabled={busy || !roles.length} className="p-3 bg-emerald-700 rounded">Save official event roles</button><p role="status">{message}</p>
    </form>
  </details>;
}
