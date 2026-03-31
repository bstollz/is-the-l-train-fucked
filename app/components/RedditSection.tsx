"use client";

// Fetches Reddit posts in the browser, not on the server.
// This sidesteps Reddit blocking Vercel's server IPs — requests come from
// the user's own browser where Reddit's public JSON API works normally.

import { useEffect, useState } from "react";

interface RedditPost {
  id: string;
  title: string;
  subreddit: string;
  score: number;
  permalink: string;
}

interface Section {
  label: string;
  url: string;
  limit: number;
  posts: RedditPost[] | null; // null = still loading
}

const SECTIONS: Omit<Section, "posts">[] = [
  { label: "r/Bushwick",       url: "https://www.reddit.com/r/Bushwick/hot.json?limit=3",       limit: 3 },
  { label: "r/williamsburg",   url: "https://www.reddit.com/r/williamsburg/hot.json?limit=3",   limit: 3 },
  { label: "r/ridgewood",      url: "https://www.reddit.com/r/ridgewood/hot.json?limit=3",      limit: 3 },
  { label: "L train mentions", url: "https://www.reddit.com/search.json?q=%22L+train%22+%28NYC+OR+Brooklyn+OR+MTA+OR+Williamsburg+OR+subway%29&sort=new&limit=5", limit: 5 },
];

async function fetchSection(url: string, limit: number): Promise<RedditPost[]> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json?.data?.children ?? []).slice(0, limit).map((c: any) => ({
    id: c.data.id,
    title: c.data.title,
    subreddit: c.data.subreddit,
    score: c.data.score,
    permalink: c.data.permalink,
  }));
}

interface Props {
  textColor: string;
}

export default function RedditSection({ textColor }: Props) {
  const [sections, setSections] = useState<Section[]>(
    SECTIONS.map((s) => ({ ...s, posts: null }))
  );

  useEffect(() => {
    SECTIONS.forEach((s, i) => {
      fetchSection(s.url, s.limit)
        .then((posts) =>
          setSections((prev) =>
            prev.map((sec, j) => (j === i ? { ...sec, posts } : sec))
          )
        )
        .catch(() =>
          setSections((prev) =>
            prev.map((sec, j) => (j === i ? { ...sec, posts: [] } : sec))
          )
        );
    });
  }, []);

  const allLoaded  = sections.every((s) => s.posts !== null);
  const anyResults = sections.some((s) => s.posts && s.posts.length > 0);

  // While loading, show a subtle placeholder so the section doesn't pop in.
  if (!allLoaded && !anyResults) {
    return (
      <div style={{ marginTop: "3rem", width: "100%", maxWidth: "700px", opacity: 0.4, fontSize: "0.75rem", textAlign: "center" }}>
        Loading neighborhood posts…
      </div>
    );
  }

  if (allLoaded && !anyResults) return null;

  return (
    <div style={{ marginTop: "3rem", width: "100%", maxWidth: "700px", color: textColor }}>
      <h2
        style={{
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          opacity: 0.7,
          marginBottom: "1.5rem",
          margin: "0 0 1.5rem 0",
        } as React.CSSProperties}
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
        {sections.map((section) => {
          if (!section.posts || section.posts.length === 0) return null;
          return (
            <div key={section.label}>
              <h3
                style={{
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  opacity: 0.6,
                  margin: 0,
                  marginBottom: "0.6rem",
                } as React.CSSProperties}
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
                      style={{ color: "inherit", textDecoration: "none", display: "block" }}
                    >
                      <div style={{ fontSize: "0.82rem", fontWeight: "bold", lineHeight: 1.4, marginBottom: "0.3rem" }}>
                        {post.title}
                      </div>
                      <div style={{ fontSize: "0.7rem", opacity: 0.6 }}>
                        r/{post.subreddit} · ▲ {post.score.toLocaleString()}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
