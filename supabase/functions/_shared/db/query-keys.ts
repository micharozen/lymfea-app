// Query key factories for TanStack Query. Frontend-only consumer; Deno
// edge functions ignore this file. Keys are prefixed with the org scope so
// switching active organization invalidates the right slice of the cache.

type ScopeLike = { organizationId?: string; allOrganizations?: boolean } | null;

function orgKey(scope: ScopeLike): string {
  if (!scope) return "__pending__";
  if ("allOrganizations" in scope && scope.allOrganizations) return "__all__";
  return (scope as { organizationId?: string }).organizationId ?? "__pending__";
}

export const bookingKeys = {
  all: ["bookings"] as const,
  forOrg: (scope: ScopeLike) => [...bookingKeys.all, "org", orgKey(scope)] as const,
  list: (scope: ScopeLike, filters: Record<string, unknown> = {}) =>
    [...bookingKeys.forOrg(scope), "list", filters] as const,
  detail: (scope: ScopeLike, id: string) =>
    [...bookingKeys.forOrg(scope), "detail", id] as const,
};

export const hotelKeys = {
  all: ["hotels"] as const,
  forOrg: (scope: ScopeLike) => [...hotelKeys.all, "org", orgKey(scope)] as const,
  list: (scope: ScopeLike) => [...hotelKeys.forOrg(scope), "list"] as const,
  dropdown: (scope: ScopeLike) => [...hotelKeys.forOrg(scope), "dropdown"] as const,
};

export const therapistKeys = {
  all: ["therapists"] as const,
  forOrg: (scope: ScopeLike) => [...therapistKeys.all, "org", orgKey(scope)] as const,
  list: (scope: ScopeLike) => [...therapistKeys.forOrg(scope), "list"] as const,
  activeForOrg: (scope: ScopeLike) => [...therapistKeys.forOrg(scope), "active"] as const,
  forHotel: (hotelId: string) => [...therapistKeys.all, "hotel", hotelId] as const,
};

export const conciergeKeys = {
  all: ["concierges"] as const,
  forOrg: (scope: ScopeLike) => [...conciergeKeys.all, "org", orgKey(scope)] as const,
  list: (scope: ScopeLike) => [...conciergeKeys.forOrg(scope), "list"] as const,
  detail: (scope: ScopeLike, id: string) =>
    [...conciergeKeys.forOrg(scope), "detail", id] as const,
};

export const treatmentKeys = {
  all: ["treatment-menus"] as const,
  forOrg: (scope: ScopeLike) => [...treatmentKeys.all, "org", orgKey(scope)] as const,
  list: (scope: ScopeLike) => [...treatmentKeys.forOrg(scope), "list"] as const,
  forHotel: (hotelId: string) => [...treatmentKeys.all, "hotel", hotelId] as const,
};

export const treatmentRoomKeys = {
  all: ["treatment-rooms"] as const,
  forOrg: (scope: ScopeLike) => [...treatmentRoomKeys.all, "org", orgKey(scope)] as const,
  list: (scope: ScopeLike) => [...treatmentRoomKeys.forOrg(scope), "list"] as const,
  dropdown: (scope: ScopeLike) => [...treatmentRoomKeys.forOrg(scope), "dropdown"] as const,
};

export const customerKeys = {
  all: ["customers"] as const,
  forOrg: (scope: ScopeLike) => [...customerKeys.all, "org", orgKey(scope)] as const,
  list: (scope: ScopeLike) => [...customerKeys.forOrg(scope), "list"] as const,
  search: (query: string) => [...customerKeys.all, "search", query] as const,
};

export const bundleKeys = {
  all: ["treatment-bundles"] as const,
  forOrg: (scope: ScopeLike) => [...bundleKeys.all, "org", orgKey(scope)] as const,
  list: (scope: ScopeLike, status?: string) =>
    [...bundleKeys.forOrg(scope), "list", status ?? "all"] as const,
  itemCounts: () => [...bundleKeys.all, "item-counts"] as const,
  customerBundles: (scope: ScopeLike) =>
    [...bundleKeys.forOrg(scope), "customer"] as const,
};

export const ledgerKeys = {
  all: ["hotel-ledger"] as const,
  forOrg: (scope: ScopeLike) => [...ledgerKeys.all, "org", orgKey(scope)] as const,
  list: (scope: ScopeLike, limit?: number) =>
    [...ledgerKeys.forOrg(scope), "list", limit ?? 100] as const,
};

export const payoutKeys = {
  all: ["therapist-payouts"] as const,
  forOrg: (scope: ScopeLike) => [...payoutKeys.all, "org", orgKey(scope)] as const,
  list: (scope: ScopeLike, limit?: number) =>
    [...payoutKeys.forOrg(scope), "list", limit ?? 100] as const,
};

export const dashboardKeys = {
  all: ["dashboard"] as const,
  forOrg: (scope: ScopeLike) => [...dashboardKeys.all, "org", orgKey(scope)] as const,
};
