import type { Offer } from "./providers/types";

export interface LinkContext {
  adults: number;
  cabin: string;
  currency: string;
}

// Google Flights reads a search from the `tfs` parameter, a base64url protobuf. A plain-text `q=`
// query only parses when Google's UI language is English, so it opened an empty page for others.
const SEAT: Record<string, number> = { ECONOMY: 1, PREMIUM_ECONOMY: 2, BUSINESS: 3, FIRST: 4 };
const ECONOMY = 1;
const ONE_WAY = 2;
const ADULT = 1;
const AIRPORT = 1;

function varint(n: number): number[] {
  const out: number[] = [];
  while (n > 127) {
    out.push((n & 127) | 128);
    n >>>= 7;
  }
  out.push(n);
  return out;
}

const field = (num: number, wire: number) => varint((num << 3) | wire);
const bytesField = (num: number, bytes: number[]) => [...field(num, 2), ...varint(bytes.length), ...bytes];
const textField = (num: number, text: string) => bytesField(num, [...new TextEncoder().encode(text)]);
const intField = (num: number, value: number) => [...field(num, 0), ...varint(value)];

function base64Url(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The `tfs` value for a one-way search, in the layout Google Flights writes into its own URLs. */
export function googleFlightsTfs(origin: string, destination: string, date: string, adults: number, cabin: string): string {
  const airport = (code: string) => [...intField(1, AIRPORT), ...textField(2, code)];
  const leg = [...textField(2, date), ...bytesField(13, airport(origin)), ...bytesField(14, airport(destination))];
  const message = [
    ...intField(1, 28),
    ...intField(2, 2),
    ...bytesField(3, leg),
    ...Array.from({ length: adults }, () => intField(8, ADULT)).flat(),
    ...intField(9, SEAT[cabin.toUpperCase()] ?? ECONOMY),
    ...intField(19, ONE_WAY),
  ];
  return base64Url(message);
}

export function googleFlightsLink(offer: Pick<Offer, "origin" | "destination" | "date">, ctx: LinkContext): string {
  const params = new URLSearchParams({
    tfs: googleFlightsTfs(offer.origin, offer.destination, offer.date, ctx.adults, ctx.cabin),
    curr: ctx.currency,
  });
  return `https://www.google.com/travel/flights/search?${params}`;
}

/** Opens Ryanair's own flight picker on the leg's route and date, where the fare came from. */
export function ryanairLink(offer: Pick<Offer, "origin" | "destination" | "date">, adults: number): string {
  const params = new URLSearchParams({
    adults: String(adults),
    teens: "0",
    children: "0",
    infants: "0",
    dateOut: offer.date,
    isConnectedFlight: "false",
    isReturn: "false",
    discount: "0",
    originIata: offer.origin,
    destinationIata: offer.destination,
  });
  return `https://www.ryanair.com/gb/en/trip/flights/select?${params}`;
}

/** Providers return prices, not checkout URLs, so each leg links to a prefilled search for that exact flight day. */
export function bookingLink(offer: Pick<Offer, "origin" | "destination" | "date">, ctx: LinkContext, provider: string): string {
  return provider === "ryanair" ? ryanairLink(offer, ctx.adults) : googleFlightsLink(offer, ctx);
}
