import Image from "next/image";

// real 7° artwork from the brand deck. files live under /brand and in the
// app icons — keep them small so the tablet does not drag a 2mb png around.

const SIZES = {
  sm: { width: 44, height: 29 },
  md: { width: 56, height: 37 },
  lg: { width: 80, height: 53 },
  xl: { width: 112, height: 75 },
  hero: { width: 160, height: 107 },
} as const;

export type BrandMarkSize = keyof typeof SIZES;

export function BrandMark({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: BrandMarkSize;
}) {
  const dims = SIZES[size];

  return (
    <Image
      src="/brand/logo.webp"
      alt="Seven Degrees"
      width={dims.width}
      height={dims.height}
      priority={size === "hero" || size === "xl"}
      className={`block h-auto w-auto select-none ${className}`}
      // plain static file so the service worker can keep it offline
      unoptimized
    />
  );
}
