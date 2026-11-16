import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactFields, profileEditorDetails, normalizeTelegram, communityProjection, emptyDetails, normalizeSkills, validateProfileEdit } from '../shared/profile';
import { normalizePhotoUpload } from '../server/profile-photo';
import { photoFixture } from './photo-fixture';
import sharp from 'sharp';

test('default privacy, explicit professional consent and revocation exclude contacts', () => {
  const details = emptyDetails();
  details.professional = { bio: 'Private bio', title: 'Engineer', skills: 'TypeScript' };
  details.contacts = { contactEmail: 'separate@example.test', phone: '+65 1234 5678' };
  details.connectionFields = ['phone'];
  assert.deepEqual(communityProjection(details), {});
  details.communityFields = ['title', 'skills'];
  assert.deepEqual(communityProjection(details), { title: 'Engineer', skills: 'TypeScript' });
  details.communityFields = [];
  assert.deepEqual(communityProjection(details), {});
});

test('skills normalize whitespace, case-insensitive duplicates and enforce count, term and total bounds', () => {
  assert.deepEqual(normalizeSkills(' TypeScript, typescript,  Team   facilitation \nReact, , REACT '), ['TypeScript', 'Team facilitation', 'React']);
  const saved = validateProfileEdit({ name: 'Member', ...emptyDetails(), professional: { skills: ' TypeScript, typescript, React ' } });
  assert.equal(saved.details.professional.skills, 'TypeScript, React');
  for (const skills of ['x'.repeat(61), 'x'.repeat(501), Array.from({ length: 21 }, (_, position) => `skill ${position}`).join(','), 'bad\u0000skill']) assert.throws(() => normalizeSkills(skills));
});

test('real image decoder verifies raster type/content/pixels, normalizes orientation and strips metadata', async () => {
  const fixture = await photoFixture();
  const upload = { contentType: fixture.mimeType, base64: fixture.buffer.toString('base64') };
  const normalized = await normalizePhotoUpload(upload);
  const metadata = await sharp(normalized).metadata();
  assert.equal(metadata.format, 'webp');
  assert.ok(normalized!.length <= 256 * 1024);
  assert.ok(await normalizePhotoUpload({ contentType: 'image/webp', base64: normalized!.toString('base64') }));
  const animated = await sharp(Buffer.concat([Buffer.alloc(12, 0), Buffer.alloc(12, 255)]), { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2);
  await assert.rejects(normalizePhotoUpload({ contentType: 'image/webp', base64: animated.toString('base64') }));
  const oriented = await sharp(fixture.buffer).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const rotated = await normalizePhotoUpload({ contentType: 'image/jpeg', base64: oriented.toString('base64') });
  const rotatedMetadata = await sharp(rotated).metadata();
  assert.equal(rotatedMetadata.width, 100); assert.equal(rotatedMetadata.height, 80);
  assert.equal(rotatedMetadata.exif, undefined); assert.equal(rotatedMetadata.orientation, undefined);
  const tooManyPixels = await sharp({ create: { width: 4100, height: 4100, channels: 3, background: '#337766' } }).png().toBuffer();
  for (const invalid of [
    { ...upload, contentType: 'image/jpeg' }, { ...upload, base64: 'garbage' },
    { ...upload, extra: 'unexpected' }, { ...upload, base64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64') },
    { ...upload, base64: tooManyPixels.toString('base64') },
    { ...upload, base64: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') },
    { ...upload, base64: fixture.buffer.subarray(0, 40).toString('base64') },
  ]) await assert.rejects(normalizePhotoUpload(invalid));
  assert.equal(await normalizePhotoUpload(null), undefined);
});

test('strict edit schema excludes authority, lifecycle, arbitrary contacts and per-connection overrides', () => {
  const payload = { name: ' Existing name ', ...emptyDetails() };
  assert.equal(validateProfileEdit(payload).name, 'Existing name');
  for (const extra of [{ uid: 'victim' }, { role: 'admin' }, { state: 'deleted' }, { attendance: true }, { perConnection: { victim: ['phone'] } }, { password: 'credential' }]) assert.throws(() => validateProfileEdit({ ...payload, ...extra }));
  assert.throws(() => validateProfileEdit({ ...payload, professional: { role: 'admin' } }));
  assert.throws(() => validateProfileEdit({ ...payload, contacts: { loginEmail: 'login@example.test' } }));
  for (const communityFields of [['phone'], ['title', 'title'], 'title', ['__proto__']]) assert.throws(() => validateProfileEdit({ ...payload, communityFields }));
  for (const connectionFields of [['bio'], ['phone', 'phone'], { person: ['phone'] }]) assert.throws(() => validateProfileEdit({ ...payload, connectionFields }));
});

test('URLs, contact email and limits reject dangerous or malformed input', () => {
  const payload = { name: 'Member', ...emptyDetails() };
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,x', 'http://example.test/image', 'https://user:password@example.test', 'not a URL']) {
    for (const field of ['avatarUrl', 'linkedin', 'github', 'portfolio']) assert.throws(() => validateProfileEdit({ ...payload, professional: { [field]: value } }));
  }
  assert.throws(() => validateProfileEdit({ ...payload, professional: { linkedin: 'https://linkedin.com.evil.test/member' } }));
  assert.throws(() => validateProfileEdit({ ...payload, professional: { github: 'https://example.test/github' } }));
  assert.throws(() => validateProfileEdit({ ...payload, professional: { bio: 'x'.repeat(2001) } }));
  assert.throws(() => validateProfileEdit({ ...payload, contacts: { contactEmail: 'bad-email' } }));
  assert.throws(() => validateProfileEdit({ ...payload, contacts: { phone: 'abc\u0000def' } }));
  const saved = validateProfileEdit({ ...payload, professional: { linkedin: 'https://www.linkedin.com/in/synthetic', github: 'https://github.com/synthetic', portfolio: ' https://example.test ', bio: ' <script>text</script> ' }, contacts: { contactEmail: 'contact@example.test', signal: '' }, connectionFields: ['contactEmail'] });
  assert.equal(saved.details.professional.portfolio, 'https://example.test/');
  assert.equal(saved.details.professional.bio, '<script>text</script>');
  assert.deepEqual(saved.details.contacts, { contactEmail: 'contact@example.test' });
});

test('contact canonicalization retires Signal, defaults private and persists explicit WhatsApp choice', () => {
  const payload = { name: 'Member', ...emptyDetails(), contacts: { phone: '+65 (8123) 4567', whatsapp: '+44 7700 900123', signal: { obsolete: true } }, connectionFields: ['signal', 'whatsapp'] };
  const separate = validateProfileEdit(payload).details;
  assert.deepEqual(separate.contacts, { phone: '+6581234567', whatsapp: '+447700900123' });
  assert.deepEqual(separate.connectionFields, ['whatsapp']);
  assert.equal(separate.whatsappUsesMobile, false);
  const linked = validateProfileEdit({ ...payload, whatsappUsesMobile: true }).details;
  assert.equal(linked.contacts.whatsapp, linked.contacts.phone);
  assert.deepEqual(linked.connectionFields, ['whatsapp']);
  assert.equal(validateProfileEdit({ ...payload, whatsappUsesMobile: true, contacts: { phone: '+1 202 555 0199', whatsapp: 'stale' } }).details.contacts.whatsapp, '+12025550199');
  assert.throws(() => validateProfileEdit({ ...payload, whatsappUsesMobile: true, contacts: {} }), /uncheck/);
  for (const phone of ['81234567', '006581234567', '+01234', '+65bad1234567']) assert.throws(() => validateProfileEdit({ ...payload, contacts: { phone } }), /country code/);
  assert.throws(() => validateProfileEdit({ ...payload, whatsappUsesMobile: 'true' }));
  assert.equal(contactFields.includes('signal' as never), false);
  assert.deepEqual(emptyDetails().connectionFields, []);
});

test('Telegram accepts friendly usernames and exact profile links including short collectible names', () => {
  for (const value of ['Member_name', '@Member_name', 'https://t.me/Member_name', 't.me/Member_name/']) assert.equal(normalizeTelegram(value), '@Member_name');
  assert.equal(normalizeTelegram('@abcd'), '@abcd');
  for (const value of ['https://evil.test/member', 'https://t.me.evil.test/member', 'https://user@t.me/member', 'https://t.me/member?start=token', 'https://t.me/member#x', 'https://t.me/old/../member', 'https://t.me/+invite', 'https://t.me/member/42', '@bad-name', 'https://t.me/%61bcd', 'https://t.me:443/abcd']) assert.throws(() => normalizeTelegram(value));
  const old = profileEditorDetails({ ...emptyDetails(), contacts: { telegram: 'bad-old-value', signal: 'retired' } as never, connectionFields: ['signal'] as never });
  assert.equal(old.contacts.telegram, 'bad-old-value');
  assert.deepEqual(old.connectionFields, []);
  assert.throws(() => validateProfileEdit({ name: 'Member', ...old }), /clear the field/);
  assert.deepEqual(validateProfileEdit({ name: 'Member', ...old, contacts: { telegram: '' } }).details.contacts, {});
});
