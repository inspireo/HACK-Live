import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEventInvitation, shareEventInvitation, type PublicEvent } from '../src/utils/eventInvitation.ts';
const token = 'a'.repeat(43);
const event: PublicEvent = { title: 'Community Hack', registrationRequired: true, calendarEnabled: false, expiresAt: Date.now() + 10000 };
const invitation = buildEventInvitation(token, event, 'https://hack.example')!;

test('canonical capability URL excludes private routes and invented dates', () => {
  assert.equal(invitation.url, `https://hack.example/invite/${token}`);
  assert.equal(invitation.text, 'Join me at Community Hack! Come collaborate with us on #HACK Live.');
  const result = buildEventInvitation(token, event, 'https://user:secret@hack.example/admin?recovery=private#token')!;
  assert.equal(result.url, invitation.url);
  assert.doesNotMatch(result.fullText, /secret|recovery|private|admin|2026/);
  assert.equal(buildEventInvitation('session-id', event, 'https://hack.example'), null);
});
test('only explicitly published time in its selected zone enters share text', () => {
  const result = buildEventInvitation(token, { ...event, startsAt: '2026-12-03T01:30:00Z', endsAt: '2026-12-03T09:00:00Z', timeZone: 'Asia/Singapore' }, 'https://hack.example')!;
  assert.match(result.text, /3 Dec 2026, 09:30 \(Asia\/Singapore\)/);
});
test('ordinary @ names preserved; unsafe contact-style share titles fall back', () => {
  for (const title of ['Hack @ Singapore', 'Hack@Home']) assert.equal(buildEventInvitation(token, { ...event, title }, 'https://hack.example')!.title, title);
  for (const title of ['', '<b>Event</b>', 'admin@example.com', 'Visit https://private.example', 'a'.repeat(161)]) assert.equal(buildEventInvitation(token, { ...event, title }, 'https://hack.example')!.title, '#HACK Live workshop');
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
