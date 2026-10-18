import { NextResponse } from "next/server";
import { searchOrigins } from "@/lib/airports";

// Origin lookup for the search form. One character matches half the world, so it returns nothing.
export function GET(request: Request): NextResponse {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json(q.trim().length < 2 ? [] : searchOrigins(q, 8));
}
