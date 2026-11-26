// PROTOTYPE (throwaway): landing page options for feedback, at ?variant=B or ?variant=D.
import type { Metadata } from "next";
import { Landing } from "@/components/marketing/prototype/landing";
import { VARIANT_KEYS, type VariantKey } from "@/components/marketing/prototype/variants";
import { BRAND_NAME } from "@/components/marketing/wordmark";

export const metadata: Metadata = {
  title: `${BRAND_NAME}: landing page prototype`,
  robots: { index: false, follow: false },
};

export default async function LandingPrototype({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  const { variant } = await searchParams;
  const key = (VARIANT_KEYS as string[]).includes(variant ?? "") ? (variant as VariantKey) : "B";
  return <Landing key={key} variant={key} />;
}
