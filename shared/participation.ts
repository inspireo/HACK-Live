export const EVENT_ROLES = ['participant', 'mentor', 'volunteer', 'judge', 'challenge owner', 'organizer/facilitator'] as const;
export type EventRole = typeof EVENT_ROLES[number];
export const TEAM_LABELS = ['lead', 'developer', 'designer', 'researcher'] as const;
export type Participation = {
  officialRoles?: EventRole[];
  roleChallengeId?: string | null;
  participationState?: 'active' | 'inactive';
  teamRoleLabels?: Record<string, string>;
};

// Missing roles preserve every historical participant's allocation behavior.
export function allocationEligible(member: { officialRoles?: string[]; participationState?: string; identityState?: string }) {
  return member.identityState !== 'deleted' && member.participationState !== 'inactive' &&
    (member.officialRoles === undefined || member.officialRoles.includes('participant'));
}
export function officialRoles(member: { officialRoles?: string[] }) { return member.officialRoles ?? ['participant']; }
export function teamMembership(member: any, collectionName: string, teamId: string, team: any) {
  if (collectionName.startsWith('forming')) return Array.isArray(team.memberIds) && team.memberIds.includes(member.id);
  return collectionName === 'discoveryTeams'
    ? member.discoveryTeamId === teamId || member.discovery_team_id === teamId
    : member.teamId === teamId || member.solutioning_team_id === teamId;
}
export function profileUrl(origin: string, memberId: string) { return `${origin}/members/${encodeURIComponent(memberId)}`; }

// Only consume the member-visible PR2 projection, never its private source.
export function badgeMemberDetails(selected: Record<string, unknown> = {}) {
  let avatarUrl: string | undefined;
  if (typeof selected.avatarUrl === 'string') {
    try {
      const photo = new URL(selected.avatarUrl);
      if (photo.protocol === 'https:' && !photo.username && !photo.password) avatarUrl = photo.href;
    } catch { /* Invalid optional photo leaves a name-only badge. */ }
  }
  return { avatarUrl, title: typeof selected.title === 'string' ? selected.title : undefined };
}
