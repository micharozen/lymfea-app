/**
 * Resolves organization_id for a new hotel insert.
 * Super-admins must pick an org in the form; org-admins use their account org.
 */
export function resolveHotelOrganizationIdForInsert(opts: {
  isSuperAdmin: boolean;
  adminOrganizationId: string | null;
  formOrganizationId?: string | null;
}): string | null {
  if (opts.isSuperAdmin) {
    const id = opts.formOrganizationId?.trim();
    return id || null;
  }
  return opts.adminOrganizationId;
}

export const HOTEL_ORGANIZATION_ID_REQUIRED_ERROR =
  "organization_id is required for hotel creation";

export function requireHotelOrganizationIdForInsert(
  opts: Parameters<typeof resolveHotelOrganizationIdForInsert>[0],
): string {
  const id = resolveHotelOrganizationIdForInsert(opts);
  if (!id) {
    throw new Error(HOTEL_ORGANIZATION_ID_REQUIRED_ERROR);
  }
  return id;
}

export function isHotelOrganizationIdRequiredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === HOTEL_ORGANIZATION_ID_REQUIRED_ERROR
  );
}
