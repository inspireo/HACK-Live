import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEventInvitation, shareEventInvitation } from '../src/utils/eventInvitation.ts';

const invitation = buildEventInvitation('event-123', 'Community Hack', 'Opening', 'https://hack.example')!;

test('deterministic public invitation has one canonical URL and no invented date', () => {
  assert.deepEqual(invitation, {
    title: 'Community Hack',
    text: 'Join me at Community Hack! Come collaborate with us on #HACK Live.',
    url: 'https://hack.example/session/event-123',
    fullText: 'Join me at Community Hack! Come collaborate with us on #HACK Live.\nhttps://hack.example/session/event-123',
  });
  assert.deepEqual(buildEventInvitation('event-123', 'Community Hack', 'Opening', 'https://hack.example'), invitation);
});

test('canonical destination discards search, fragments, credentials and encodes session ID', () => {
  const result = buildEventInvitation('event/?#', 'Workshop', 'Live', 'https://user:secret@hack.example/admin?recovery=private#token')!;
  assert.equal(result.url, 'https://hack.example/session/event%2F%3F%23');
  assert.doesNotMatch(result.fullText, /secret|recovery|private|token|admin/);
});

test('only known active stages are invitable; setup, closed and unknown are not promoted', () => {
  for (const stage of ['Draft', 'Closed', 'future-stage', '', undefined]) {
    assert.equal(buildEventInvitation('event', 'Workshop', stage, 'https://hack.example'), null);
  }
  for (const stage of ['Opening', 'ResourcesOnly', 'Challenge Drafting', 'Published Challenges', 'Live', 'Presentations']) {
    assert.ok(buildEventInvitation('event', 'Workshop', stage, 'https://hack.example'));
  }
});

test('title is normalized; unsafe or missing titles fall back to a safe name', () => {
  assert.equal(buildEventInvitation('event', ' Community\n Hack ', 'Live', 'https://hack.example')!.title, 'Community Hack');
  for (const title of [undefined, {}, '', '<b>Event</b>', 'admin@example.com', 'Visit https://private.example', 'www.private.example', 'a'.repeat(161)]) {
    assert.equal(buildEventInvitation('event', title, 'Live', 'https://hack.example')!.title, '#HACK Live workshop');
  }
});

test('session private fields are never accepted as public details', () => {
  const session = { title: 'Public Event', status: 'Live', ownerEmail: 'owner@private.example', adminEmails: ['admin@private.example'], code: 'SECRET', passcode: 'RECOVERY', createdAt: '2026-11-12', venue: 'Private room' };
  const result = buildEventInvitation('event', session.title, session.status, 'https://hack.example')!;
  assert.doesNotMatch(JSON.stringify(result), /private|SECRET|RECOVERY|2026|room/);
});

test('native share is invoked immediately with title/text/url and no duplicate URL', async () => {
  let called = false;
  const pendingShare = shareEventInvitation(invitation, {
    share: async payload => {
      called = true;
      assert.deepEqual(payload, { title: invitation.title, text: invitation.text, url: invitation.url });
      assert.ok(!payload.text!.includes(invitation.url));
    },
    copy: async () => assert.fail('native success must not copy'),
  });
  assert.ok(called, 'share must run before any await to retain user activation');
  assert.equal(await pendingShare, 'shared');
});

test('unsupported sharing and native failures copy the full invitation', async () => {
  for (const share of [undefined, async () => { throw new Error('Denied'); }]) {
    let copiedText = '';
    assert.equal(await shareEventInvitation(invitation, { share, copy: async text => { copiedText = text; } }), 'copied');
    assert.equal(copiedText, invitation.fullText);
    assert.equal(copiedText.split(invitation.url).length - 1, 1);
  }
});

test('user cancellation is quiet and does not copy', async () => {
  assert.equal(await shareEventInvitation(invitation, {
    share: async () => { throw { name: 'AbortError' }; },
    copy: async () => assert.fail('cancellation must not copy'),
  }), 'cancelled');
});

test('clipboard absence and failure offer manual copy without rejecting', async () => {
  assert.equal(await shareEventInvitation(invitation, {}), 'manual');
  assert.equal(await shareEventInvitation(invitation, {
    share: async () => { throw new Error('Share denied'); },
    copy: async () => { throw new Error('Clipboard denied'); },
  }), 'manual');
});
