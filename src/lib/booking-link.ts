/** Providers return prices, not checkout URLs, so each leg links to a prefilled flight search. */
export function bookingLink(origin: string, destination: string, date: string, adults: number): string {
  const q = `One way flights from ${origin} to ${destination} on ${date} for ${adults} adult${adults === 1 ? "" : "s"}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}
