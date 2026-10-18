import { findAnyAirport } from "../airports";
import type { Airport } from "../airports";
import type { Offer } from "../providers/types";
import type { AirportSummary, DayPrice, OriginSummary } from "./search";

function usable(currency: string) {
  return (o: Offer) => o.currency === currency && Number.isFinite(o.price);
}

function cheapestBy(offers: Offer[], key: (o: Offer) => string): Map<string, number> {
  const best = new Map<string, number>();
  for (const o of offers) best.set(key(o), Math.min(best.get(key(o)) ?? Infinity, o.price));
  return best;
}

/** The city side of a leg is its destination outbound and its origin on the way back. */
export function airportSummaries(airports: Airport[], outbound: Offer[], inbound: Offer[], currency: string): AirportSummary[] {
  const outs = cheapestBy(outbound.filter(usable(currency)), (o) => o.destination);
  const ins = cheapestBy(inbound.filter(usable(currency)), (o) => o.origin);
  return airports.map((a) => {
    const cheapestOut = outs.get(a.iata);
    const cheapestIn = ins.get(a.iata);
    return {
      iata: a.iata,
      city: a.city,
      metro: a.metro,
      lat: a.lat,
      lon: a.lon,
      ...(cheapestOut === undefined ? {} : { cheapestOut }),
      ...(cheapestIn === undefined ? {} : { cheapestIn }),
    };
  });
}

export function originSummaries(origins: string[]): OriginSummary[] {
  return origins.map((iata) => {
    const a = findAnyAirport(iata);
    return a ? { iata, city: a.city, lat: a.lat, lon: a.lon } : { iata };
  });
}

export function outboundCalendar(outbound: Offer[], currency: string): DayPrice[] {
  return [...cheapestBy(outbound.filter(usable(currency)), (o) => o.date)]
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
