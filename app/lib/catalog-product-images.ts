export const CATALOG_PRODUCT_IMAGE_URLS: Readonly<Record<string, string>> = Object.freeze({
  practical: "/products/practical.webp",
  bonghwang: "/products/bonghwang.webp",
  palyeong: "/products/palyeong.webp",
  mi: "/products/premium-mi.webp",
  seon: "/products/premium-seon.webp",
  jin: "/products/premium-jin.webp",
  "omeat-signature": "/products/omeat.webp",
  "omeat-prestige": "/products/omeat.webp",
  "la-1": "/products/la-1.webp",
  "la-2": "/products/la-2.webp",
  "bone-1": "/products/bone-1.webp",
  "bone-2": "/products/bone-2.webp",
});

export function resolveCatalogProductImageUrl(
  productId: string,
  configuredImageUrl: string | null | undefined,
) {
  if (configuredImageUrl === "") return null;
  const configuredUrl = configuredImageUrl?.trim();
  return configuredUrl || CATALOG_PRODUCT_IMAGE_URLS[productId] || null;
}
