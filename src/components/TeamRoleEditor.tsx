import { useState } from 'react';
import { TEAM_LABELS } from '../../shared/participation';
import { identityRequest } from '../identity';

export default function TeamRoleEditor({ collectionName, teamId, members }: { collectionName: string; teamId: string; members: any[] }) {
  const [participantId, setParticipantId] = useState('');
  const [label, setLabel] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return <details className="p-3 rounded-lg border border-zinc-700 text-sm"><summary>Team role labels</summary><p className="my-2">Describe the work. A label never changes leadership or permissions. Members can edit their own label; the team leader and event staff can edit any member.</p>
    <form className="space-y-2" onSubmit={async event => { event.preventDefault(); setBusy(true); try { await identityRequest('team-role', { collectionName, teamId, participantId, label }); setMessage('Team role label saved.'); } catch (issue: any) { setMessage(issue.message); } finally { setBusy(false); } }}>
      <label className="block">Team member<select required className="w-full block bg-zinc-900 p-3" value={participantId} onChange={event => { setParticipantId(event.target.value); setLabel(members.find(member => member.id === event.target.value)?.teamRoleLabels?.[`${collectionName}~${teamId}`] || ''); }}><option value="">Select member</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="block">Team role label<select className="w-full block bg-zinc-900 p-3" value={label} onChange={event => setLabel(event.target.value)}><option value="">No label</option>{TEAM_LABELS.map(role => <option key={role} value={role}>{role}</option>)}</select></label>
      <button disabled={busy} className="p-3 rounded bg-emerald-700">Save team role label</button><p role="status">{message}</p>
    </form>
  </details>;
}
