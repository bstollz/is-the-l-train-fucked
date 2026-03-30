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

// force-dynamic ensures Next.js never statically renders this page at build
// time. Every request runs this file fresh on the server, so users are never
// served a stale HTML snapshot from a previous deploy.
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status = "YES" | "KINDA" | "NOPE";

interface Alert {
  id: string;
  message: string;
  description: string | null;
}

interface TrainStatus {
  status: Status;
  alerts: Alert[];
  lastUpdated: string;  // formatted time string, e.g. "3:45 PM"
  funFact: string;      // random fact, shown only when status is NOPE
}

interface RedditPost {
  id: string;
  title: string;
  subreddit: string;
  score: number;
  permalink: string;  // relative path — prefix with https://reddit.com
}

interface RedditSection {
  label: string;      // display heading, e.g. "r/Bushwick"
  posts: RedditPost[];
}

// ---------------------------------------------------------------------------
// Server-side in-memory cache — 60-second TTL
// ---------------------------------------------------------------------------
// force-dynamic re-renders the page on every request, which is correct for
// freshness. But without any fetch-level caching, every visitor fires a
// separate HTTP request to the MTA API — which could trigger rate limiting
// under load. This module-level cache deduplicates those calls: the first
// request in a 60-second window hits the MTA; every subsequent request in
// that window gets the already-parsed result instantly.
//
// Trade-off: in a serverless environment (Vercel) each function instance has
// its own memory, so this is per-instance deduplication, not a global shared
// cache. It still dramatically reduces MTA API traffic during traffic spikes.
const CACHE_TTL_MS = 60_000;
let _cache: { data: TrainStatus; expiresAt: number } | null = null;

// ---------------------------------------------------------------------------
// Reddit OAuth — client_credentials flow
// ---------------------------------------------------------------------------
// www.reddit.com blocks requests from Vercel's shared IP ranges and returns
// HTML instead of JSON. The official OAuth API at oauth.reddit.com does not
// have this restriction. We use a "script"-type Reddit app with the
// client_credentials grant — no user login required.
//
// Required env vars (set in Vercel dashboard → Settings → Environment Variables):
//   REDDIT_CLIENT_ID     — the app's client ID (shown under the app name)
//   REDDIT_CLIENT_SECRET — the app's secret
//
// Tokens are valid for 24 hours; we cache them module-level so we only
// re-authenticate when the token actually expires.

const USER_AGENT = "web:is-the-l-train-fucked:v1.0 (by /u/your-reddit-username)";

let _redditToken: { token: string; expiresAt: number } | null = null;

async function getRedditToken(): Promise<string | null> {
  if (_redditToken && Date.now() < _redditToken.expiresAt) {
    return _redditToken.token;
  }

  const clientId     = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[Reddit] REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET not set");
    return null;
  }

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      console.error(`[Reddit] token request failed: HTTP ${res.status}`);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const token: string = json.access_token;
    // expires_in is in seconds; subtract a 60s buffer to refresh before expiry
    const expiresAt = Date.now() + (json.expires_in - 60) * 1000;
    _redditToken = { token, expiresAt };
    console.log("[Reddit] obtained new OAuth token");
    return token;
  } catch (err) {
    console.error("[Reddit] token exception:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchRedditSection(
  path: string,
  label: string,
  limit: number
): Promise<RedditSection> {
  const token = await getRedditToken();
  if (!token) return { label, posts: [] };

  try {
    const url = `https://oauth.reddit.com${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
      },
    });
    if (!res.ok) {
      console.error(`[Reddit] ${label}: HTTP ${res.status}`);
      return { label, posts: [] };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const children = json?.data?.children ?? [];
    const posts: RedditPost[] = children.slice(0, limit).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (child: any) => ({
        id: child.data.id,
        title: child.data.title,
        subreddit: child.data.subreddit,
        score: child.data.score,
        permalink: child.data.permalink,
      })
    );
    return { label, posts };
  } catch (err) {
    console.error(`[Reddit] ${label}: exception: ${err instanceof Error ? err.message : err}`);
    return { label, posts: [] };
  }
}

async function getRedditSections(): Promise<RedditSection[]> {
  const [bushwick, williamsburg, ridgewood, lTrain] = await Promise.all([
    fetchRedditSection("/r/Bushwick/hot.json?limit=3",       "r/Bushwick",       3),
    fetchRedditSection("/r/williamsburg/hot.json?limit=3",   "r/williamsburg",   3),
    fetchRedditSection("/r/ridgewood/hot.json?limit=3",      "r/ridgewood",      3),
    fetchRedditSection("/search.json?q=L+train&sort=new&limit=5", "L train mentions", 5),
  ]);
  return [bushwick, williamsburg, ridgewood, lTrain];
}

// ---------------------------------------------------------------------------
// Data fetching — runs on the server, never exposed to the browser
// ---------------------------------------------------------------------------

async function getLTrainStatus(): Promise<TrainStatus> {
  // Return cached result if it's still fresh.
  if (_cache && Date.now() < _cache.expiresAt) {
    console.log("[MTA] serving from server-side cache");
    return _cache.data;
  }

  try {
    // Fetch the MTA subway alerts feed (covers all lines).
    // This is a binary protobuf file — not JSON, not HTML.
    // We filter below to only keep alerts for the L train (route_id "L").
    //
    // No fetch-level cache option is set here because force-dynamic already
    // disables Next.js's fetch cache for this route. Caching is handled by
    // the module-level _cache above, giving us a controlled 60-second TTL.
    const res = await fetch(
      "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts",
      {
        headers: {
          // Some MTA endpoints block requests without a User-Agent.
          // x-api-key can be left blank for public feeds; register at
          // https://api.mta.info/ for a key with higher rate limits.
          "x-api-key": "",
          "User-Agent": "Mozilla/5.0",
        },
      }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `MTA feed returned HTTP ${res.status} ${res.statusText} — body: ${body}`
      );
    }

    // Read the response as a raw binary buffer and decode the protobuf.
    const buffer = await res.arrayBuffer();
    const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

    // Pull out every entity that mentions the L train (route_id "L").
    const allLEntities = feed.entity.filter((e) =>
      e.alert?.informedEntity?.some((ie) => ie.routeId === "L")
    );

    console.log(`[MTA] ${allLEntities.length} total L alert(s) in feed:`);
    for (const e of allLEntities) {
      const cause = e.alert?.cause;
      const effect = e.alert?.effect;
      const msg = e.alert?.headerText?.translation?.[0]?.text ?? "(no text)";
      console.log(`  id=${e.id} cause=${cause} effect=${effect} msg="${msg}"`);
    }

    // Keep only unplanned, service-impacting alerts that are active right now.
    // Exclude:
    //   - MAINTENANCE (9) and CONSTRUCTION (10): planned work scheduled in
    //     advance — weekend diversions, track work, etc.
    //   - NO_EFFECT (10): informational notices with no real service impact.
    const { Cause, Effect } = transit_realtime.Alert;
    const PLANNED_CAUSES = new Set([Cause.MAINTENANCE, Cause.CONSTRUCTION]);

    // The MTA feed is not a snapshot of current alerts — it includes past
    // alerts that have already ended AND future alerts that haven't started
    // yet, all mixed in with currently-active ones. We must compare each
    // alert's active_period windows against the current Unix timestamp and
    // drop any alert where *none* of its windows include right now.
    const nowSec = Math.floor(Date.now() / 1000);

    const lAlerts: Alert[] = allLEntities
      .filter((e) => {
        if (PLANNED_CAUSES.has(e.alert?.cause as number)) return false;
        if (e.alert?.effect === Effect.NO_EFFECT)          return false;

        const periods = e.alert?.activePeriod;
        if (periods && periods.length > 0) {
          const currentlyActive = periods.some((p) => {
            const start = p.start ? Number(p.start) : 0;
            const end   = p.end   ? Number(p.end)   : Infinity;
            return nowSec >= start && nowSec <= end;
          });
          if (!currentlyActive) return false;
        }

        return true;
      })
      .map((e) => ({
        id: e.id,
        message: e.alert?.headerText?.translation?.[0]?.text ?? "Service alert",
        description: e.alert?.descriptionText?.translation?.[0]?.text ?? null,
      }));

    console.log(`[MTA] ${lAlerts.length} active unplanned L alert(s) after filtering`);

    const status: Status = lAlerts.length === 0 ? "NOPE" : "YES";
    const funFact = FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];

    const result: TrainStatus = {
      status,
      alerts: lAlerts,
      lastUpdated: new Date().toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
      }),
      funFact,
    };

    // Store in cache for the next 60 seconds.
    _cache = { data: result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;

  } catch (err) {
    // Log the full error so you can read it in the terminal.
    // It will say something like "HTTP 403 Forbidden" or "fetch failed: <network reason>".
    console.error("[MTA fetch error]", err instanceof Error ? err.message : err);

    // Don't cache error responses — let the next request try the API again.
    return {
      status: "KINDA",
      alerts: [{ id: "err", message: "Couldn't reach the MTA feed. Classic.", description: null }],
      lastUpdated: new Date().toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
      }),
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
    headline: "YUP.",
    subheading: "The L train is fucked. Here's what's happening:",
  },
  KINDA: {
    bg: "#e07000",
    textColor: "#ffffff",
    headline: "KINDA.",
    subheading: "The L train may or may not be fucked. We're having trouble fetching data.",
  },
  NOPE: {
    bg: "#007a33",
    textColor: "#ffffff",
    headline: "NOPE.",
    subheading: "The L train is not fucked. Safe travels. Here's a fun fact for your journey:",
  },
};

// ---------------------------------------------------------------------------
// Page component — this is what renders the actual HTML
// ---------------------------------------------------------------------------

export default async function Home() {
  // Fetch MTA and Reddit data in parallel.
  const [{ status, alerts, lastUpdated, funFact }, redditSections] =
    await Promise.all([getLTrainStatus(), getRedditSections()]);

  // Get the visual config for the current status.
  const style = STATUS_STYLES[status];

  // For YES with only 1-2 alerts, use a softer subheading.
  const subheading =
    status === "YES" && alerts.length <= 2
      ? "The L train is a little fucked."
      : style.subheading;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Full-width header bar — in normal document flow */}
      <header
        style={{
          backgroundColor: "#1a1a1a",
          display: "flex",
          alignItems: "center",
          padding: "0.5rem 1.5rem",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <a href="/" aria-label="Is the L Train Fucked? — home">
          <svg
            viewBox="40 60 600 280"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: "200px", display: "block" }}
          >
            <rect x="40" y="60" width="600" height="280" rx="24" fill="#1a1a1a"/>
            <rect x="40" y="60" width="600" height="8" rx="4" fill="#A7A9AC"/>
            <rect x="40" y="332" width="600" height="8" rx="4" fill="#A7A9AC"/>
            <circle cx="160" cy="200" r="68" fill="#A7A9AC"/>
            <text x="160" y="200" textAnchor="middle" dominantBaseline="central" fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif" fontSize="80" fontWeight="700" fill="#1a1a1a">L</text>
            <line x1="254" y1="110" x2="254" y2="290" stroke="#A7A9AC" strokeWidth="1" opacity="0.3"/>
            <text x="284" y="158" dominantBaseline="central" fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif" fontSize="22" fontWeight="400" fill="#A7A9AC" letterSpacing="6">IS THE</text>
            <text x="284" y="198" dominantBaseline="central" fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif" fontSize="42" fontWeight="700" fill="#ffffff" letterSpacing="4">L TRAIN</text>
            <text x="284" y="240" dominantBaseline="central" fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif" fontSize="42" fontWeight="700" fill="#A7A9AC" letterSpacing="4">FUCKED?</text>
            <text x="284" y="308" dominantBaseline="central" fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif" fontSize="15" fontWeight="400" fill="#A7A9AC" letterSpacing="2" opacity="0.7">#LTrain.WTF</text>
          </svg>
        </a>
      </header>

      {/* Colored content area — fills remaining viewport height */}
      <main
        style={{
          backgroundColor: style.bg,
          color: style.textColor,
          flex: 1,
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
        {subheading}
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
                }}
              >
                <div style={{ fontSize: "0.9rem", fontWeight: "bold", lineHeight: 1.5 }}>
                  {alert.message}
                </div>
                {alert.description && (
                  <div
                    style={{
                      marginTop: "0.35rem",
                      fontSize: "0.8rem",
                      lineHeight: 1.6,
                      opacity: 0.75,
                      fontWeight: "normal",
                    }}
                  >
                    {alert.description}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reddit sections */}
      {redditSections.some((s) => s.posts.length > 0) && (
        <div
          style={{
            marginTop: "3rem",
            width: "100%",
            maxWidth: "700px",
          }}
        >
          <h2
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              opacity: 0.7,
              marginBottom: "1.5rem",
            }}
          >
            What the neighborhood is saying
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {redditSections.map((section) =>
              section.posts.length === 0 ? null : (
                <div key={section.label}>
                  <h3
                    style={{
                      fontSize: "0.7rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      opacity: 0.6,
                      marginBottom: "0.6rem",
                    }}
                  >
                    {section.label}
                  </h3>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {section.posts.map((post) => (
                      <li
                        key={post.id}
                        style={{
                          marginBottom: "0.6rem",
                          padding: "0.6rem 0.75rem",
                          backgroundColor: "rgba(0,0,0,0.2)",
                          borderRadius: "0.4rem",
                        }}
                      >
                        <a
                          href={`https://reddit.com${post.permalink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "inherit",
                            textDecoration: "none",
                            display: "block",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.82rem",
                              fontWeight: "bold",
                              lineHeight: 1.4,
                              marginBottom: "0.3rem",
                            }}
                          >
                            {post.title}
                          </div>
                          <div
                            style={{
                              fontSize: "0.7rem",
                              opacity: 0.6,
                            }}
                          >
                            r/{post.subreddit} · ▲ {post.score.toLocaleString()}
                          </div>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )}
          </div>
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
    </div>
  );
}
