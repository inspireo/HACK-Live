import React, { useEffect, useRef, useState } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { profileEditorDetails, normalizeTelegram, communityProjection, contactFields, emptyDetails, fieldLabels, professionalFields, isManagedPhotoUrl, maxPhotoUploadBytes, safeProfileUrl, validateProfileEdit, type ProfessionalValues, type ProfileDetails } from '../shared/profile';
import { InfoHelp } from './components/ui/InfoHelp';
import { Button, Field, controlClass } from './components/ui/patterns';
import { PhoneInput } from './phone-input';
import { hydratePhone, phoneDraftValue, type PhoneDraft } from '../shared/phone-draft';
import { SkillsCombobox } from './skills-combobox';

// Fixed slot also serves downstream compact badges without changing the default size.
export function ProfilePhoto({ url, loading = false, size = 96 }: { url?: string; loading?: boolean; size?: number }) {
  const [viewer, setViewer] = useState(auth.currentUser);
  useEffect(() => onAuthStateChanged(auth, setViewer), []);
  const [photo, setPhoto] = useState<{ url?: string; viewer: typeof viewer; source?: string; state: 'loading' | 'ready' | 'error' } | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const requestGeneration = ++generation.current;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    const isCurrent = () => generation.current === requestGeneration && auth.currentUser === viewer;
    setPhoto({ url, viewer, state: 'loading' });
    (async () => {
      if (!url) return;
      let source: string;
      if (isManagedPhotoUrl(url)) {
        const token = await viewer?.getIdToken();
        if (!isCurrent()) return;
        if (!token) throw new Error('Photo unavailable');
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Photo unavailable');
        const blob = await response.blob();
        if (!isCurrent()) return;
        objectUrl = URL.createObjectURL(blob);
        source = objectUrl;
      } else source = safeProfileUrl(url, 'avatarUrl');
      if (isCurrent()) setPhoto({ url, viewer, source, state: 'loading' });
    })().catch(() => { if (isCurrent()) setPhoto({ url, viewer, state: 'error' }); });
    return () => { generation.current += 1; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, viewer]);
  const currentPhoto = photo && photo.url === url && photo.viewer === viewer && viewer === auth.currentUser ? photo : null;
  const pending = loading || (!!url && (!currentPhoto || currentPhoto.state === 'loading'));
  const requestGeneration = generation.current;
  return <span className="relative inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-800 align-middle" style={{ width: size, height: size }} aria-busy={pending}>
    {pending ? <span role="status" aria-label="Loading profile photo"><span className="block h-5 w-5 animate-spin rounded-full border-2 border-zinc-500 border-t-zinc-100 motion-reduce:animate-none" aria-hidden="true" /><span className="sr-only">Loading profile photo</span></span> : currentPhoto?.state !== 'ready' ? <span className="text-zinc-400 text-xs text-center" aria-label={url ? 'Photo unavailable' : 'No profile photo'} aria-hidden="true">—</span> : null}
    {currentPhoto?.source && <img src={currentPhoto.source} alt="Member avatar" width={size} height={size} className="absolute inset-0 h-full w-full rounded-full object-cover" style={{ visibility: currentPhoto.state === 'ready' ? 'visible' : 'hidden' }} referrerPolicy="no-referrer" onLoad={async event => {
      const imageElement = event.currentTarget;
      try { await imageElement.decode(); } catch { if (generation.current === requestGeneration) setPhoto(previous => previous && { ...previous, source: undefined, state: 'error' }); return; }
      if (generation.current === requestGeneration && auth.currentUser === viewer) setPhoto(previous => previous && { ...previous, state: 'ready' });
    }} onError={() => { if (generation.current === requestGeneration) setPhoto(previous => previous && { ...previous, source: undefined, state: 'error' }); }} />}
  </span>;
}

export function ProfileHeader({ name, photoUrl, loading = false, preview = false, photoPreview }: { name: string; photoUrl?: string; loading?: boolean; preview?: boolean; photoPreview?: string }) {
  const Heading = preview ? 'h2' : 'h1';
  return <div className="flex items-center gap-4" data-profile-header>
    {photoPreview ? <img src={photoPreview} alt="New photo preview" width={96} height={96} className="w-24 h-24 shrink-0 rounded-full object-cover" /> : <ProfilePhoto url={photoUrl} loading={loading} />}
    <Heading className="text-3xl min-w-0 break-words">{name}</Heading>
  </div>;
}

export function ProfessionalView({ values, showPhoto = true }: { values: ProfessionalValues; showPhoto?: boolean }) {
  return <div className="space-y-3">{professionalFields.map(field => {
    const value = values[field];
    if (!value) return null;
    if (['avatarUrl', 'linkedin', 'github', 'portfolio'].includes(field)) {
      try { safeProfileUrl(value, field); } catch { return null; }
      if (field === 'avatarUrl') return showPhoto ? <ProfilePhoto key={field} url={value} /> : null;
      return <p key={field}><a className="underline" href={value} target="_blank" rel="noopener noreferrer">{fieldLabels[field]}</a></p>;
    }
    return <p className="whitespace-pre-wrap break-words" key={field}><strong>{fieldLabels[field]}: </strong>{value}</p>;
  })}</div>;
}

export function MemberDetails({ memberId, name }: { memberId: string; name?: string }) {
  const [details, setDetails] = useState<{ memberId: string; values: ProfessionalValues } | null>(null);
  useEffect(() => onSnapshot(doc(db, 'memberDetails', memberId), snapshot => setDetails({ memberId, values: snapshot.data() || {} }), () => setDetails({ memberId, values: {} })), [memberId]);
  const current = details?.memberId === memberId ? details : null;
  return <>{name !== undefined && <><ProfileHeader name={name} photoUrl={current?.values.avatarUrl} loading={!current} /><p>Community member</p></>}<ProfessionalView values={current?.values || {}} showPhoto={name === undefined} /></>;
}

export function ProfileEditor({ uid, name, onNameChange, save, onSaved }: { uid: string; name: string; onNameChange: (name: string) => void; save: (payload: object) => Promise<unknown>; onSaved: (message: string) => void }) {
  const editorOwner = useRef(uid);
  editorOwner.current = uid;
  const editorGeneration = useRef(0);
  useEffect(() => {
    editorGeneration.current += 1;
    return () => { editorGeneration.current += 1; };
  }, [uid]);
  const [details, setDetails] = useState<ProfileDetails>(emptyDetails);
  const [phones, setPhones] = useState<{ phone: PhoneDraft; whatsapp: PhoneDraft }>({ phone: hydratePhone(), whatsapp: hydratePhone() });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoError, setPhotoError] = useState('');
  useEffect(() => {
    if (!photoFile) { setPhotoPreview(''); return; }
    const objectUrl = URL.createObjectURL(photoFile); setPhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photoFile]);
  useEffect(() => {
    let current = true;
    setReady(false); setError(''); setPhotoFile(null); setRemovePhoto(false); setPhotoError('');
    getDoc(doc(db, 'profileDetails', uid)).then(snapshot => { if (current) { const loaded = snapshot.exists() ? profileEditorDetails(snapshot.data() as ProfileDetails) : emptyDetails(); setDetails(loaded); setPhones({ phone: hydratePhone(loaded.contacts.phone), whatsapp: hydratePhone(loaded.contacts.whatsapp) }); setReady(true); } }).catch(issue => { if (current) setError(issue.message); });
    return () => { current = false; };
  }, [uid]);
  const inputClass = controlClass;
  if (!ready) return error ? <p role="alert">{error}</p> : <p>Loading profile details…</p>;
  return <><form className="space-y-5" onSubmit={async event => {
    event.preventDefault();
    const submittedUid = uid;
    const submittedGeneration = editorGeneration.current;
    const isCurrentOwner = () => auth.currentUser?.uid === submittedUid && editorOwner.current === submittedUid && editorGeneration.current === submittedGeneration;
    if (!isCurrentOwner()) return;
    setBusy(true); setError('');
    try {
      const validated = validateProfileEdit({ name, ...details, contacts: { ...details.contacts, phone: phoneDraftValue(phones.phone), whatsapp: phoneDraftValue(details.whatsappUsesMobile ? phones.phone : phones.whatsapp) } });
      let photoUpload: { contentType: string; base64: string } | null | undefined;
      if (photoFile) {
        const encoded = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve((reader.result as string).split(',')[1]); reader.onerror = () => reject(new Error('Photo could not be read. Choose it again.')); reader.readAsDataURL(photoFile); });
        photoUpload = { contentType: photoFile.type, base64: encoded };
      } else if (removePhoto) photoUpload = null;
      if (!isCurrentOwner()) return;
      const result = await save({ name: validated.name, ...validated.details, ...(photoUpload !== undefined ? { photoUpload } : {}) }) as { details?: ProfileDetails };
      if (!isCurrentOwner()) return;
      const savedDetails = result?.details || validated.details; setDetails(savedDetails); setPhotoFile(null); setRemovePhoto(false); setPhotoError(''); onSaved('Profile saved.');
    }
    catch (issue) { if (isCurrentOwner()) setError((issue as Error).message); } finally { if (isCurrentOwner()) setBusy(false); }
  }}>
    <label className="block">Name<input className={inputClass} disabled={busy} value={name} onChange={event => onNameChange(event.target.value)} required maxLength={100} /></label>
    <div className="ui-heading-row"><p className="ui-privacy">Name visible to members · Optional fields private unless selected.</p><InfoHelp label="Profile visibility">Choose which professional details members can see. Save to apply your selections.</InfoHelp></div>
    <fieldset disabled={busy} className="space-y-4"><legend className="font-bold">Professional details</legend>{professionalFields.map(field => <div key={field}>
      {field === 'avatarUrl' ? <div className="space-y-2">
        <div className="ui-heading-row"><label htmlFor="profile-photo" className="block">Photo (optional)</label><InfoHelp label="Profile photo">Choose a still JPEG, PNG or WebP photo up to 2 MB. Your photo stays private unless you choose to show it to members. Save to apply a new photo or removal.</InfoHelp></div>
        <input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="photo-error" aria-invalid={!!photoError} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > maxPhotoUploadBytes) { setPhotoError('Choose a JPEG, PNG or WebP photo up to 2 MB.'); return; }
          setPhotoFile(file); setRemovePhoto(false); setPhotoError('');
        }} />
        {photoPreview ? <img src={photoPreview} alt="New photo preview" className="w-24 h-24 rounded-full object-cover" /> : !removePhoto && details.professional.avatarUrl ? <ProfilePhoto url={details.professional.avatarUrl} /> : null}
        {(photoFile || (!removePhoto && details.professional.avatarUrl)) && <button type="button" className="underline" onClick={() => { setPhotoFile(null); setRemovePhoto(true); setPhotoError(''); }}>Remove photo</button>}
        {removePhoto && <p>Photo will be removed when you save.</p>}
        <p id="photo-error" role={photoError ? 'alert' : undefined}>{photoError}</p>
      </div> : field === 'skills' ? <SkillsCombobox value={details.professional.skills || ''} onChange={value => setDetails(previous => ({ ...previous, professional: { ...previous.professional, skills: value } }))} disabled={busy} /> : <>
      <Field label={fieldLabels[field]} htmlFor={`professional-${field}`}><textarea id={`professional-${field}`} rows={field === 'bio' || field === 'work' ? 3 : 1} className={inputClass} value={details.professional[field] || ''} maxLength={field === 'bio' || field === 'work' ? 2000 : 500} onChange={event => setDetails(previous => ({ ...previous, professional: { ...previous.professional, [field]: event.target.value } }))} /></Field>
      </>}
      <label><input type="checkbox" checked={details.communityFields.includes(field)} onChange={event => setDetails(previous => ({ ...previous, communityFields: event.target.checked ? [...previous.communityFields, field] : previous.communityFields.filter(value => value !== field) }))} /> Show {fieldLabels[field]} to members</label>
    </div>)}</fieldset>
    <fieldset disabled={busy} className="space-y-4"><legend className="font-bold">Contact details and sharing</legend>
      <div className="ui-heading-row"><p className="ui-privacy">Private unless selected · One selection for ALL current and future approved connections.</p><InfoHelp label="Contact sharing"><p>Contacts stay private unless you select them for approved connections. Contact email is separate from your sign-in email.</p><p>Saved selection and value changes apply to every current and future approved connection. Pending requests and other members cannot see your contacts.</p><p>Unfriend or block revokes future contact access in both directions immediately. Previously saved copies cannot be recalled.</p></InfoHelp></div>
      {contactFields.map(field => <div key={field} className="space-y-2">
        {field === 'whatsapp' && <><label><input type="checkbox" checked={details.whatsappUsesMobile === true} onChange={event => { if (!event.target.checked) setPhones(previous => ({ ...previous, whatsapp: { ...previous.phone } })); setDetails(previous => ({ ...previous, whatsappUsesMobile: event.target.checked })); }} /> Use my mobile number for WhatsApp</label><p className="ui-privacy">Sharing WhatsApp also exposes its registered phone number.</p></>}
        {field === 'phone' || field === 'whatsapp' ? <PhoneInput label={fieldLabels[field]} draft={field === 'whatsapp' && details.whatsappUsesMobile ? phones.phone : phones[field]} disabled={field === 'whatsapp' && details.whatsappUsesMobile === true} inputClass={inputClass} help={field === 'phone' ? 'Optional. Choose a country code and enter your national number, or paste a full +international number. No country is selected by default. Clear the number to remove it. Shared calling codes reload without a country choice. Choose a country before editing their national number, or paste a full +international number.' : 'Optional. Choose Use my mobile number for WhatsApp only if your WhatsApp uses this mobile number. You can enter a different number instead.'} onChange={draft => setPhones(previous => ({ ...previous, [field]: draft }))} /> : <Field label={fieldLabels[field]} htmlFor={`contact-${field}`} help={field === 'telegram' ? 'Type or paste your @username or https://t.me/username. This does not verify ownership. Clear an old value to remove it.' : undefined}><input id={`contact-${field}`} className={inputClass} type={field === 'contactEmail' ? 'email' : 'text'} autoComplete={field === 'contactEmail' ? 'email' : 'off'} inputMode={field === 'contactEmail' ? 'email' : 'text'} value={details.contacts[field] || ''} maxLength={500} onChange={event => setDetails(previous => ({ ...previous, contacts: { ...previous.contacts, [field]: event.target.value } }))} /></Field>}
        
        {field === 'telegram' && <><TelegramPreview value={details.contacts.telegram || ''} /></>}
        <label><input type="checkbox" checked={details.connectionFields.includes(field)} onChange={event => setDetails(previous => ({ ...previous, connectionFields: event.target.checked ? [...previous.connectionFields, field] : previous.connectionFields.filter(value => value !== field) }))} /> Share {fieldLabels[field]} with all approved connections</label></div>)}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <Button type="submit" disabled={busy}>Save profile</Button>
  </form>
  <button type="button" className="underline" onClick={() => setPreview(value => !value)}>Preview community view</button>
  {preview && <section aria-label="Community preview" className="border border-zinc-600 rounded-lg p-4 space-y-3"><ProfileHeader preview name={name} photoUrl={!photoFile && !removePhoto && details.communityFields.includes('avatarUrl') ? details.professional.avatarUrl : undefined} photoPreview={details.communityFields.includes('avatarUrl') ? photoPreview : undefined} /><p>Preview of your current edits. Save to apply them.</p><ProfessionalView showPhoto={false} values={communityProjection({ ...details, professional: { ...details.professional, ...((photoFile || removePhoto) ? { avatarUrl: undefined } : {}) } })} /><p>Contacts are hidden.</p></section>}</>;
}

function TelegramPreview({ value }: { value: string }) {
  if (!value.trim()) return null;
  try {
    const username = normalizeTelegram(value);
    return <p>Telegram link preview: <a className="underline" href={`https://t.me/${username.slice(1)}`} target="_blank" rel="noopener noreferrer">{username}</a></p>;
  } catch { return <p>Correct this Telegram username or link, or clear it before saving.</p>; }
}
