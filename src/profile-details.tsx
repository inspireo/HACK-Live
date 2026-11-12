import React, { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { communityProjection, contactFields, emptyDetails, fieldLabels, professionalFields, safeProfileUrl, validateProfileEdit, type ProfessionalValues, type ProfileDetails } from '../shared/profile';

export function ProfessionalView({ values }: { values: ProfessionalValues }) {
  return <div className="space-y-3">{professionalFields.map(field => {
    const value = values[field];
    if (!value) return null;
    if (['avatarUrl', 'linkedin', 'github', 'portfolio'].includes(field)) {
      try { safeProfileUrl(value, field); } catch { return null; }
      if (field === 'avatarUrl') return <img key={field} src={value} alt="Member avatar" className="w-24 h-24 rounded-full object-cover" referrerPolicy="no-referrer" loading="lazy" />;
      return <p key={field}><a className="underline" href={value} target="_blank" rel="noopener noreferrer">{fieldLabels[field]}</a></p>;
    }
    return <p className="whitespace-pre-wrap break-words" key={field}><strong>{fieldLabels[field]}: </strong>{value}</p>;
  })}</div>;
}

export function MemberDetails({ memberId }: { memberId: string }) {
  const [values, setValues] = useState<ProfessionalValues>({});
  useEffect(() => {
    setValues({});
    return onSnapshot(doc(db, 'memberDetails', memberId), snapshot => setValues(snapshot.data() || {}), () => setValues({}));
  }, [memberId]);
  return <ProfessionalView values={values} />;
}

export function ProfileEditor({ uid, name, onNameChange, save, onSaved }: { uid: string; name: string; onNameChange: (name: string) => void; save: (payload: object) => Promise<unknown>; onSaved: (message: string) => void }) {
  const [details, setDetails] = useState<ProfileDetails>(emptyDetails);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    let current = true;
    setReady(false); setError('');
    getDoc(doc(db, 'profileDetails', uid)).then(snapshot => { if (current) { setDetails(snapshot.exists() ? snapshot.data() as ProfileDetails : emptyDetails()); setReady(true); } }).catch(issue => { if (current) setError(issue.message); });
    return () => { current = false; };
  }, [uid]);
  const inputClass = 'block w-full p-3 bg-zinc-900 border border-zinc-600 rounded-lg';
  if (!ready) return error ? <p role="alert">{error}</p> : <p>Loading profile details…</p>;
  return <><form className="space-y-5" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { const validated = validateProfileEdit({ name, ...details }); await save({ name: validated.name, ...validated.details }); setDetails(validated.details); onSaved('Profile saved.'); }
    catch (issue) { setError((issue as Error).message); } finally { setBusy(false); }
  }}>
    <label className="block">Name<input className={inputClass} value={name} onChange={event => onNameChange(event.target.value)} required maxLength={100} /></label>
    <p>Your name is visible to members. Every optional field starts private. Choose which professional details members can see.</p>
    <p className="text-sm">Photo: paste a public HTTPS image URL you control. No upload is provided. External image hosts receive image requests. Clear the URL and save to remove it from your profile; the original stays with its host.</p>
    <fieldset className="space-y-4"><legend className="font-bold">Professional details</legend>{professionalFields.map(field => <div key={field}>
      <label className="block" htmlFor={`professional-${field}`}>{fieldLabels[field]}</label><textarea id={`professional-${field}`} rows={field === 'bio' || field === 'work' ? 3 : 1} className={inputClass} value={details.professional[field] || ''} maxLength={field === 'bio' || field === 'work' ? 2000 : 500} onChange={event => setDetails(previous => ({ ...previous, professional: { ...previous.professional, [field]: event.target.value } }))} />
      <label><input type="checkbox" checked={details.communityFields.includes(field)} onChange={event => setDetails(previous => ({ ...previous, communityFields: event.target.checked ? [...previous.communityFields, field] : previous.communityFields.filter(value => value !== field) }))} /> Show {fieldLabels[field]} to members</label>
    </div>)}</fieldset>
    <fieldset className="space-y-4"><legend className="font-bold">Contact details and sharing</legend>
      <p>Contacts stay private unless you select them for approved connections. Contact email is separate from your sign-in email.</p>
      <p>Choose one global selection for ALL approved connections. Saved selection and value changes apply to every current and future approved connection. Pending requests and other members cannot see your contacts.</p>
      <p>Unfriend or block revokes future contact access in both directions immediately. Previously saved copies cannot be recalled.</p>
      {contactFields.map(field => <div key={field}><label className="block">{fieldLabels[field]}<input className={inputClass} type={field === 'contactEmail' ? 'email' : 'text'} value={details.contacts[field] || ''} maxLength={500} onChange={event => setDetails(previous => ({ ...previous, contacts: { ...previous.contacts, [field]: event.target.value } }))} /></label>
        <label><input type="checkbox" checked={details.connectionFields.includes(field)} onChange={event => setDetails(previous => ({ ...previous, connectionFields: event.target.checked ? [...previous.connectionFields, field] : previous.connectionFields.filter(value => value !== field) }))} /> Share {fieldLabels[field]} with all approved connections</label></div>)}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <button disabled={busy} className="p-3 bg-emerald-700 rounded-lg disabled:opacity-50">Save profile</button>
  </form>
  <button type="button" className="underline" onClick={() => setPreview(value => !value)}>Preview community view</button>
  {preview && <section aria-label="Community preview" className="border border-zinc-600 rounded-lg p-4 space-y-3"><h2 className="text-xl">{name}</h2><p>Preview of your current edits. Save to apply them.</p><ProfessionalView values={communityProjection(details)} /><p>Contacts are hidden.</p></section>}</>;
}
