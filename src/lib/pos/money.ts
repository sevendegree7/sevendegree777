// money helpers for the pos
// all math runs on integer piastres so float drift never reaches a receipt.
// db columns are numeric(10,2) so we only convert at the edges.

export function toPiastres(amount: number): number {
  return Math.round(amount * 100);
}

export function toPounds(piastres: number): number {
  return piastres / 100;
}

// one display format for every price on screen
export function formatMoney(amount: number): string {
  return `${amount.toFixed(2)} EGP`;
}
