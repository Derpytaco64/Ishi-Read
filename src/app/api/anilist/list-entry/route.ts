import { NextResponse } from "next/server";

import { requireAniListAccess } from "@/next-lib/anilist/serverAuth";
import { anilistGraphQL, AniListAuthError, AniListApiError } from "@/next-lib/anilist/client";

export const runtime = "nodejs";

interface FuzzyDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

interface MediaListEntry {
  id: number;
  status: string;
  score: number;
  progress: number;
  repeat: number;
  startedAt: FuzzyDate;
  completedAt: FuzzyDate;
}

interface MediaEntryResponse {
  Media: {
    id: number;
    chapters: number | null;
    title: { romaji: string | null; english: string | null };
    coverImage: { medium: string | null };
    mediaListEntry: MediaListEntry | null;
  };
}

// CLAUDE-ADDED: mediaListEntry on Media resolves to the *authenticated* viewer's own entry (or null
// if they haven't added it to their list yet) -- no need to separately pass a userId, which sidesteps
// having to keep this route's caller honest about whose entry it's asking for.
const GET_QUERY = `
  query ($mediaId: Int) {
    Media(id: $mediaId, type: MANGA) {
      id
      chapters
      title { romaji english }
      coverImage { medium }
      mediaListEntry {
        id
        status
        score
        progress
        repeat
        startedAt { year month day }
        completedAt { year month day }
      }
    }
  }
`;

const SAVE_MUTATION = `
  mutation (
    $mediaId: Int, $status: MediaListStatus, $score: Float, $progress: Int, $repeat: Int,
    $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput
  ) {
    SaveMediaListEntry(
      mediaId: $mediaId, status: $status, score: $score, progress: $progress, repeat: $repeat,
      startedAt: $startedAt, completedAt: $completedAt
    ) {
      id
      status
      score
      progress
      repeat
      startedAt { year month day }
      completedAt { year month day }
    }
  }
`;

export async function GET(request: Request) {
  const access = await requireAniListAccess();
  if (access instanceof NextResponse) return access;

  const mediaIdParam = new URL(request.url).searchParams.get("mediaId");
  const mediaId = mediaIdParam ? Number(mediaIdParam) : NaN;
  if (!Number.isInteger(mediaId)) {
    return NextResponse.json({ error: "A numeric mediaId is required" }, { status: 400 });
  }

  try {
    const data = await anilistGraphQL<MediaEntryResponse>(GET_QUERY, { mediaId }, access.accessToken);
    return NextResponse.json({ media: data.Media });
  } catch (err) {
    if (err instanceof AniListAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AniListApiError) return NextResponse.json({ error: err.message }, { status: 502 });
    return NextResponse.json({ error: "Failed to load AniList entry" }, { status: 500 });
  }
}

// CLAUDE-ADDED: Only the fields actually present in the request body are forwarded as GraphQL
// variables -- an omitted key means "don't touch this field" (Android sends only what changed in
// its pending outbox patch), while an explicitly-present `null` (e.g. clearing completedAt when a
// re-read starts) is passed through as a real null rather than being dropped.
const PATCHABLE_FIELDS = ["status", "score", "progress", "repeat", "startedAt", "completedAt"] as const;

export async function POST(request: Request) {
  const access = await requireAniListAccess();
  if (access instanceof NextResponse) return access;

  const body = await request.json().catch(() => null);
  const mediaId = Number(body?.mediaId);
  if (!Number.isInteger(mediaId)) {
    return NextResponse.json({ error: "A numeric mediaId is required" }, { status: 400 });
  }

  const variables: Record<string, unknown> = { mediaId };
  for (const field of PATCHABLE_FIELDS) {
    if (body && Object.prototype.hasOwnProperty.call(body, field)) {
      variables[field] = body[field];
    }
  }

  try {
    const data = await anilistGraphQL<{ SaveMediaListEntry: MediaListEntry }>(SAVE_MUTATION, variables, access.accessToken);
    return NextResponse.json({ entry: data.SaveMediaListEntry });
  } catch (err) {
    if (err instanceof AniListAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AniListApiError) return NextResponse.json({ error: err.message }, { status: 502 });
    return NextResponse.json({ error: "Failed to save AniList progress" }, { status: 500 });
  }
}
