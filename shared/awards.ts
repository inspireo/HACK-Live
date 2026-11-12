export type AwardKind = 'individual' | 'team';
export type AwardCategory = { id: string; sessionId: string; name: string; kind: AwardKind };
export type AwardTarget = { participantId: string } | { collectionName: 'teams' | 'discoveryTeams'; teamId: string };
export type AwardRecipient = { participantId: string | null; memberId: string | null; name: string; credit: 'verified' | 'unlinked' | 'deleted' | 'ineligible' };
export type AwardSnapshot = {
  eventName: string; eventDate: string | null; categoryName: string;
  team: { collectionName: 'teams' | 'discoveryTeams'; teamId: string; name: string } | null;
  recipients: AwardRecipient[];
};
export type AwardSummary = { id: string; sessionId: string; eventName: string; eventDate: string | null; categoryName: string; teamName: string | null; publishedAt: string; recipientNames: string[] };
export const awardId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
export function awardName(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100; }
export function awardTarget(kind: AwardKind, target: any): target is AwardTarget {
  return !!target && typeof target === 'object' && (kind === 'individual'
    ? Object.keys(target).length === 1 && awardId(target.participantId)
    : Object.keys(target).length === 2 && ['teams', 'discoveryTeams'].includes(target.collectionName) && awardId(target.teamId));
}
// Private audit, identity references and arbitrary profile fields never enter summaries.
export function awardSummary(resultId: string, source: any, recipientNames: string[]): AwardSummary {
  return { id: resultId, sessionId: source.sessionId, eventName: source.snapshot.eventName, eventDate: source.snapshot.eventDate,
    categoryName: source.snapshot.categoryName, teamName: source.snapshot.team?.name ?? null, publishedAt: source.publishedAt, recipientNames };
}
