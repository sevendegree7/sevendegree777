// the 7° mark.
//
// this is the typographic stand-in, not the real thing. the brand book draws
// the seven as an engraved numeral with horizontal hatching inside it, and that
// artwork only exists as flat bitmaps in the deck - it needs to come from the
// designer as an svg before this is replaced. the two rules that are cheap to
// honour are honoured here: navy on cream, and saffron on the degree only.
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      // read as one word by a screen reader instead of "seven degrees symbol"
      role="img"
      aria-label="seven degrees"
      className={`font-display font-black leading-none tracking-tight ${className}`}
    >
      7<span className="text-accent">°</span>
    </span>
  );
}
