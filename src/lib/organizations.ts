export const LYMFEA_DEFAULT_ORGANIZATION_ID = "a0000000-0000-0000-0000-000000000001";

export function resolveDefaultOrganizationId(ctx: {
  isSuperAdmin: boolean;
  organizationId: string | null;
  activeOrganizationId: string | null;
}): string {
  if (!ctx.isSuperAdmin && ctx.organizationId) return ctx.organizationId;
  if (ctx.activeOrganizationId) return ctx.activeOrganizationId;
  return LYMFEA_DEFAULT_ORGANIZATION_ID;
}
