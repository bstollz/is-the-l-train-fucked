// app/api/status/route.ts
//
// This is a MOCK API route for development and testing.
// It randomly returns YES, KINDA, or NOPE so you can preview all three states.
//
// The homepage (app/page.tsx) does NOT call this route — it fetches
// directly from the MTA feed as a server component. This file exists
// so you have a testable JSON endpoint at /api/status.
//
// To see the mock data: visit http://localhost:3000/api/status in your browser.

import { NextResponse } from "next/server";

// The three possible states, picked randomly on each request.
const STATUSES = ["YES", "KINDA", "NOPE"] as const;

// Sample summaries for each status level.
const SUMMARIES: Record<(typeof STATUSES)[number], string> = {
  YES: "Signal problems causing major delays. Good luck out there.",
  KINDA: "Minor delays reported. The L is being the L.",
  NOPE: "No active alerts. Shockingly, the L is fine.",
};

export async function GET() {
  // Pick a random status every time this endpoint is called.
  const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];

  return NextResponse.json({
    fucked: status === "YES",       // true only when it's really bad
    status,                          // "YES" | "KINDA" | "NOPE"
    summary: SUMMARIES[status],      // human-readable explanation
    lastUpdated: new Date().toISOString(), // when this response was generated
  });
}

// ---------------------------------------------------------------------------
// REAL DATA VERSION (replace the function above with this when you're ready)
// ---------------------------------------------------------------------------
//
// import { FeedMessage } from "gtfs-realtime-bindings";
// import { NextResponse } from "next/server";
//
// export async function GET() {
//   // Fetch the MTA subway alerts feed (protobuf binary format).
//   const res = await fetch(
//     "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts",
//     { next: { revalidate: 60 } }  // cache for 60 seconds
//   );
//   const buffer = await res.arrayBuffer();
//
//   // Decode the protobuf binary into a JavaScript object.
//   const feed = FeedMessage.decode(new Uint8Array(buffer));
//
//   // Filter alerts to only those affecting the L train (route_id "L").
//   const lAlerts = feed.entity.filter((e) =>
//     e.alert?.informedEntity?.some((ie) => ie.routeId === "L")
//   );
//
//   // Determine overall status based on alert count.
//   const count = lAlerts.length;
//   const status = count === 0 ? "NOPE" : count <= 2 ? "KINDA" : "YES";
//
//   return NextResponse.json({
//     fucked: status === "YES",
//     status,
//     summary: lAlerts[0]?.alert?.headerText?.translation?.[0]?.text ?? "Service alert",
//     lastUpdated: new Date().toISOString(),
//     alerts: lAlerts.map((e) => ({
//       id: e.id,
//       message: e.alert?.headerText?.translation?.[0]?.text ?? "Service alert",
//     })),
//   });
// }
