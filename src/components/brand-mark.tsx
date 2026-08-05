import Image from "next/image";

// the 7° mark from the brand deck, cropped to the artwork and shipped as a
// small webp so the tablet is not dragging a print-size png around.
//
// the art is transparent: navy engraving on cream, white hatching on navy, so
// one file covers both themes. sizes are heights, since the mark sits on a
// line of text in the header and needs to match it rather than a box.
const HEIGHTS = {
  sm: "h-7",
  md: "h-9",
  lg: "h-12",
  xl: "h-16",
  hero: "h-24",
} as const;

export type BrandMarkSize = keyof typeof HEIGHTS;

export function BrandMark({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: BrandMarkSize;
}) {
  return (
    <Image
      src="/brand/logo.webp"
      alt="Seven Degrees"
      width={193}
      height={222}
      // it sits in the header of every screen, so it is always above the fold
      priority
      // plain static file, so the service worker can keep it for offline
      unoptimized
      className={`w-auto select-none ${HEIGHTS[size]} ${className}`}
    />
  );
}
