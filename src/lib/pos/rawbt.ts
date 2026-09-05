import type { Receipt } from "./receipt";

// RawBT is the Android bridge between the PWA and an ESC/POS printer.
// The browser cannot open the printer's TCP port directly.
const RAWBT_PACKAGE = "ru.a402d.rawbtprinter";
const RECEIPT_COLUMNS = 48;
const ESC = 0x1b;
const GS = 0x1d;

// pulse both drawer pins. the xp-80t rj11 can be wired to pin 2 or pin 5,
// and 50ms was too short for this drawer - 120ms on is what the xprinter
// manual uses for a cash kick.
export const OPEN_DRAWER: readonly number[] = [
  ESC,
  0x70,
  0x00,
  0x3c,
  0x78,
  ESC,
  0x70,
  0x01,
  0x3c,
  0x78,
];
// ten lines is about the 35mm the blade sits past the head on this printer.
export const FEED: readonly number[] = [ESC, 0x64, 0x0a];
// full cut. the last commit used a partial cut (gs v 66), which leaves the
// two copies hanging on one strip.
export const CUT: readonly number[] = [GS, 0x56, 0x00];
export const FEED_AND_CUT: readonly number[] = [...FEED, ...CUT];

export function toBase64(bytes: readonly number[]): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte & 0xff);
  }

  return btoa(binary);
}

export function rawbtIntentUrl(bytes: readonly number[]): string {
  return `intent:base64,${toBase64(bytes)}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};end;`;
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/android/i.test(navigator.userAgent)) return true;

  // chrome "desktop site" drops android from the ua string
  const hints = (
    navigator as Navigator & {
      userAgentData?: { platform?: string };
    }
  ).userAgentData;
  return hints?.platform === "Android";
}

export function rawBtAvailable(): boolean {
  return isAndroid();
}

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function money(value: number): string {
  return `${Number(value).toFixed(2)} EGP`;
}

function padColumns(left: string, right: string): string {
  const safeLeft = clean(left);
  const safeRight = clean(right);
  const available = RECEIPT_COLUMNS - safeRight.length - 1;

  if (safeLeft.length <= available) {
    return (
      safeLeft +
      " ".repeat(RECEIPT_COLUMNS - safeLeft.length - safeRight.length) +
      safeRight
    );
  }

  return `${safeLeft.slice(0, Math.max(1, available - 1))}… ${safeRight}`;
}

function wrapped(text: string, width = RECEIPT_COLUMNS): string[] {
  const value = clean(text);
  if (!value) return [""];

  const lines: string[] = [];
  let line = "";
  for (const word of value.split(" ")) {
    if (!line) {
      line = word;
    } else if (line.length + word.length + 1 <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function addText(bytes: number[], text = ""): void {
  bytes.push(...utf8(text), 0x0a);
}

function addCentered(bytes: number[], text: string): void {
  bytes.push(ESC, 0x61, 0x01);
  addText(bytes, text);
  bytes.push(ESC, 0x61, 0x00);
}

function addReceiptCopy(
  bytes: number[],
  receipt: Receipt,
  variant: "customer" | "prep",
  copyNumber: number,
  totalCopies: number,
): void {
  const showPrices = variant === "customer";

  bytes.push(ESC, 0x61, 0x01, ESC, 0x45, 0x01);
  addText(bytes, "SEVEN | DEGREES");
  bytes.push(ESC, 0x45, 0x00);
  addCentered(
    bytes,
    showPrices ? "Cairo's cartographer of taste" : "PREPARATION COPY",
  );
  if (totalCopies > 1) {
    addCentered(bytes, showPrices ? "CUSTOMER COPY" : "KITCHEN COPY");
  }
  if (copyNumber > 1) addCentered(bytes, `COPY ${copyNumber}`);

  addText(bytes);
  addCentered(bytes, "--------------------------------");
  addCentered(bytes, "ORDER");
  bytes.push(ESC, 0x21, 0x30, ESC, 0x45, 0x01);
  addCentered(bytes, receipt.ticket);
  bytes.push(ESC, 0x21, 0x00, ESC, 0x45, 0x00);
  addCentered(bytes, "--------------------------------");

  addText(bytes, padColumns("Time", receipt.takenAt));
  addText(bytes, padColumns("Type", receipt.orderType.replace("_", " ")));
  if (showPrices) addText(bytes, padColumns("Payment", receipt.paymentMethod ?? "-"));
  if (receipt.cashier) addText(bytes, padColumns("Cashier", receipt.cashier));
  if (receipt.customerName) addText(bytes, padColumns("Customer", receipt.customerName));
  if (receipt.customerPhone) addText(bytes, padColumns("Phone", receipt.customerPhone));
  if (receipt.replaces) addText(bytes, `Replaces #${receipt.replaces} (cancelled)`);

  addText(bytes);
  addText(bytes, "-".repeat(RECEIPT_COLUMNS));
  for (const line of receipt.lines) {
    const itemLines = wrapped(`${line.quantity} x ${line.name}`, 32);
    addText(
      bytes,
      showPrices ? padColumns(itemLines[0], money(line.lineTotal)) : itemLines[0],
    );
    for (const itemLine of itemLines.slice(1)) addText(bytes, `  ${itemLine}`);
    if (line.boxContents.length > 0) {
      for (const content of wrapped(`  ${line.boxContents.join(", ")}`)) {
        addText(bytes, content);
      }
    }
    if (line.extras.length > 0) {
      for (const extra of wrapped(`  + ${line.extras.join(", ")}`)) {
        addText(bytes, extra);
      }
    }
    if (line.notes) {
      for (const note of wrapped(`  Note: ${line.notes}`)) addText(bytes, note);
    }
  }

  if (showPrices) {
    addText(bytes, "-".repeat(RECEIPT_COLUMNS));
    if (receipt.tax) {
      addText(bytes, padColumns("Subtotal", money(receipt.tax.subtotal)));
      addText(
        bytes,
        padColumns(`${receipt.tax.label} ${receipt.tax.rate}%`, money(receipt.tax.amount)),
      );
    }
    if (receipt.discountAmount) {
      addText(bytes, padColumns("Discount", `- ${money(receipt.discountAmount)}`));
    }
    if (receipt.isDiyafa) {
      addCentered(bytes, `Diyafa${receipt.diyafaReason ? ` - ${receipt.diyafaReason}` : ""}`);
    }
    bytes.push(ESC, 0x45, 0x01);
    addText(bytes, padColumns("TOTAL", money(receipt.total)));
    bytes.push(ESC, 0x45, 0x00);
    addCentered(bytes, "Thank you");
  } else if (receipt.isDiyafa) {
    addCentered(bytes, `Diyafa${receipt.diyafaReason ? ` - ${receipt.diyafaReason}` : ""}`);
  }

  addText(bytes);
  // re-init after a full cut so the second copy starts a new ticket, not a
  // continuation of the first job that some firmware will not slice.
  bytes.push(...FEED_AND_CUT, ESC, 0x40);
}

export function receiptEscPos(receipt: Receipt, copies = 2): Uint8Array {
  const safeCopies = Number.isFinite(copies)
    ? Math.max(1, Math.min(3, Math.floor(copies)))
    : 1;
  const bytes = [ESC, 0x40];

  for (let copy = 0; copy < safeCopies; copy += 1) {
    addReceiptCopy(
      bytes,
      receipt,
      copy === 0 ? "customer" : "prep",
      copy + 1,
      safeCopies,
    );
  }

  return Uint8Array.from(bytes);
}

function send(bytes: readonly number[]): boolean {
  if (typeof document === "undefined" || !rawBtAvailable()) return false;

  // chrome will not follow a custom scheme from location.href in a pwa.
  // a real tap on an <a> is the gesture it accepts - same as the test
  // links on /admin/settings.
  const link = document.createElement("a");
  link.href = rawbtIntentUrl(bytes);
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

export function printReceiptToRawBt(
  receipt: Receipt,
  copies = 2,
  openDrawer = false,
): boolean {
  const receiptBytes = Array.from(receiptEscPos(receipt, copies));
  return send(openDrawer ? [...OPEN_DRAWER, ...receiptBytes] : receiptBytes);
}

export function openCashDrawer(): boolean {
  return send([...OPEN_DRAWER]);
}
