export const professionalFields = ['avatarUrl', 'bio', 'title', 'company', 'work', 'skills', 'linkedin', 'github', 'portfolio'] as const;
export const contactFields = ['contactEmail', 'phone', 'telegram', 'whatsapp', 'signal'] as const;
export type ProfessionalField = typeof professionalFields[number];
export type ContactField = typeof contactFields[number];
export type ProfessionalValues = Partial<Record<ProfessionalField, string>>;
export type ProfileDetails = {
  professional: ProfessionalValues;
  communityFields: ProfessionalField[];
  contacts: Partial<Record<ContactField, string>>;
  connectionFields: ContactField[];
};
export const fieldLabels: Record<ProfessionalField | ContactField, string> = {
  avatarUrl: 'Photo URL', bio: 'Bio', title: 'Professional title or role', company: 'Company or organization', work: 'Work information', skills: 'Skills', linkedin: 'LinkedIn', github: 'GitHub', portfolio: 'Portfolio',
  contactEmail: 'Contact email', phone: 'Phone', telegram: 'Telegram handle', whatsapp: 'WhatsApp', signal: 'Signal handle',
};
export const emptyDetails = (): ProfileDetails => ({ professional: {}, communityFields: [], contacts: {}, connectionFields: [] });
const recordValue = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function requireKeys(value: unknown, allowed: readonly string[]): asserts value is Record<string, unknown> {
  if (!recordValue(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unexpected profile fields.');
}
export function safeProfileUrl(value: string, field: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname.includes('.') || parsed.hostname === 'localhost') throw new Error('Use a public HTTPS URL without credentials.');
  if (field === 'linkedin' && !['linkedin.com', 'www.linkedin.com'].includes(parsed.hostname)) throw new Error('Use a linkedin.com URL.');
  if (field === 'github' && !['github.com', 'www.github.com'].includes(parsed.hostname)) throw new Error('Use a github.com URL.');
  return parsed.href;
}
export function validateProfileEdit(payload: unknown): { name: string; details: ProfileDetails } {
  requireKeys(payload, ['name', 'professional', 'communityFields', 'contacts', 'connectionFields']);
  if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.trim().length > 100) throw new Error('Name must contain 1–100 characters.');
  requireKeys(payload.professional, professionalFields);
  requireKeys(payload.contacts, contactFields);
  const details = emptyDetails();
  for (const [group, allowed] of [['professional', professionalFields], ['contacts', contactFields]] as const) {
    for (const field of allowed) {
      const rawValue = payload[group][field];
      if (rawValue === undefined) continue;
      if (typeof rawValue !== 'string' || rawValue.length > (field === 'bio' || field === 'work' ? 2000 : 500) || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(rawValue)) throw new Error(`Invalid ${fieldLabels[field]}.`);
      let value = rawValue.trim();
      if (!value) continue;
      if (['avatarUrl', 'linkedin', 'github', 'portfolio'].includes(field)) value = safeProfileUrl(value, field);
      if (field === 'contactEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Invalid contact email.');
      (details[group] as Record<string, string>)[field] = value;
    }
  }
  for (const [selection, allowed] of [['communityFields', professionalFields], ['connectionFields', contactFields]] as const) {
    const values = payload[selection];
    if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) || new Set(values).size !== values.length) throw new Error('Invalid sharing selection.');
    (details[selection] as string[]) = [...values];
  }
  return { name: payload.name.trim(), details };
}
export function communityProjection(details: ProfileDetails): ProfessionalValues {
  return Object.fromEntries(professionalFields.filter(field => details.communityFields.includes(field) && details.professional[field]).map(field => [field, details.professional[field]]));
}
