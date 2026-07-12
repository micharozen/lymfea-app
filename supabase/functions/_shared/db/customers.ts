import type { OrgScope, TClient, Database } from "./client.ts";
import { resolveHotelIdsForOrg } from "./scope.ts";

type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

export type CustomerWithPreferredTherapist = CustomerRow & {
  preferred_therapist: { id: string; first_name: string; last_name: string } | null;
  booking_count: number;
};

export type CustomerListSortColumn = "name" | "email" | "created_at";

export type CustomerListPageOptions = {
  /** Server-side ilike search on first_name/last_name/email/phone. */
  search?: string;
  /** Filter on customers.language ("fr", "en"…). Undefined = all. */
  language?: string;
  /** 1-based page index. */
  page: number;
  pageSize: number;
  sort?: { column: CustomerListSortColumn; direction: "asc" | "desc" };
};

export type CustomerListPage = {
  customers: CustomerWithPreferredTherapist[];
  total: number;
};

// Strip characters that would break the PostgREST or() filter syntax.
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[%_,()\\]/g, " ").trim();
}

// Server-side paginated/filtered version of listCustomersForOrg. Never loads the
// whole table (PostgREST caps responses at 1000 rows, which silently truncated
// the old full-table fetch). booking_count is computed by an embedded count
// aggregate, restricted to the org's hotels when the scope is org-bound.
export async function listCustomersPageForOrg(
  client: TClient,
  scope: OrgScope,
  options: CustomerListPageOptions,
): Promise<CustomerListPage> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);
  if (hotelIds !== null && hotelIds.length === 0) return { customers: [], total: 0 };

  const scoped = hotelIds !== null;
  let q = client
    .from("customers")
    .select(
      `*, preferred_therapist:therapists!customers_preferred_therapist_id_fkey(id, first_name, last_name), bookings${scoped ? "!inner" : ""}(count)`,
      { count: "exact" },
    );

  if (scoped) q = q.in("bookings.hotel_id", hotelIds as string[]);

  const search = sanitizeSearchTerm(options.search ?? "");
  if (search.length > 0) {
    q = q.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
    );
  }

  if (options.language) q = q.eq("language", options.language);

  const sort = options.sort;
  if (sort?.column === "name") {
    q = q
      .order("first_name", { ascending: sort.direction === "asc" })
      .order("last_name", { ascending: sort.direction === "asc" });
  } else if (sort?.column === "email") {
    q = q.order("email", { ascending: sort.direction === "asc" });
  } else {
    q = q.order("created_at", {
      ascending: sort?.column === "created_at" && sort.direction === "asc",
    });
  }

  const from = (options.page - 1) * options.pageSize;
  const { data, error, count } = await q.range(from, from + options.pageSize - 1);
  if (error) throw error;

  const customers = (data ?? []).map((row) => {
    const { bookings, ...rest } = row as typeof row & { bookings?: { count: number }[] };
    return { ...rest, booking_count: bookings?.[0]?.count ?? 0 };
  }) as unknown as CustomerWithPreferredTherapist[];

  return { customers, total: count ?? 0 };
}

export type CustomerSearchResult = Pick<
  CustomerRow,
  "id" | "first_name" | "last_name" | "phone" | "email"
>;

export async function searchCustomers(
  client: TClient,
  query: string,
): Promise<CustomerSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const { data, error } = await client
    .from("customers")
    .select("id, first_name, last_name, phone, email")
    .or(
      `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%,email.ilike.%${trimmed}%`,
    )
    .limit(20);
  if (error) throw error;
  return (data ?? []) as CustomerSearchResult[];
}
