"use client";

// Reddit's public JSON API now returns 403 for unauthenticated requests (since
// their 2023 API changes). This component was rewritten to use RSS feeds from
// transit and Brooklyn-focused publications instead.

import { useEffect, useState } from "react";

interface Article {
  title: string;
  link: string;
}

interface Source {
  label: string;
  articles: Article[] | null; // null = loading
}

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (json.items ?? []) as { title: string; link: string; description?: string }[];
    const filtered = filter
      ? items.filter((item) => filter.test(item.title) || filter.test(item.description ?? ""))
      : items;
    return filtered.slice(0, 4).map((item) => ({ title: item.title, link: item.link }));
  } catch {
    return [];
  }
}

interface Props {
  textColor: string;
}

export default function RedditSection({ textColor }: Props) {
  const [sources, setSources] = useState<Source[]>([
    { label: "Streetsblog NYC", articles: null },
    { label: "Gothamist",       articles: null },
    { label: "Brooklyn Paper",  articles: null },
  ]);

  useEffect(() => {
    // Streetsblog is all transit — show top articles without filtering
    fetchRss("https://nyc.streetsblog.org/feed")
      .then((articles) => setSources((prev) => prev.map((s, i) => i === 0 ? { ...s, articles } : s)))
      .catch(()         => setSources((prev) => prev.map((s, i) => i === 0 ? { ...s, articles: [] } : s)));

    // Gothamist and Brooklyn Paper — filter for L train / transit / neighborhood keywords
    fetchRss("https://gothamist.com/feed", L_TRAIN_RE)
      .then((articles) => setSources((prev) => prev.map((s, i) => i === 1 ? { ...s, articles } : s)))
      .catch(()         => setSources((prev) => prev.map((s, i) => i === 1 ? { ...s, articles: [] } : s)));

    fetchRss("https://brooklynpaper.com/feed/", L_TRAIN_RE)
      .then((articles) => setSources((prev) => prev.map((s, i) => i === 2 ? { ...s, articles } : s)))
      .catch(()         => setSources((prev) => prev.map((s, i) => i === 2 ? { ...s, articles: [] } : s)));
  }, []);

  const allLoaded     = sources.every((s) => s.articles !== null);
  const visibleSources = sources.filter((s) => s.articles && s.articles.length > 0);

  if (!allLoaded && visibleSources.length === 0) {
    return (
      <div style={{ marginTop: "3rem", width: "100%", maxWidth: "700px", opacity: 0.4, fontSize: "0.75rem", textAlign: "center" }}>
        Loading neighborhood news…
      </div>
    );
  }

  if (allLoaded && visibleSources.length === 0) return null;

  return (
    <div style={{ marginTop: "3rem", width: "100%", maxWidth: "700px", color: textColor }}>
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
        {visibleSources.map((source) => (
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
  );
}
