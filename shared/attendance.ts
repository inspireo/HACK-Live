export type EventSnapshot = { title: string; date: string | null };
export function eventSnapshot(event: Record<string, unknown>): EventSnapshot {
  return { title: typeof event.title === 'string' ? event.title.slice(0, 200) : 'Event', date: typeof event.date === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(event.date) && Number.isFinite(Date.parse(event.date)) ? event.date : null };
}
export function attendanceEligible(member: Record<string, unknown>, sessionId: string, uid: string) {
  return member.sessionId === sessionId && member.uid === uid && member.memberId === uid && member.identityState !== 'deleted' && (member.participationState === undefined || member.participationState === 'active');
}
export function historySummary(sessionId: string, event: EventSnapshot, attendance?: Record<string, any>, registered = false) {
  return { sessionId, eventName: event.title, eventDate: event.date, registered, attendanceStatus: attendance?.status === 'attended' ? 'verified-attended' : 'not-verified', occurredAt: attendance?.status === 'attended' ? attendance.occurredAt : null };
}
