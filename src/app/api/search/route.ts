import { NextResponse } from "next/server";
import { SEARCH_STREAM_TYPE } from "@/lib/search-events";
import { parseSearchRequest } from "@/lib/search-request";
import { searchWithDefaults } from "@/lib/server/runtime";
import { SEARCH_FAILED, searchEventStream } from "@/lib/server/search-stream";

export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);

async function handle(raw: Record<string, unknown>, accept: string | null): Promise<Response> {
  const parsed = parseSearchRequest(raw, today());
  if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });
  if (accept?.includes(SEARCH_STREAM_TYPE)) {
    const stream = searchEventStream((onProgress) => searchWithDefaults(parsed.request, onProgress));
    return new Response(stream, {
      // no-transform keeps compression from buffering the stream until it ends.
      headers: { "Content-Type": `${SEARCH_STREAM_TYPE}; charset=utf-8`, "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
    });
  }
  try {
    return NextResponse.json(await searchWithDefaults(parsed.request));
  } catch {
    return NextResponse.json({ errors: [SEARCH_FAILED] }, { status: 502 });
  }
}

export function GET(request: Request): Promise<Response> {
  return handle(Object.fromEntries(new URL(request.url).searchParams), request.headers.get("accept"));
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ errors: ["Body must be a JSON object"] }, { status: 400 });
  }
  return handle(body as Record<string, unknown>, request.headers.get("accept"));
}
