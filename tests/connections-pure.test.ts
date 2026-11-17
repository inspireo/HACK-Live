import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactHref, selectedContacts, selectedContactFields, contactProjection, nextConnectionState, type ConnectionView } from '../shared/connections';
import { syntheticContactMigrationTarget } from '../server/retired-contacts';
import { emptyDetails } from '../shared/profile';
import { pairKey, blockKey } from '../server/connections';

test('pair identity is order-independent and unambiguous; block digests omit identity', () => {
  assert.equal(pairKey('first', 'second'), pairKey('second', 'first'));
  assert.notEqual(pairKey('ab', 'c'), pairKey('a', 'bc'));
  assert.notEqual(pairKey('a~b', 'c'), pairKey('a', 'b~c'));
  assert.match(blockKey('member'), /^[a-f0-9]{64}$/);
});
test('contact projection contains only populated globally selected allowlisted fields', () => {
  const details = emptyDetails();
  details.contacts = { phone: '555', contactEmail: 'private@example.test', signal: 'retired' } as never;
  details.connectionFields = ['phone', 'signal'] as never;
  assert.deepEqual(contactProjection(details), { phone: '555' });
  details.connectionFields = [];
  assert.deepEqual(contactProjection(details), {});
});
test('state machine requires recipient consent and never autoaccepts opposite requests', () => {
  const pending: ConnectionView = { pairId: 'pair', peerUid: 'recipient', requester: 'sender', generation: 'first', state: 'pending', unread: false };
  assert.equal(nextConnectionState('request', 'recipient', pending), 'pending');
  assert.throws(() => nextConnectionState('accept', 'sender', pending));
  assert.throws(() => nextConnectionState('decline', 'sender', pending));
  assert.throws(() => nextConnectionState('cancel', 'recipient', pending));
  assert.equal(nextConnectionState('accept', 'recipient', pending), 'accepted');
  assert.equal(nextConnectionState('cancel', 'sender', pending), 'cancelled');
  for (const state of ['cancelled', 'declined', 'removed', 'blocked'] as const) assert.throws(() => nextConnectionState('accept', 'recipient', { ...pending, state }));
  assert.equal(nextConnectionState('unfriend', 'recipient', { ...pending, state: 'accepted' }), 'removed');
  assert.equal(nextConnectionState('block', 'sender', pending), 'blocked');
});

test('retired and unknown keys never enter projections or labels; linked mode preserves independent global consent', () => {
  const details = { ...emptyDetails(), contacts: { phone: '+6581234567', whatsapp: '+447700900123', signal: 'retired', unexpected: 'private' }, connectionFields: ['whatsapp', 'signal', 'unexpected'], whatsappUsesMobile: true };
  assert.deepEqual(contactProjection(details as never), { whatsapp: '+6581234567' });
  assert.deepEqual(contactProjection({ ...details, connectionFields: ['phone'] } as never), { phone: '+6581234567' });
  assert.deepEqual(contactProjection({ ...details, connectionFields: [] } as never), {});
  assert.deepEqual(contactProjection({ ...details, whatsappUsesMobile: undefined } as never), { whatsapp: '+447700900123' });
  assert.deepEqual(selectedContacts({ signal: 'secret', unexpected: 'secret', phone: 'legacy-local', telegram: {} }), { phone: 'legacy-local' });
  assert.deepEqual(selectedContactFields(['signal', 'phone', 'unknown', 'phone']), ['phone']);
  assert.deepEqual(selectedContactFields({ phone: true }), []);
});
test('contact actions construct only recognized safe routes and leave invalid legacy values as text', () => {
  assert.equal(contactHref('phone', '+65 (8123) 4567'), 'tel:+6581234567');
  assert.equal(contactHref('whatsapp', '+44 7700 900123'), 'https://wa.me/447700900123');
  for (const value of ['abcd', '@abcd', 't.me/abcd', 'https://t.me/abcd']) assert.equal(contactHref('telegram', value), 'https://t.me/abcd');
  assert.equal(contactHref('contactEmail', 'member+tag@example.test'), 'mailto:member%2Btag@example.test');
  for (const field of ['phone', 'whatsapp'] as const) for (const value of ['555-0101', 'javascript:alert(1)', '+65/81234567', '+6581234567?text=secret', '+6581234567\n']) assert.equal(contactHref(field, value), undefined);
  for (const value of ['https://t.me.evil.test/abcd', 'https://evil.test/abcd', 'https://u:p@t.me/abcd', 'https://t.me/abcd?start=secret', 'https://t.me/abcd#secret', 't.me/%61bcd', 't.me/abcd/extra', 'javascript:alert(1)', '@bad-name', 't.me/joinchat']) assert.equal(contactHref('telegram', value), undefined);
  for (const value of ['member@example.test?bcc=other@test.test', 'member%0d%0a@example.test', 'member@example.test#fragment', 'member@example.test\r\nBcc:other@test.test', 'member..name@example.test', '.member@example.test', 'member@-example.test']) assert.equal(contactHref('contactEmail', value), undefined);
});

test('retired-contact migration refuses production, remote hosts and named databases', () => {
  assert.deepEqual(syntheticContactMigrationTarget({ GCLOUD_PROJECT: 'demo-hack-live', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }), { projectId: 'demo-hack-live', databaseId: '(default)' });
  for (const environment of [{}, { GCLOUD_PROJECT: 'production', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }, { GCLOUD_PROJECT: 'demo-hack-live', FIRESTORE_EMULATOR_HOST: 'remote.example:8080' }, { GCLOUD_PROJECT: 'demo-hack-live', FIRESTORE_EMULATOR_HOST: 'localhost:8080', FIRESTORE_DATABASE_ID: 'live' }]) assert.throws(() => syntheticContactMigrationTarget(environment), /local default-database/);
});
