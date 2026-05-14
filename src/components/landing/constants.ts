import { brand } from "@/config/brand";

export const BRAND_NAME = brand.name;
export const BRAND_EMAIL = brand.legal.contactEmail;
export const BRAND_DEMO_CTA = `mailto:${BRAND_EMAIL}?subject=Demo%20${encodeURIComponent(BRAND_NAME)}`;
