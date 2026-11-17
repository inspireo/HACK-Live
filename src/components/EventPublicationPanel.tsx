import { Field, Section, Button, controlClass } from './ui/patterns';
import { useEffect, useState } from 'react';
import { invitationApi } from '../utils/invitationApi';
import ShareEventButton from './ShareEventButton';

const inputClass = controlClass;
const buttonClass = 'min-h-11 rounded-xl border border-zinc-600 px-4 py-2 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50';
const emptyFields = { title: '', description: '', venue: '', viewingUrl: '', startLocal: '', endLocal: '', timeZone: '', registrationRequired: true, calendarEnabled: false };
export default function EventPublicationPanel({ sessionId }: { sessionId: string }) {
  const [fields, setFields] = useState(emptyFields), [publication, setPublication] = useState<any>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [feedback, setFeedback] = useState('');
  const load = async () => {
    const result = await invitationApi(`events/${encodeURIComponent(sessionId)}/publication`);
    setPublication(result); setFields({ ...emptyFields, ...result.fields });
  };
  useEffect(() => { void load().catch(issue => setError(issue.message)); }, [sessionId]);
  async function save(action: string) {
    if (!publication || busy) return;
    setBusy(true); setError(''); setFeedback('');
    try {
      await invitationApi(`events/${encodeURIComponent(sessionId)}/publication/${action}`, { revision: publication.revision, ...(action === 'publish' ? { fields } : {}) });
      await load(); setFeedback(action === 'publish' ? 'Public event details published.' : action === 'renew' ? 'New seven-day invitation created. Previous link revoked.' : action === 'unpublish' ? 'Event details unpublished. Previous link is unavailable.' : 'Invitation revoked. Renew to share again.');
    } catch (issue) { setError((issue as Error).message); } finally { setBusy(false); }
  }
  return <Section title="Public event invitation" help="Publish only the event details below. Invitation links expire after seven days. Renew creates a new link and revokes the previous one. Revoke disables the link; unpublish also removes public details.">
    <p className="ui-privacy">Only these fields become public. Workshop content and profiles stay behind sign-in.</p>
    {error && <p role="alert" className="rounded-xl bg-red-950 p-3 text-red-200">{error}</p>}
    {!publication ? <p>Loading publication…</p> : <>
      <form onSubmit={event => { event.preventDefault(); void save('publish'); }} className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          {([
            ['title', 'Public event title', 'text'], ['description', 'Public description', 'textarea'],
            ['venue', 'Public venue', 'text'], ['viewingUrl', 'Public viewing URL', 'url'],
            ['startLocal', 'Event starts', 'datetime-local'], ['endLocal', 'Event ends', 'datetime-local'], ['timeZone', 'Event timezone (IANA)', 'text'],
          ] as const).map(([key, label, inputType]) => <div key={key} className={['title', 'description', 'timeZone'].includes(key) ? 'md:col-span-2' : ''}><Field label={label} htmlFor={`publication-${key}`} help={key === 'timeZone' ? 'Use an IANA timezone such as Asia/Singapore. Calendar export requires start, end, and timezone.' : key === 'viewingUrl' ? 'Optional public viewing link. Only publish a URL intended for every invitation recipient.' : undefined}>
            {inputType === 'textarea' ? <textarea id={`publication-${key}`} className={inputClass} value={fields[key]} onChange={event => setFields(before => ({ ...before, [key]: event.target.value }))} rows={3} maxLength={4000} />
              : <input id={`publication-${key}`} type={inputType} placeholder={key === 'timeZone' ? 'Asia/Singapore' : key === 'viewingUrl' ? 'https://' : undefined} className={inputClass} value={fields[key]} onChange={event => setFields(before => ({ ...before, [key]: event.target.value }))} required={key === 'title' || (fields.calendarEnabled && ['startLocal', 'endLocal', 'timeZone'].includes(key))} />}
          </Field></div>)}
        </div>
        <fieldset className="grid gap-4 rounded-xl border border-zinc-700 p-4 md:grid-cols-2"><legend className="px-2 text-sm font-medium text-zinc-300">Invitation actions</legend>
          <label className="flex items-center gap-3"><input type="checkbox" className="accent-emerald-400" checked={fields.registrationRequired} onChange={event => setFields(before => ({ ...before, registrationRequired: event.target.checked }))} />Registration required</label>
          <label className="flex items-center gap-3"><input type="checkbox" className="accent-emerald-400" checked={fields.calendarEnabled} onChange={event => setFields(before => ({ ...before, calendarEnabled: event.target.checked }))} />Add to calendar</label>
        </fieldset>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Publish event details'}</Button>
      </form>
      <div className="space-y-4 border-t border-zinc-800 pt-5">
        <p className="text-sm text-zinc-300">{publication.published ? publication.token ? 'Published · current invitation active' : 'Published · invitation needs renewal' : 'Unpublished · no public invitation'}{publication.expiresAt && <span className="mt-1 block text-xs text-zinc-400">Link expiry: {new Date(publication.expiresAt).toLocaleString()}</span>}</p>
        <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={busy} onClick={() => { setError(''); void load().catch(issue => setError(issue.message)); }}>Reload publication</button>
          <button className={buttonClass} disabled={busy || !publication.published} onClick={() => void save('renew')}>Renew invitation</button>
          <button className={buttonClass} disabled={busy || !publication.token} onClick={() => void save('revoke')}>Revoke invitation</button>
          <button className={buttonClass} disabled={busy || !publication.published} onClick={() => void save('unpublish')}>Unpublish details</button></div>
        {publication.token && <div className="space-y-3"><a className="text-sm text-emerald-300 underline" href={`/invite/${publication.token}`} target="_blank" rel="noreferrer">Open public preview</a><ShareEventButton key={publication.revision} sessionId={sessionId} /></div>}
        <p role="status" aria-live="polite" className="text-sm text-emerald-300">{feedback}</p>
      </div>
    </>}
  </Section>;
}
