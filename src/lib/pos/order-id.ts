// the offline sync worker uploads a sale under the id the tablet already gave
// it, so the ticket number the kitchen is reading does not change when the
// internet comes back. that makes this the one value the browser is trusted to
// choose, and it is checked before it goes anywhere near an insert.
//
// this lives outside the server action because a "use server" file can only
// export async functions, and a guard that cannot be unit tested is not much
// of a guard.
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidOrderId(value: string): boolean {
  return UUID.test(value);
}
