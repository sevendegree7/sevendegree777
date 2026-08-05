"use client";

import { useEffect } from "react";

// freezes the page behind an open modal.
//
// on the tablet the browser grows and shrinks its own top bar as the page
// scrolls, and a drag inside a popup was scrolling the till behind it, which
// pulled the popup's first row up underneath that bar. locking the body means
// the only thing that can scroll is the popup itself.
export function useScrollLock() {
  useEffect(() => {
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;

    // a mouse machine loses its scrollbar when overflow goes hidden, and the
    // whole layout jumps sideways by its width. pad that width back on.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";

    if (scrollbar > 0) {
      body.style.paddingRight = `${scrollbar}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, []);
}
