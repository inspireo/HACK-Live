// Only the trusted event deletion transaction sets this marker. Legacy events remain active.
export function isEventDeleted(event: { deletedAt?: unknown } | null | undefined): boolean {
  return event?.deletedAt != null;
}
