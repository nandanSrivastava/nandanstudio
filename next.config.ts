import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cross-origin isolation enables SharedArrayBuffer, which lets the @imgly/background-removal
  // WASM model run multi-threaded (much faster) instead of falling back to a single thread.
  // We use COEP "credentialless" (not "require-corp") so cross-origin model assets still load,
  // and the app has no other cross-origin resources. Browsers without support simply stay
  // single-threaded with no errors.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
