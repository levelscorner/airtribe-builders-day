export interface CreditPack {
  id: string;
  label: string;
  credits: number;
  amountInr: number;
}

/**
 * Demo pack list. 1 credit = $0.01. Prices are placeholders until a booth
 * card names them. Amounts are rupees; Pine Labs UAT is sent paise.
 */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "starter", label: "Starter", credits: 500, amountInr: 499 },
  { id: "creator", label: "Creator", credits: 1200, amountInr: 999 },
  { id: "studio", label: "Studio", credits: 3500, amountInr: 2499 },
];

export function findPack(packId: string): CreditPack | undefined {
  return CREDIT_PACKS.find((pack) => pack.id === packId);
}

export function inrToPaise(amountInr: number): number {
  return amountInr * 100;
}
