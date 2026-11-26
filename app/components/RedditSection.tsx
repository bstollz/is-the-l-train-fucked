"use client";

// Two sections:
//  1. Reddit — fetched server-side via /api/reddit (Reddit blocks unauthenticated browsers)
//  2. News   — Streetsblog, Gothamist, Brooklyn Paper via rss2json (client-side RSS proxy)

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface Article {
  title: string;
  link: string;
}

interface NewsSource {
  label: string;
  articles: Article[] | null; // null = loading
}

interface RedditPost {
  title: string;
  url: string;
  subreddit: string;
  score: number;
  numComments: number;
  createdUtc: number;
}

interface Props {
  textColor: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const L_TRAIN_RE =
  /l[\s-]train|mta|subway|bus|transit|bushwick|williamsburg|ridgewood|canarsie|bedford|lorimer|morgan av|jefferson|halsey|wilson|kosciuszko|broadway junction/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchRss(feedUrl: string, filter?: RegExp): Promise<Article[]> {
  try {
    const res = await fetch(
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`
    );
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any;
    if (json?.status !== "ok") return [];
    const items = (json.items ?? []) as { title: string; link: string; description?: string }[];
    const filtered = filter
      ? items.filter((item) => filter.test(item.title) || filter.test(item.description ?? ""))
      : items;
    return filtered.slice(0, 4).map((item) => ({ title: item.title, link: item.link }));
  } catch {
    return [];
  }
}

function timeAgo(utcSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - utcSeconds;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RedditSection({ textColor }: Props) {
  const [redditPosts, setRedditPosts] = useState<RedditPost[] | null>(null);
  const [newsSources, setNewsSources] = useState<NewsSource[]>([
    { label: "Streetsblog NYC", articles: null },
    { label: "Gothamist",       articles: null },
    { label: "Brooklyn Paper",  articles: null },
  ]);

  useEffect(() => {
    // Reddit — via server-side proxy
    fetch("/api/reddit")
      .then((res) => res.json())
      .then((data) => setRedditPosts(data.posts ?? []))
      .catch(() => setRedditPosts([]));

    // Streetsblog — all transit, no filter needed
    fetchRss("https://nyc.streetsblog.org/feed")
      .then((articles) => setNewsSources((prev) => prev.map((s, i) => i === 0 ? { ...s, articles } : s)))
      .catch(()         => setNewsSources((prev) => prev.map((s, i) => i === 0 ? { ...s, articles: [] } : s)));

    // Gothamist + Brooklyn Paper — filter for L train / transit / neighborhood keywords
    fetchRss("https://gothamist.com/feed", L_TRAIN_RE)
      .then((articles) => setNewsSources((prev) => prev.map((s, i) => i === 1 ? { ...s, articles } : s)))
      .catch(()         => setNewsSources((prev) => prev.map((s, i) => i === 1 ? { ...s, articles: [] } : s)));

    fetchRss("https://brooklynpaper.com/feed/", L_TRAIN_RE)
      .then((articles) => setNewsSources((prev) => prev.map((s, i) => i === 2 ? { ...s, articles } : s)))
      .catch(()         => setNewsSources((prev) => prev.map((s, i) => i === 2 ? { ...s, articles: [] } : s)));
  }, []);

  const visibleNewsSources = newsSources.filter((s) => s.articles && s.articles.length > 0);
  const hasReddit          = redditPosts !== null && redditPosts.length > 0;
  const hasNews            = visibleNewsSources.length > 0;

  if (!hasReddit && !hasNews) return null;

  return (
    <div style={{ marginTop: "3rem", width: "100%", maxWidth: "700px", color: textColor }}>

      {/* Reddit posts */}
      {hasReddit && (
        <div style={{ marginBottom: "2.5rem" }}>
          <h2
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              opacity: 0.7,
              margin: "0 0 1rem 0",
            } as React.CSSProperties}
          >
            What people are saying on Reddit
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {redditPosts!.map((post) => (
              <li
                key={post.url}
                style={{
                  padding: "0.6rem 0.75rem",
                  backgroundColor: "rgba(0,0,0,0.2)",
                  borderRadius: "0.4rem",
                }}
              >
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "inherit", textDecoration: "none", display: "block" }}
                >
                  <div style={{ fontSize: "0.82rem", fontWeight: "bold", lineHeight: 1.4 }}>
                    {post.title}
                  </div>
                  <div style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: "0.25rem" }}>
                    {post.subreddit} · {post.score} pts · {post.numComments} comments · {timeAgo(post.createdUtc)}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* News sources */}
      {hasNews && (
        <div>
          <h2
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              opacity: 0.7,
              margin: "0 0 1.5rem 0",
            } as React.CSSProperties}
          >
            What&apos;s happening in the neighborhood
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {visibleNewsSources.map((source) => (
              <div key={source.label}>
                <h3
                  style={{
                    fontSize: "0.7rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    opacity: 0.6,
                    margin: "0 0 0.6rem 0",
                  } as React.CSSProperties}
                >
                  {source.label}
                </h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {source.articles!.map((article) => (
                    <li
                      key={article.link}
                      style={{
                        marginBottom: "0.6rem",
                        padding: "0.6rem 0.75rem",
                        backgroundColor: "rgba(0,0,0,0.2)",
                        borderRadius: "0.4rem",
                      }}
                    >
                      <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "inherit", textDecoration: "none", display: "block" }}
                      >
                        <div style={{ fontSize: "0.82rem", fontWeight: "bold", lineHeight: 1.4 }}>
                          {article.title}
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
