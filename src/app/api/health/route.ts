import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";
import { getProviderSelection } from "@/lib/server/provider-select";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  const selection = getProviderSelection();
  return NextResponse.json({
    status: "ok",
    provider: selection.provider.name,
    requestedProvider: selection.requested,
    version: packageJson.version,
    credentialsPresent: selection.credentialsPresent,
  });
}
