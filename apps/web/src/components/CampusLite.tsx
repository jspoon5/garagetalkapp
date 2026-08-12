export type CampusLiteHotspot = {
  id: string;
  label: string;
  href: string;
  x: number;
  y: number;
  activityCount: number;
};

export const CAMPUS_LITE_LOAD_BUDGET = {
  initialJsKb: 28,
  art: "single inline SVG hub, no raster textures, no blocking fetches",
  note: "Campus Lite must stay mobile-first and render list mode without canvas support.",
};

export function liveBadgeCount(count: number, threshold = 3): number {
  return count >= threshold ? count : 0;
}

export function campusListModeItems(hotspots: CampusLiteHotspot[], threshold = 3) {
  return hotspots.map((hotspot) => ({
    id: hotspot.id,
    label: hotspot.label,
    href: hotspot.href,
    tabIndex: 0,
    badgeCount: liveBadgeCount(hotspot.activityCount, threshold),
    ariaLabel: `${hotspot.label} ${hotspot.href}`,
  }));
}

export function CampusLite({
  hotspots,
  listMode = false,
  threshold = 3,
}: {
  hotspots: CampusLiteHotspot[];
  listMode?: boolean;
  threshold?: number;
}) {
  const copy = {
    title: "Campus Lite",
    listLabel: "Campus feature list",
    hubLabel: "Campus hub hotspots",
    badge: "live",
  };
  const items = campusListModeItems(hotspots, threshold);
  if (listMode) {
    return (
      <nav aria-label={copy.listLabel}>
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <a href={item.href} tabIndex={item.tabIndex} aria-label={item.ariaLabel}>
                {item.label}
                {item.badgeCount ? <span aria-label={copy.badge}>{item.badgeCount}</span> : null}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    <section aria-label={copy.hubLabel}>
      <svg viewBox="0 0 320 220" role="img" aria-label={copy.title}>
        <title>{copy.title}</title>
        <path d="M25 165 L150 55 L295 165 L175 205 Z" fill="#1e293b" stroke="#f59e0b" />
        {hotspots.map((hotspot) => (
          <a key={hotspot.id} href={hotspot.href} aria-label={hotspot.label}>
            <circle cx={hotspot.x} cy={hotspot.y} r="16" fill="#f59e0b" />
            {liveBadgeCount(hotspot.activityCount, threshold) ? (
              <text x={hotspot.x + 14} y={hotspot.y - 10} fill="#ffffff">
                {hotspot.activityCount}
              </text>
            ) : null}
          </a>
        ))}
      </svg>
    </section>
  );
}
