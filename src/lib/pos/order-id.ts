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

// the id the tablet gives a sale, kept next to the guard that has to accept it.
//
// crypto.randomUUID is only defined in a secure context, so on a tablet opened
// over the local network by ip address it is simply missing and the till used
// to die on the first render. getRandomValues has no such restriction, so the
// fallback is still real randomness rather than a guess.
export function newOrderId(): string {
  const source = globalThis.crypto;

  if (typeof source?.randomUUID === "function") {
    return source.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (typeof source?.getRandomValues === "function") {
    source.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  // version 4, variant 1, so the result is the same shape postgres expects
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
