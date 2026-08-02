import type { MetadataRoute } from "next";

// makes the tablet able to install this as an app.
//
// start_url is /pos, not /: "/" only ever redirects, so it has no page the
// service worker can keep. the kitchen screen is one tap away from there.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "seven degree pos",
    short_name: "7 pos",
    description: "bakery and food truck cloud pos",
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    background_color: "#f5f5f4",
    theme_color: "#292524",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
