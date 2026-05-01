import { Sprout, Trees, Home, Globe2, type LucideIcon } from "lucide-react";

export type TierId = "patio" | "backyard" | "estate" | "territory" | "territory_trial";
export type AiTier = "none" | "standard" | "advanced" | "full";

export interface TierConfig {
  id: TierId;
  name: string;
  tagline: string;
  priceLabel: string; // e.g. "€5 / mo"
  vatNote: string;   // "+ VAT"
  maxTeams: number;  // 999 = unlimited
  maxTeamsLabel: string;
  aiTier: AiTier;
  features: string[];
  icon: LucideIcon;
  accent: string; // tailwind text color
  ring: string;   // tailwind ring color
  highlighted?: boolean;
}

export const TIERS: Record<Exclude<TierId, "territory_trial">, TierConfig> = {
  patio: {
    id: "patio",
    name: "Patio",
    tagline: "Free forever — for solo operators",
    priceLabel: "€0",
    vatNote: "Free forever",
    maxTeams: 0,
    maxTeamsLabel: "1 solo user, 0 teams",
    aiTier: "none",
    features: [
      "Basic CRM (customers, properties)",
      "Manual scheduling",
      "1 user seat",
      "No AI assistant",
    ],
    icon: Home,
    accent: "text-stone-700",
    ring: "ring-stone-200",
  },
  backyard: {
    id: "backyard",
    name: "Backyard",
    tagline: "For growing crews",
    priceLabel: "€5 / mo",
    vatNote: "+ VAT",
    maxTeams: 2,
    maxTeamsLabel: "Up to 2 teams",
    aiTier: "standard",
    features: [
      "Everything in Patio",
      "Up to 2 teams",
      "Standard AI Chatbot — task management",
      "Email notifications",
    ],
    icon: Sprout,
    accent: "text-emerald-700",
    ring: "ring-emerald-200",
  },
  estate: {
    id: "estate",
    name: "Estate",
    tagline: "For established service businesses",
    priceLabel: "€30 / mo",
    vatNote: "+ VAT",
    maxTeams: 5,
    maxTeamsLabel: "Up to 5 teams",
    aiTier: "advanced",
    features: [
      "Everything in Backyard",
      "Up to 5 teams",
      "Advanced AI Chatbot — scheduling logic",
      "Recurring contract automation",
      "Priority support",
    ],
    icon: Trees,
    accent: "text-emerald-800",
    ring: "ring-emerald-300",
    highlighted: true,
  },
  territory: {
    id: "territory",
    name: "Territory",
    tagline: "For multi-region operators",
    priceLabel: "€100 / mo",
    vatNote: "+ VAT",
    maxTeams: 999,
    maxTeamsLabel: "Unlimited teams",
    aiTier: "full",
    features: [
      "Everything in Estate",
      "Unlimited teams",
      "Full Power AI — business insights & automation",
      "Dedicated success manager",
      "Custom integrations",
    ],
    icon: Globe2,
    accent: "text-stone-900",
    ring: "ring-stone-800",
  },
};

export const TIER_ORDER: TierId[] = ["patio", "backyard", "estate", "territory"];

export function getTierConfig(tier?: string | null): TierConfig {
  if (!tier) return TIERS.patio;
  if (tier === "territory_trial") return TIERS.territory;
  return (TIERS as Record<string, TierConfig>)[tier] ?? TIERS.patio;
}

export function isTrial(tier?: string | null): boolean {
  return tier === "territory_trial";
}

export function daysLeftInTrial(trialExpiresAt?: string | null): number {
  if (!trialExpiresAt) return 0;
  const ms = new Date(trialExpiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function trialDayNumber(createdAt?: string | null, trialExpiresAt?: string | null): { day: number; total: number } | null {
  if (!createdAt || !trialExpiresAt) return null;
  const start = new Date(createdAt).getTime();
  const end = new Date(trialExpiresAt).getTime();
  const total = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  const elapsed = Math.max(0, Math.round((Date.now() - start) / (1000 * 60 * 60 * 24)));
  const day = Math.min(elapsed + 1, total);
  return { day, total };
}

export function canCreateTeam(maxTeams: number, currentCount: number): boolean {
  return currentCount < maxTeams;
}