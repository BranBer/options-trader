export function DeskSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">Loading the desk…</span>
      <div className="h-24 rounded-md bg-muted" />
      <div className="h-16 rounded-md bg-muted" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-48 rounded-md bg-muted" />
        <div className="h-48 rounded-md bg-muted" />
      </div>
      <div className="h-40 rounded-md bg-muted" />
    </div>
  );
}
