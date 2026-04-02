// app/api/weekly-count/route.ts
//
// Returns the number of distinct unplanned L train service disruptions
// that were active at any point since the start of the current ISO week (Monday).
//
// Strategy:
//   - Module-level Set accumulates unique alert IDs across requests (best-effort;
//     resets on cold starts in serverless, but the client merges with localStorage
//     to give persistent per-device totals).
//   - On each call the MTA feed is re-fetched if the 60s TTL has expired.
//   - At the start of a new week the Set is reset automatically.

import { transit_realtime } from "gtfs-realtime-bindings";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Week helpers
// ---------------------------------------------------------------------------

function getMondayKey(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getWeekStartSec(date: Date): number {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let currentWeekKey = "";
let seenAlertIds = new Set<string>();
let lastFetchMs = 0;
const FETCH_TTL_MS = 60_000;

// ---------------------------------------------------------------------------
// MTA fetch + filtering
// ---------------------------------------------------------------------------

async function refreshFromMTA(): Promise<void> {
  const res = await fetch(
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts",
    { headers: { "x-api-key": "", "User-Agent": "Mozilla/5.0" } }
  );
  if (!res.ok) throw new Error(`MTA ${res.status}`);

  const buffer = await res.arrayBuffer();
  const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

  const { Cause, Effect } = transit_realtime.Alert;
  const PLANNED_CAUSES = new Set([Cause.MAINTENANCE, Cause.CONSTRUCTION]);
  const nowSec = Math.floor(Date.now() / 1000);
  const weekStartSec = getWeekStartSec(new Date());

  for (const entity of feed.entity) {
    // Must affect the L
    if (!entity.alert?.informedEntity?.some((ie) => ie.routeId === "L")) continue;
    // Skip planned / info-only
    if (PLANNED_CAUSES.has(entity.alert?.cause as number)) continue;
    if (entity.alert?.effect === Effect.NO_EFFECT) continue;

    // Must have been active at some point this week
    const periods = entity.alert?.activePeriod;
    if (periods && periods.length > 0) {
      const activeThisWeek = periods.some((p) => {
        const start = p.start ? Number(p.start) : 0;
        const end   = p.end   ? Number(p.end)   : Infinity;
        // Overlap: [start,end] intersects [weekStartSec, nowSec]
        return start <= nowSec && end >= weekStartSec;
      });
      if (!activeThisWeek) continue;
    }

    seenAlertIds.add(entity.id);
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET() {
  const now = Date.now();
  const weekKey = getMondayKey(new Date());

  // Reset on new week
  if (weekKey !== currentWeekKey) {
    currentWeekKey = weekKey;
    seenAlertIds = new Set();
    lastFetchMs = 0;
  }

  // Refresh from MTA if TTL expired
  if (now - lastFetchMs > FETCH_TTL_MS) {
    lastFetchMs = now;
    try {
      await refreshFromMTA();
    } catch {
      // Return whatever we have so far
    }
  }

  return Response.json({
    count: seenAlertIds.size,
    alertIds: [...seenAlertIds],
    week: weekKey,
  });
}
