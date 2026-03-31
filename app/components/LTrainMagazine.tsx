"use client";

import { useEffect, useState } from "react";

interface Article {
  title: string;
  link: string;
}

interface Source {
  label: string;
  articles: Article[] | null; // null = loading
}

const BK_RE = /bushwick|williamsburg|ridgewood|l[\s-]train/i;

async function fetchRss2json(url: string): Promise<{ title: string; description: string; link: string }[]> {
  const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`);
  if (!res.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any;
  if (json?.status !== "ok") return [];
  return json.items ?? [];
}

async function fetchBkMag(): Promise<Article[]> {
  const items = await fetchRss2json("https://www.bkmag.com/feed/");
  return items
    .filter((item) => BK_RE.test(item.title) || BK_RE.test(item.description ?? ""))
    .slice(0, 3)
    .map((item) => ({ title: item.title, link: item.link }));
}

async function fetchBushwickDaily(): Promise<Article[]> {
  const items = await fetchRss2json("https://bushwickdaily.com/feed/");
  return items.slice(0, 3).map((item) => ({ title: item.title, link: item.link }));
}

interface Props {
  textColor: string;
}

export default function LTrainMagazine({ textColor }: Props) {
  const [sources, setSources] = useState<Source[]>([
    { label: "Brooklyn Magazine", articles: null },
    { label: "Bushwick Daily",    articles: null },
  ]);

  useEffect(() => {
    fetchBkMag()
      .then((articles) => setSources((prev) => prev.map((s, i) => i === 0 ? { ...s, articles } : s)))
      .catch(()         => setSources((prev) => prev.map((s, i) => i === 0 ? { ...s, articles: [] } : s)));

    fetchBushwickDaily()
      .then((articles) => setSources((prev) => prev.map((s, i) => i === 1 ? { ...s, articles } : s)))
      .catch(()         => setSources((prev) => prev.map((s, i) => i === 1 ? { ...s, articles: [] } : s)));
  }, []);

  const visibleSources = sources.filter((s) => s.articles && s.articles.length > 0);
  if (visibleSources.length === 0) return null;

  return (
    <div style={{ marginTop: "3rem", width: "100%", maxWidth: "700px", color: textColor }}>
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
              }}
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
