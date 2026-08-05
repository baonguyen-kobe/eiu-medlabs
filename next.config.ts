import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/equipment-requests/[requestId]/handover": [
      "./node_modules/@expo-google-fonts/be-vietnam-pro/400Regular/BeVietnamPro_400Regular.ttf",
      "./node_modules/@expo-google-fonts/be-vietnam-pro/700Bold/BeVietnamPro_700Bold.ttf",
      "./public/eiu-full-logo.jpg",
    ],
  },
};

export default nextConfig;
