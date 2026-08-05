import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the tablet tests against this machine over the wifi, not localhost, and
  // next refuses to hand dev assets to another origin unless it is listed.
  // without it the tablet gets html with no js: the login form falls back to a
  // plain browser submit and lands back on /login. dev only, prod is untouched.
  allowedDevOrigins: ["192.168.1.*", "192.168.0.*", "10.0.0.*"],

  async headers() {
    return [
      {
        // the worker itself must never come from a cache. a bad one that the
        // browser refuses to re-read would keep answering for the whole app.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
