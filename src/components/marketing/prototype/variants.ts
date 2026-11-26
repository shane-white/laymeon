// PROTOTYPE (throwaway): the /prototype/landing variants.
import type { MapLayout } from "./guide-map";

export const VARIANTS = {
  B: { name: "Capsule comes off the ring", layout: "ring" },
  D: { name: "Capsule comes out of the dome", layout: "tunnel" },
} as const satisfies Record<string, { name: string; layout: MapLayout }>;

export type VariantKey = keyof typeof VARIANTS;
export const VARIANT_KEYS = Object.keys(VARIANTS) as VariantKey[];
