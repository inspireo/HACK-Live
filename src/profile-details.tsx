import React, { useEffect, useRef, useState } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { profileEditorDetails, normalizeTelegram, communityProjection, contactFields, emptyDetails, fieldLabels, professionalFields, isManagedPhotoUrl, maxPhotoUploadBytes, safeProfileUrl, validateProfileEdit, type ProfessionalValues, type ProfileDetails } from '../shared/profile';
import { PhoneInput } from './phone-input';
import { hydratePhone, phoneDraftValue, type PhoneDraft } from '../shared/phone-draft';
import { SkillsCombobox } from './skills-combobox';

export function ProfilePhoto({ url }: { url: string }) {
  const [resolved, setResolved] = useState<{ url: string; blob: string } | null>(null);
  useEffect(() => {
    if (!isManagedPhotoUrl(url)) return;
    const controller = new AbortController();
    let current = true;
    let objectUrl: string | undefined;
    setResolved(null);
    (async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token || !current) return;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) return;
      const blob = await response.blob();
      if (!current) return;
      objectUrl = URL.createObjectURL(blob);
      setResolved({ url, blob: objectUrl });
    })().catch(() => {});
    return () => { current = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);
  let source: string | undefined;
  if (isManagedPhotoUrl(url)) source = resolved?.url === url ? resolved.blob : undefined;
  else { try { source = safeProfileUrl(url, 'avatarUrl'); } catch {} }
  return source ? <img src={source} alt="Member avatar" className="w-24 h-24 rounded-full object-cover" referrerPolicy="no-referrer" loading="lazy" /> : null;
}

export function ProfessionalView({ values }: { values: ProfessionalValues }) {
  return <div className="space-y-3">{professionalFields.map(field => {
    const value = values[field];
    if (!value) return null;
    if (['avatarUrl', 'linkedin', 'github', 'portfolio'].includes(field)) {
      try { safeProfileUrl(value, field); } catch { return null; }
      if (field === 'avatarUrl') return <ProfilePhoto key={field} url={value} />;
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
  const inputClass = 'block w-full p-3 bg-zinc-900 border border-zinc-600 rounded-lg';
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
    <p>Your name is visible to members. Every optional field starts private. Choose which professional details members can see.</p>
    <fieldset disabled={busy} className="space-y-4"><legend className="font-bold">Professional details</legend>{professionalFields.map(field => <div key={field}>
      {field === 'avatarUrl' ? <div className="space-y-2">
        <label htmlFor="profile-photo" className="block">Photo (optional)</label>
        <p id="photo-help" className="text-sm">Choose a still JPEG, PNG or WebP photo up to 2 MB. Your photo stays private unless you choose to show it to members. Save to apply a new photo or removal.</p>
        <input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="photo-help photo-error" aria-invalid={!!photoError} onChange={event => {
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
      <label className="block" htmlFor={`professional-${field}`}>{fieldLabels[field]}</label><textarea id={`professional-${field}`} rows={field === 'bio' || field === 'work' ? 3 : 1} className={inputClass} value={details.professional[field] || ''} maxLength={field === 'bio' || field === 'work' ? 2000 : 500} onChange={event => setDetails(previous => ({ ...previous, professional: { ...previous.professional, [field]: event.target.value } }))} />
      </>}
      <label><input type="checkbox" checked={details.communityFields.includes(field)} onChange={event => setDetails(previous => ({ ...previous, communityFields: event.target.checked ? [...previous.communityFields, field] : previous.communityFields.filter(value => value !== field) }))} /> Show {fieldLabels[field]} to members</label>
    </div>)}</fieldset>
    <fieldset disabled={busy} className="space-y-4"><legend className="font-bold">Private contact details</legend>
      <p>All contacts are visible only to you in this release. Contact email is separate from your sign-in email.</p>
      <p>Choose one global selection for all future accepted connections. Sharing activates after the next connection release; these selections share nothing today.</p>
      {contactFields.map(field => <div key={field} className="space-y-2">
        {field === 'whatsapp' && <><label><input type="checkbox" checked={details.whatsappUsesMobile === true} onChange={event => { if (!event.target.checked) setPhones(previous => ({ ...previous, whatsapp: { ...previous.phone } })); setDetails(previous => ({ ...previous, whatsappUsesMobile: event.target.checked })); }} /> Use my mobile number for WhatsApp</label><p id="whatsapp-help">Optional. Choose this only if your WhatsApp uses this mobile number. You can enter a different number instead. Sharing WhatsApp also exposes its registered phone number.</p></>}
        {field === 'phone' || field === 'whatsapp' ? <PhoneInput label={fieldLabels[field]} draft={field === 'whatsapp' && details.whatsappUsesMobile ? phones.phone : phones[field]} disabled={field === 'whatsapp' && details.whatsappUsesMobile === true} inputClass={inputClass} helpId={field === 'phone' ? 'mobile-help' : 'whatsapp-help'} onChange={draft => setPhones(previous => ({ ...previous, [field]: draft }))} /> : <label className="block">{fieldLabels[field]}<input className={inputClass} type={field === 'contactEmail' ? 'email' : 'text'} autoComplete={field === 'contactEmail' ? 'email' : 'off'} inputMode={field === 'contactEmail' ? 'email' : 'text'} aria-describedby={field === 'telegram' ? 'telegram-help' : undefined} value={details.contacts[field] || ''} maxLength={500} onChange={event => setDetails(previous => ({ ...previous, contacts: { ...previous.contacts, [field]: event.target.value } }))} /></label>}
        {field === 'phone' && <p id="mobile-help">Optional. Choose a country code and enter your national number, or paste a full +international number. No country is selected by default. Clear the number to remove it. Shared calling codes reload without a country choice. Choose a country before editing their national number, or paste a full +international number.</p>}
        {field === 'telegram' && <><p id="telegram-help">Type or paste your @username or https://t.me/username. This does not verify ownership. Clear an old value to remove it.</p><TelegramPreview value={details.contacts.telegram || ''} /></>}
        <label><input type="checkbox" checked={details.connectionFields.includes(field)} onChange={event => setDetails(previous => ({ ...previous, connectionFields: event.target.checked ? [...previous.connectionFields, field] : previous.connectionFields.filter(value => value !== field) }))} /> Share {fieldLabels[field]} with all future accepted connections</label></div>)}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <button disabled={busy} className="p-3 bg-emerald-700 rounded-lg disabled:opacity-50">Save profile</button>
  </form>
  <button type="button" className="underline" onClick={() => setPreview(value => !value)}>Preview community view</button>
  {preview && <section aria-label="Community preview" className="border border-zinc-600 rounded-lg p-4 space-y-3"><h2 className="text-xl">{name}</h2><p>Preview of your current edits. Save to apply them.</p><ProfessionalView values={communityProjection({ ...details, professional: { ...details.professional, ...((photoFile || removePhoto) ? { avatarUrl: undefined } : {}) } })} />{photoPreview && details.communityFields.includes('avatarUrl') && <img src={photoPreview} alt="New photo preview" className="w-24 h-24 rounded-full object-cover" />}<p>Contacts are hidden.</p></section>}</>;
}

function TelegramPreview({ value }: { value: string }) {
  if (!value.trim()) return null;
  try {
    const username = normalizeTelegram(value);
    return <p>Telegram link preview: <a className="underline" href={`https://t.me/${username.slice(1)}`} target="_blank" rel="noopener noreferrer">{username}</a></p>;
  } catch { return <p>Correct this Telegram username or link, or clear it before saving.</p>; }
}
