import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocationEligible, badgeMemberDetails, officialRoles, profileUrl, solutionTeamId, teamMembership } from '../shared/participation';

test('allocation compatibility: historical participants and mixed official roles remain eligible in both allocation phases', () => {
  const historical = { name: 'Legacy workshop identity', primaryArchetype: 'mentor', title: 'Volunteer', teamRoleLabels: { 'teams~old': 'lead' } };
  assert.equal(allocationEligible(historical as any), true);
  assert.deepEqual(officialRoles(historical as any), ['participant']);
  for (const roles of [['mentor'], ['volunteer'], ['judge'], ['challenge owner'], ['organizer/facilitator'], ['mentor', 'volunteer']]) assert.equal(allocationEligible({ officialRoles: roles }), false);
  assert.equal(allocationEligible({ officialRoles: ['mentor', 'participant'] }), true);
  assert.equal(allocationEligible({ officialRoles: ['participant'], participationState: 'inactive' }), false);
  assert.equal(allocationEligible({ identityState: 'deleted' }), false);
});

test('membership aliases resolve without using descriptive labels as membership/leadership', () => {
  assert.equal(teamMembership({ id: 'p', solutioning_team_id: 't' }, 'teams', 't', {}), true);
  assert.equal(teamMembership({ id: 'p', discovery_team_id: 'd' }, 'discoveryTeams', 'd', {}), true);
  assert.equal(teamMembership({ id: 'p' }, 'formingDiscoveryTeams', 'd', { memberIds: ['p'] }), true);
  assert.equal(teamMembership({ id: 'p', teamRoleLabels: { 'teams~t': 'lead' } }, 'teams', 't', { leaderId: 'p' }), false);
  assert.equal(solutionTeamId({ teamId: null, solutioning_team_id: 'legacy' }), 'legacy');
  assert.equal(solutionTeamId({ teamId: 'canonical', solutioning_team_id: 'legacy' }), 'canonical');
  assert.equal(solutionTeamId({ teamId: null, solutioning_team_id: null }), null);
});

test('badge optional profile seam projects only selected name-independent photo/title; rejects unsafe photos', () => {
  assert.deepEqual(badgeMemberDetails({ avatarUrl: 'https://images.example.test/member.png', title: 'Researcher', contacts: { email: 'private' }, phone: 'private', role: 'admin', bio: 'unrequested' }), { avatarUrl: 'https://images.example.test/member.png', title: 'Researcher' });
  for (const avatarUrl of ['javascript:alert(1)', 'data:image/png;base64,secret', 'http://example.test/photo', 'https://user:password@example.test/photo', 'invalid']) assert.equal(badgeMemberDetails({ avatarUrl }).avatarUrl, undefined);
  assert.deepEqual(badgeMemberDetails(), { avatarUrl: undefined, title: undefined });
});

test('QR payload is only the opaque profile destination without event, labels, contacts or tokens', () => {
  const url = new URL(profileUrl('https://hack.example.test', 'opaque-account-123'));
  assert.equal(url.href, 'https://hack.example.test/members/opaque-account-123');
  assert.equal(url.search, ''); assert.equal(url.hash, '');
  assert.equal(profileUrl('https://hack.example.test', 'opaque/segment'), 'https://hack.example.test/members/opaque%2Fsegment');
});
