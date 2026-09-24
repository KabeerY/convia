import type { ProviderAdapter } from "../module-contract.js";

export interface PlaceQuery {
  query: string;
  destination?: string;
  radiusMeters?: number;
  language?: string;
}

export interface PlaceDetailsQuery {
  placeId: string;
  fields: string[];
}

export interface RouteQuery {
  placeIds: string[];
  mode: "walk" | "drive" | "transit";
  departureAt?: string;
}

export interface ProviderEvidence<T> {
  value: T;
  source: string;
  observedAt: string;
  attribution?: string;
}

export interface ProviderRegistry {
  searchPlaces: ProviderAdapter<PlaceQuery, ProviderEvidence<unknown>[]>;
  getPlaceDetails: ProviderAdapter<
    PlaceDetailsQuery,
    ProviderEvidence<unknown>
  >;
  estimateRoutes: ProviderAdapter<RouteQuery, ProviderEvidence<unknown>[]>;
}

// PR-11 supplies the adapters; PR-06 owns the scoped provider/tool dispatcher.
export const unavailableProviders: ProviderRegistry = {
  searchPlaces: {
    async execute() {
      throw new Error("PLACES_UNAVAILABLE");
    },
  },
  getPlaceDetails: {
    async execute() {
      throw new Error("PLACES_UNAVAILABLE");
    },
  },
  estimateRoutes: {
    async execute() {
      throw new Error("ROUTES_UNAVAILABLE");
    },
  },
};
