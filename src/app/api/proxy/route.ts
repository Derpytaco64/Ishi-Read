import { NextResponse } from "next/server";

export const runtime = "edge";

const isBlockedHost = (hostname: string): boolean => {
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json({ error: "url parameter is required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only http/https URLs are allowed" }, { status: 400 });
  }

  if (isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: "Blocked host" }, { status: 403 });
  }

  try {
    const upstream = await fetch(targetUrl);

    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream returned ${ upstream.status }` }, { status: upstream.status });
    }

    // CLAUDE-ADDED: Buffer the full body instead of piping upstream.body straight through, so a
    // connection drop mid-transfer throws here (caught below, returned as an uncached 502) rather
    // than reaching the client as a 200 with a truncated body. Streaming it through directly let a
    // single interrupted fetch still get the Cache-Control header below, which the browser then
    // treated as a valid complete response and kept replaying -- indefinitely, and for that exact
    // URL only -- even after the underlying book file was replaced. That's what caused a cover to
    // render as "correct at the top, grey for the rest" from then on.
    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch resource" }, { status: 502 });
  }
}
