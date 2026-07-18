export function calculateProgress(completed: number, total: number): number {
  if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, completed / total));
}
