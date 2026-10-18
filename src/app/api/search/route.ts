import { NextResponse } from "next/server";
import { parseSearchRequest } from "@/lib/search-request";
import { searchWithDefaults } from "@/lib/server/runtime";

export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);

async function handle(raw: Record<string, unknown>): Promise<NextResponse> {
  const parsed = parseSearchRequest(raw, today());
  if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });
  try {
    return NextResponse.json(await searchWithDefaults(parsed.request));
  } catch {
    // Deliberately generic: provider errors never go to the client unfiltered.
    return NextResponse.json({ errors: ["Search failed. Check the server logs."] }, { status: 502 });
  }
}

export function GET(request: Request): Promise<NextResponse> {
  return handle(Object.fromEntries(new URL(request.url).searchParams));
}

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ errors: ["Body must be a JSON object"] }, { status: 400 });
  }
  return handle(body as Record<string, unknown>);
}
