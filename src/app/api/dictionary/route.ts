import { NextResponse } from "next/server";
import { lookUpOffline } from "./offlineDictionary";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "No text provided." }, { status: 400 });
  }

  const definition = lookUpOffline(text);
  if (!definition) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ definition });
}
