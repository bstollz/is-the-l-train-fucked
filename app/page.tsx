// app/page.tsx
//
// This is the homepage — the main page users see.
// It's a Server Component, meaning it runs on the server at request time.
// It fetches LIVE data from the MTA feed directly (no localhost calls).
//
// DATA FLOW:
//   1. User visits the site
//   2. Next.js runs this file on the server
//   3. getLTrainStatus() fetches the MTA subway-alerts protobuf feed
//   4. We decode it, count L train alerts, and pick a status: YES / KINDA / NOPE
//   5. The page renders with the correct color, message, and fun fact
//   6. The finished HTML is sent to the user's browser

// The package exports a `transit_realtime` namespace — FeedMessage lives inside it,
// not at the top level. `import { FeedMessage }` would be undefined.
import { transit_realtime } from "gtfs-realtime-bindings";
import { FUN_FACTS } from "./lib/funFacts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status = "YES" | "KINDA" | "NOPE";

interface Alert {
  id: string;
  message: string;
}

interface TrainStatus {
  status: Status;
  alerts: Alert[];
  lastUpdated: string;      // formatted time string, e.g. "3:45 PM"
  funFact: string;          // random fact, shown only when status is NOPE
}

// ---------------------------------------------------------------------------
// Data fetching — runs on the server, never exposed to the browser
// ---------------------------------------------------------------------------

async function getLTrainStatus(): Promise<TrainStatus> {
  try {
    // Fetch the MTA subway alerts feed (covers all lines).
    // This is a binary protobuf file — not JSON, not HTML.
    // We filter below to only keep alerts for the L train (route_id "L").
    const res = await fetch(
      "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts",
      {
        // Don't cache this — we want fresh data on every page load.
        // If your site gets lots of traffic, change to: { next: { revalidate: 60 } }
        cache: "no-store",
        headers: {
          // Some MTA endpoints block requests without a User-Agent.
          // x-api-key can be left empty for public feeds; add a real key here
          // if you register at https://api.mta.info/ for higher rate limits.
          "x-api-key": "",
          "User-Agent": "Mozilla/5.0",
        },
      }
    );

    if (!res.ok) {
      // Log the status code AND the response body text so we can see
      // exactly what the MTA server is saying (e.g. "Unauthorized", "Forbidden").
      const body = await res.text();
      throw new Error(
        `MTA feed returned HTTP ${res.status} ${res.statusText} — body: ${body}`
      );
    }

    // Read the response as a raw binary buffer.
    const buffer = await res.arrayBuffer();

    // Decode the protobuf binary into a JavaScript object using gtfs-realtime-bindings.
    const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

    // Pull out every entity that mentions the L train (route_id "L").
    const allLEntities = feed.entity.filter((e) =>
      e.alert?.informedEntity?.some((ie) => ie.routeId === "L")
    );

    // Log every raw L alert to the terminal so we can inspect what the MTA
    // is actually sending. Look for this output in the `npm run dev` window.
    console.log(`[MTA] ${allLEntities.length} total L alert(s) in feed:`);
    for (const e of allLEntities) {
      const cause = e.alert?.cause;   // numeric — see Cause enum below
      const effect = e.alert?.effect; // numeric — see Effect enum below
      const msg = e.alert?.headerText?.translation?.[0]?.text ?? "(no text)";
      // Cause: 1=UNKNOWN 2=OTHER 3=TECHNICAL_PROBLEM 4=STRIKE 5=DEMONSTRATION
      //        6=ACCIDENT 7=HOLIDAY 8=WEATHER 9=MAINTENANCE 10=CONSTRUCTION
      //        11=POLICE_ACTIVITY 12=MEDICAL_EMERGENCY
      // Effect: 1=NO_SERVICE 2=REDUCED_SERVICE 3=SIGNIFICANT_DELAYS 4=DETOUR
      //         5=ADDITIONAL_SERVICE 6=MODIFIED_SERVICE 7=OTHER_EFFECT
      //         8=UNKNOWN_EFFECT 9=STOP_MOVED 10=NO_EFFECT 11=ACCESSIBILITY_ISSUE
      console.log(`  id=${e.id} cause=${cause} effect=${effect} msg="${msg}"`);
    }

    // Keep only unplanned, service-impacting alerts.
    // Exclude:
    //   - MAINTENANCE (9) and CONSTRUCTION (10): planned work the MTA schedules
    //     in advance — weekend diversions, track work, etc.
    //   - NO_EFFECT (10): informational notices with no real service impact.
    const { Cause, Effect } = transit_realtime.Alert;
    const PLANNED_CAUSES = new Set([Cause.MAINTENANCE, Cause.CONSTRUCTION]);

    const lAlerts: Alert[] = allLEntities
      .filter((e) => {
        if (PLANNED_CAUSES.has(e.alert?.cause as number)) return false;
        if (e.alert?.effect === Effect.NO_EFFECT)          return false;
        return true;
      })
      .map((e) => ({
        id: e.id,
        message:
          e.alert?.headerText?.translation?.[0]?.text ?? "Service alert",
      }));

    console.log(`[MTA] ${lAlerts.length} unplanned L alert(s) after filtering`);

    // Decide the overall status based on how many unplanned alerts remain.
    const count = lAlerts.length;
    const status: Status =
      count === 0 ? "NOPE" : count <= 2 ? "KINDA" : "YES";

    // Pick a random fun fact (only shown when status is NOPE).
    const funFact =
      FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];

    return {
      status,
      alerts: lAlerts,
      lastUpdated: new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      funFact,
    };
  } catch (err) {
    // Log the full error so you can read it in the terminal where `npm run dev` is running.
    // It will say something like "HTTP 403 Forbidden" or "fetch failed: <network reason>".
    console.error("[MTA fetch error]", err instanceof Error ? err.message : err);
    return {
      status: "KINDA",
      alerts: [{ id: "err", message: "Couldn't reach the MTA feed. Classic." }],
      lastUpdated: "unknown",
      funFact: "",
    };
  }
}

// ---------------------------------------------------------------------------
// Visual config — edit these to change colors, text, or messages
// ---------------------------------------------------------------------------

// Background color, text color, and headline for each status.
// To change styling, edit the values here.
const STATUS_STYLES: Record<
  Status,
  { bg: string; textColor: string; headline: string; subheading: string }
> = {
  YES: {
    bg: "#cc0000",
    textColor: "#ffffff",
    headline: "YES.",
    subheading: "The L train is fucked.",
  },
  KINDA: {
    bg: "#e07000",
    textColor: "#ffffff",
    headline: "KINDA.",
    subheading: "There are delays. Ish. Plan accordingly.",
  },
  NOPE: {
    bg: "#007a33",
    textColor: "#ffffff",
    headline: "NOPE.",
    subheading: "No active alerts. Safe travels.",
  },
};

// ---------------------------------------------------------------------------
// Page component — this is what renders the actual HTML
// ---------------------------------------------------------------------------

export default async function Home() {
  // Fetch live data when the page loads.
  const { status, alerts, lastUpdated, funFact } = await getLTrainStatus();

  // Get the visual config for the current status.
  const style = STATUS_STYLES[status];

  return (
    // Full-page colored background — color changes based on status
    <main
      style={{
        backgroundColor: style.bg,
        color: style.textColor,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "monospace",
        padding: "2rem",
        boxSizing: "border-box",
      }}
    >
      {/* Site title */}
      <h1
        style={{
          fontSize: "1rem",
          fontWeight: "normal",
          opacity: 0.7,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: "1.5rem",
          textAlign: "center",
        }}
      >
        is the l train fucked?
      </h1>

      {/* Giant status word — YES / KINDA / NOPE */}
      <div
        style={{
          fontSize: "clamp(4rem, 20vw, 10rem)", // scales with screen size
          fontWeight: "900",
          lineHeight: 1,
          letterSpacing: "-0.04em",
          textAlign: "center",
        }}
      >
        {style.headline}
      </div>

      {/* One-line explanation below the big word */}
      <p
        style={{
          fontSize: "clamp(1rem, 3vw, 1.5rem)",
          marginTop: "1rem",
          fontWeight: "bold",
          textAlign: "center",
          opacity: 0.9,
        }}
      >
        {style.subheading}
      </p>

      {/* Fun fact — only shows when everything is fine */}
      {status === "NOPE" && funFact && (
        <div
          style={{
            marginTop: "2rem",
            padding: "1rem 1.5rem",
            backgroundColor: "rgba(0,0,0,0.2)",
            borderRadius: "0.5rem",
            maxWidth: "500px",
            textAlign: "center",
            fontSize: "0.9rem",
            lineHeight: 1.6,
          }}
        >
          <strong>Fun fact while you wait:</strong>
          <br />
          {funFact}
        </div>
      )}

      {/* Active alerts list — shown when status is KINDA or YES */}
      {alerts.length > 0 && status !== "NOPE" && (
        <div
          style={{
            marginTop: "2rem",
            maxWidth: "500px",
            width: "100%",
          }}
        >
          <h2
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              opacity: 0.7,
              marginBottom: "0.75rem",
            }}
          >
            Active Alerts
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {alerts.map((alert) => (
              <li
                key={alert.id}
                style={{
                  padding: "0.75rem 0",
                  borderBottom: "1px solid rgba(255,255,255,0.2)",
                  fontSize: "0.9rem",
                  lineHeight: 1.5,
                }}
              >
                {alert.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Timestamp footer */}
      <p
        style={{
          marginTop: "3rem",
          fontSize: "0.75rem",
          opacity: 0.5,
          textAlign: "center",
        }}
      >
        Last updated: {lastUpdated} · live MTA data
      </p>
    </main>
  );
}
