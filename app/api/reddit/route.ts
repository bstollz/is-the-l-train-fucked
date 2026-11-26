// app/api/reddit/route.ts
//
// Server-side proxy for Reddit search results.
// Reddit's JSON API blocks unauthenticated browser requests (403), but allows
// server-to-server requests with a descriptive User-Agent. This route runs on
// the server, so it can set that header and pass the results to the client.
//
// Endpoint: GET /api/reddit
// Returns: { posts: RedditPost[] }

import { NextResponse } from "next/server";

interface RedditPost {
  title: string;
  url: string;
  subreddit: string;
  score: number;
  numComments: number;
  createdUtc: number;
}

export async function GET() {
  try {
    // Search Reddit for recent L train mentions across all subreddits.
    // t=month gives us a rolling window; sort=new surfaces the freshest posts.
    const res = await fetch(
      "https://www.reddit.com/search.json?q=%22l+train%22&sort=new&limit=20&t=month",
      {
        headers: {
          // Reddit requires a descriptive User-Agent for API access.
          // Format: <app>/<version> (by /u/<author> or <contact>)
          "User-Agent": "is-the-l-train-fucked/1.0 (https://ltrain.wtf)",
          Accept: "application/json",
        },
        // Cache this response for 5 minutes on the server.
        next: { revalidate: 300 },
      }
    );

    if (!res.ok) {
      console.error(`[Reddit] API returned ${res.status} ${res.statusText}`);
      return NextResponse.json({ posts: [] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posts: RedditPost[] = (data?.data?.children ?? []).map((child: any) => ({
      title:      child.data.title,
      url:        `https://www.reddit.com${child.data.permalink}`,
      subreddit:  child.data.subreddit_name_prefixed,
      score:      child.data.score,
      numComments: child.data.num_comments,
      createdUtc: child.data.created_utc,
    }));

    return NextResponse.json({ posts });
  } catch (err) {
    console.error("[Reddit] fetch error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ posts: [] });
  }
}
