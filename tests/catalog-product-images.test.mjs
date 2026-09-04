import assert from "node:assert/strict";
import test from "node:test";
import {
  CATALOG_PRODUCT_IMAGE_URLS,
  resolveCatalogProductImageUrl,
} from "../app/lib/catalog-product-images.ts";

const expectedProductIds = [
  "bone-1",
  "bone-2",
  "bonghwang",
  "jin",
  "la-1",
  "la-2",
  "mi",
  "omeat-prestige",
  "omeat-signature",
  "palyeong",
  "practical",
  "seon",
];

test("catalog v23 provides a web image for every seeded product", () => {
  assert.deepEqual(Object.keys(CATALOG_PRODUCT_IMAGE_URLS).sort(), expectedProductIds);
  for (const imageUrl of Object.values(CATALOG_PRODUCT_IMAGE_URLS)) {
    assert.match(imageUrl, /^\/products\/[a-z0-9-]+\.webp$/);
  }
});

test("O'meat products share the catalog's common product photo", () => {
  assert.equal(
    CATALOG_PRODUCT_IMAGE_URLS["omeat-signature"],
    CATALOG_PRODUCT_IMAGE_URLS["omeat-prestige"],
  );
});

test("a configured product image overrides the catalog fallback", () => {
  assert.equal(
    resolveCatalogProductImageUrl("palyeong", " https://cdn.example.com/palyeong.jpg "),
    "https://cdn.example.com/palyeong.jpg",
  );
  assert.equal(resolveCatalogProductImageUrl("palyeong", null), "/products/palyeong.webp");
  assert.equal(resolveCatalogProductImageUrl("palyeong", ""), null);
  assert.equal(resolveCatalogProductImageUrl("unknown", null), null);
});
