import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bonnetje",
    short_name: "Bonnetje",
    description: "Receipts to invoices for tradespeople.",
    start_url: "/",
    display: "standalone",
    theme_color: "#C2410C",
    background_color: "#EEF0F2",
  };
}
