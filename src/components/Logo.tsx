export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" data-tauri-drag-region aria-label="Tagloom">
      <span className="brandMark" aria-hidden="true"><i /><i /><i /></span>
      {!compact && <span className="brandName">Tagloom</span>}
    </div>
  );
}
