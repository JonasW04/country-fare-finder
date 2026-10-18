import type { Airport } from "@/lib/airports";
import type { Offer } from "@/lib/providers/types";

export function airport(iata: string, city: string, metro = iata, metroName = city): Airport {
  return { iata, name: `${city} Airport`, city, country: "IT", size: "large", metro, metroName, lat: 0, lon: 0 };
}

export function offer(origin: string, destination: string, date: string, price: number, extra: Partial<Offer> = {}): Offer {
  return { origin, destination, date, price, currency: "EUR", carriers: ["XX"], ...extra };
}
