import { NextResponse } from "next/server";

import { requireAniListAccess } from "@/next-lib/anilist/serverAuth";
import { anilistGraphQL, AniListAuthError, AniListApiError } from "@/next-lib/anilist/client";

export const runtime = "nodejs";

interface SearchResponse {
  Page: {
    media: {
      id: number;
      title: { romaji: string | null; english: string | null };
      coverImage: { medium: string | null };
      format: string | null;
      chapters: number | null;
    }[];
  };
}

// CLAUDE-ADDED: format_in: [MANGA, ONE_SHOT] -- deliberately excludes NOVEL. This app's AniList
// sync only covers manga/CBZ for now (see manga_cbz_support), so light-novel entries would just be
// confusing, unlinkable noise in the picker.
const SEARCH_QUERY = `
  query ($search: String) {
    Page(page: 1, perPage: 15) {
      media(search: $search, type: MANGA, format_in: [MANGA, ONE_SHOT]) {
        id
        title { romaji english }
        coverImage { medium }
        format
        chapters
      }
    }
  }
`;

export async function GET(request: Request) {
  const access = await requireAniListAccess();
  if (access instanceof NextResponse) return access;

  const query = new URL(request.url).searchParams.get("query");
  if (!query || query.trim() === "") {
    return NextResponse.json({ error: "A search query is required" }, { status: 400 });
  }

  try {
    const data = await anilistGraphQL<SearchResponse>(SEARCH_QUERY, { search: query.trim() }, access.accessToken);
    return NextResponse.json({ results: data.Page.media });
  } catch (err) {
    if (err instanceof AniListAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AniListApiError) return NextResponse.json({ error: err.message }, { status: 502 });
    return NextResponse.json({ error: "AniList search failed" }, { status: 500 });
  }
}
