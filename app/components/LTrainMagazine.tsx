"use client";

import { useEffect, useState } from "react";

interface Article {
  title: string;
  link: string;
}

async function fetchArticles(): Promise<Article[]> {
  // Step 1: try rss2json as a convenience proxy
  console.log("[LTrainMagazine] fetching via rss2json...");
  try {
    const rss2jsonUrl = "https://api.rss2json.com/v1/api.json?rss_url=https://ltrainmag.com/feed/";
    const res = await fetch(rss2jsonUrl);
    console.log("[LTrainMagazine] rss2json HTTP", res.status);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    console.log("[LTrainMagazine] rss2json response:", JSON.stringify(json).slice(0, 300));
    if (json?.status === "ok" && json?.items?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return json.items.slice(0, 4).map((item: any) => ({
        title: item.title,
        link: item.link,
      }));
    }
    console.warn("[LTrainMagazine] rss2json returned no items, falling back to direct fetch");
  } catch (err) {
    console.error("[LTrainMagazine] rss2json exception:", err);
  }

  // Step 2: fetch the raw RSS XML directly and parse it
  console.log("[LTrainMagazine] fetching raw feed at https://ltrainmag.com/feed/...");
  try {
    const res = await fetch("https://ltrainmag.com/feed/");
    console.log("[LTrainMagazine] raw feed HTTP", res.status);
    const xml = await res.text();
    console.log("[LTrainMagazine] raw feed preview:", xml.slice(0, 300));
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const items = Array.from(doc.querySelectorAll("item")).slice(0, 4);
    console.log("[LTrainMagazine] parsed", items.length, "items from XML");
    return items.map((item) => ({
      title: item.querySelector("title")?.textContent ?? "(no title)",
      link:  item.querySelector("link")?.textContent ?? "#",
    }));
  } catch (err) {
    console.error("[LTrainMagazine] raw feed exception:", err);
  }

  return [];
}

interface Props {
  textColor: string;
}

export default function LTrainMagazine({ textColor }: Props) {
  const [articles, setArticles] = useState<Article[] | null>(null);

  useEffect(() => {
    fetchArticles()
      .then(setArticles)
      .catch(() => setArticles([]));
  }, []);

  if (articles === null) {
    return (
      <div style={{ marginTop: "3rem", width: "100%", maxWidth: "700px", opacity: 0.4, fontSize: "0.75rem", textAlign: "center" }}>
        Loading L Train Magazine…
      </div>
    );
  }

  if (articles.length === 0) return null;

  return (
    <div style={{ marginTop: "3rem", width: "100%", maxWidth: "700px", color: textColor }}>
      <h2
        style={{
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          opacity: 0.7,
          margin: "0 0 1rem 0",
        }}
      >
        L Train Magazine
      </h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {articles.map((article) => (
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
  );
}
