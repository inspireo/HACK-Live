export const professionalFields = ['avatarUrl', 'bio', 'title', 'company', 'work', 'skills', 'linkedin', 'github', 'portfolio'] as const;
export const contactFields = ['contactEmail', 'phone', 'telegram', 'whatsapp'] as const;
export type ProfessionalField = typeof professionalFields[number];
export type ContactField = typeof contactFields[number];
export type ProfessionalValues = Partial<Record<ProfessionalField, string>>;
export type ProfileDetails = {
  professional: ProfessionalValues;
  communityFields: ProfessionalField[];
  contacts: Partial<Record<ContactField, string>>;
  connectionFields: ContactField[];
  whatsappUsesMobile?: boolean;
};
export const fieldLabels: Record<ProfessionalField | ContactField, string> = {
  avatarUrl: 'Photo', bio: 'Bio', title: 'Professional title or role', company: 'Company or organization', work: 'Work information', skills: 'Skills', linkedin: 'LinkedIn', github: 'GitHub', portfolio: 'Portfolio',
  contactEmail: 'Contact email', phone: 'Mobile number', telegram: 'Telegram username or link', whatsapp: 'WhatsApp number',
};
export const emptyDetails = (): ProfileDetails => ({ professional: {}, communityFields: [], contacts: {}, connectionFields: [], whatsappUsesMobile: false });
const recordValue = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function requireKeys(value: unknown, allowed: readonly string[]): asserts value is Record<string, unknown> {
  if (!recordValue(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unexpected profile fields.');
}
export function safeProfileUrl(value: string, field: string): string {
  if (field === 'avatarUrl' && isManagedPhotoUrl(value)) return value;
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname.includes('.') || parsed.hostname === 'localhost') throw new Error('Use a public HTTPS URL without credentials.');
  if (field === 'linkedin' && !['linkedin.com', 'www.linkedin.com'].includes(parsed.hostname)) throw new Error('Use a linkedin.com URL.');
  if (field === 'github' && !['github.com', 'www.github.com'].includes(parsed.hostname)) throw new Error('Use a github.com URL.');
  return parsed.href;
}
export function validateProfileEdit(payload: unknown): { name: string; details: ProfileDetails } {
  requireKeys(payload, ['name', 'professional', 'communityFields', 'contacts', 'connectionFields', 'whatsappUsesMobile', 'photoUpload']);
  if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.trim().length > 100) throw new Error('Name must contain 1–100 characters.');
  requireKeys(payload.professional, professionalFields);
  // Retired Signal is accepted only for old clients; never copied or validated.
  requireKeys(payload.contacts, [...contactFields, 'signal']);
  if (payload.whatsappUsesMobile !== undefined && typeof payload.whatsappUsesMobile !== 'boolean') throw new Error('Invalid WhatsApp mobile selection.');
  const details = emptyDetails();
  for (const [group, allowed] of [['professional', professionalFields], ['contacts', contactFields]] as const) {
    for (const field of allowed) {
      const rawValue = group === 'contacts' && field === 'whatsapp' && payload.whatsappUsesMobile === true ? payload.contacts.phone : payload[group][field];
      if (rawValue === undefined) continue;
      if (typeof rawValue !== 'string' || rawValue.length > (field === 'bio' || field === 'work' ? 2000 : 500) || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(rawValue)) throw new Error(`Invalid ${fieldLabels[field]}.`);
      let value = rawValue.trim();
      if (!value) continue;
      if (field === 'phone' || field === 'whatsapp') value = normalizeContactPhone(value);
      if (field === 'telegram') value = normalizeTelegram(value);
      if (field === 'skills') value = normalizeSkills(value).join(', ');
      if (['avatarUrl', 'linkedin', 'github', 'portfolio'].includes(field)) value = safeProfileUrl(value, field);
      if (field === 'contactEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Invalid contact email.');
      (details[group] as Record<string, string>)[field] = value;
    }
  }
  for (const [selection, allowed] of [['communityFields', professionalFields], ['connectionFields', contactFields]] as const) {
    const originalValues = payload[selection];
    const values = selection === 'connectionFields' && Array.isArray(originalValues) ? originalValues.filter(value => value !== 'signal') : originalValues;
    if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) || new Set(values).size !== values.length) throw new Error('Invalid sharing selection.');
    (details[selection] as string[]) = [...values];
  }
  details.whatsappUsesMobile = payload.whatsappUsesMobile === true;
  if (details.whatsappUsesMobile && !details.contacts.phone) throw new Error('Add your mobile number with country code, or uncheck Use my mobile number for WhatsApp.');
  return { name: payload.name.trim(), details };
}
export function communityProjection(details: ProfileDetails): ProfessionalValues {
  return Object.fromEntries(professionalFields.filter(field => details.communityFields.includes(field) && details.professional[field]).map(field => [field, details.professional[field]]));
}

// The string representation preserves existing projections and consumers.
export const skillSuggestions = ['Accessibility', 'AI', 'Data analysis', 'Design thinking', 'Facilitation', 'JavaScript', 'Product management', 'Python', 'React', 'Research', 'TypeScript', 'UX design'];
export function normalizeSkills(value: string): string[] {
  if (value.length > 500) throw new Error('Skills must contain at most 500 characters.');
  const selected: string[] = [];
  for (const rawTerm of value.split(/[,\n]/)) {
    const term = rawTerm.trim().replace(/\s+/g, ' ');
    if (!term) continue;
    if (term.length > 60 || /[\u0000-\u001f\u007f]/.test(term)) throw new Error('Each skill must contain at most 60 characters.');
    if (!selected.some(existing => existing.toLowerCase() === term.toLowerCase())) selected.push(term);
  }
  if (selected.length > 20 || selected.join(', ').length > 500) throw new Error('Choose up to 20 skills and 500 characters in total.');
  return selected;
}
export function isManagedPhotoUrl(value: string): boolean {
  return /^\/api\/identity\/photo\/[A-Za-z0-9_-]{1,128}\/[a-f0-9-]{36}$/.test(value);
}
export const maxPhotoUploadBytes = 2 * 1024 * 1024;
export const maxStoredPhotoBytes = 256 * 1024;
export type PhotoUpload = { contentType: string; base64: string };

export type ProfileEdit = ProfileDetails & { name: string; photoUpload?: PhotoUpload | null };
export type ProfileSaveResult = { saved: true; details: ProfileDetails };

// These values are self-reported contact routes, never ownership verification.
export function normalizeContactPhone(value: string): string {
  const compact = value.trim().replace(/[ ()-]/g, '');
  if (!/^\+[1-9]\d{6,14}$/.test(compact)) throw new Error('Use an international number with + and country code, for example +65 8123 4567, or clear the field.');
  return compact;
}
export function normalizeTelegram(value: string): string {
  let username = value.trim();
  if (/^(?:https:\/\/)?t\.me\//i.test(username)) {
    const route = /^(?:https:\/\/)?t\.me\/([a-zA-Z0-9_]{1,32})\/?$/i.exec(username);
    if (!route) throw new Error('Use your Telegram @username or https://t.me/username, or clear the field.');
    username = route[1];
  }
  username = username.replace(/^@/, '');
  if (!/^[a-zA-Z0-9_]{1,32}$/.test(username) || ['joinchat', 'share', 'login', 'proxy', 'socks', 'iv', 'addstickers'].includes(username.toLowerCase())) throw new Error('Use your Telegram @username or https://t.me/username, or clear the field.');
  return `@${username}`;
}

// Keep malformed legacy values editable so their owner can correct or clear them.
export function profileEditorDetails(saved: ProfileDetails): ProfileDetails {
  return { ...saved, contacts: Object.fromEntries(contactFields.filter(field => typeof saved.contacts?.[field] === 'string').map(field => [field, saved.contacts[field]])), connectionFields: contactFields.filter(field => saved.connectionFields?.includes(field)), whatsappUsesMobile: saved.whatsappUsesMobile === true };
}
