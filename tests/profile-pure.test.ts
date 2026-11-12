import { test } from 'node:test';
import assert from 'node:assert/strict';
import { communityProjection, emptyDetails, validateProfileEdit } from '../shared/profile';

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
