import type { MappingConfig } from "./types";

/**
 * Institution presets. Status: UNVERIFIED — built from typical export layouts, not from real
 * sample files (docs/UNVERIFIED.md #7). A preset only sets defaults; header auto-detection
 * still runs and the advisor confirms the mapping in the wizard before anything is saved.
 */
export type Institution = "LEUMI" | "HAPOALIM" | "DISCOUNT" | "MIZRAHI_TEFAHOT" | "ISRACARD" | "CAL" | "MAX" | "OTHER";

export type Preset = {
  institution: Institution;
  kind: "BANK_ACCOUNT" | "CREDIT_CARD";
  verified: false;
  defaults: Partial<MappingConfig>;
};

const bankSkip = ["יתרה קודמת", "יתרת פתיחה", "סה\"כ", "סה״כ"];
const cardSkip = ["סה\"כ", "סה״כ", "סך הכל", "עסקאות בחו\"ל", "עסקאות בארץ"];

export const PRESETS: Record<Exclude<Institution, "OTHER">, Preset> = {
  LEUMI: { institution: "LEUMI", kind: "BANK_ACCOUNT", verified: false, defaults: { skipDescriptionsContaining: bankSkip } },
  HAPOALIM: { institution: "HAPOALIM", kind: "BANK_ACCOUNT", verified: false, defaults: { skipDescriptionsContaining: bankSkip } },
  DISCOUNT: { institution: "DISCOUNT", kind: "BANK_ACCOUNT", verified: false, defaults: { skipDescriptionsContaining: bankSkip } },
  MIZRAHI_TEFAHOT: { institution: "MIZRAHI_TEFAHOT", kind: "BANK_ACCOUNT", verified: false, defaults: { skipDescriptionsContaining: bankSkip } },
  ISRACARD: { institution: "ISRACARD", kind: "CREDIT_CARD", verified: false, defaults: { skipDescriptionsContaining: cardSkip } },
  CAL: { institution: "CAL", kind: "CREDIT_CARD", verified: false, defaults: { skipDescriptionsContaining: cardSkip } },
  MAX: { institution: "MAX", kind: "CREDIT_CARD", verified: false, defaults: { skipDescriptionsContaining: cardSkip } },
};
