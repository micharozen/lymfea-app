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
export function sanitizeSearchTerm(term: string): string {
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

/**
 * Construit le filtre PostgREST d'une recherche de personne sur deux colonnes
 * de nom.
 *
 * Un `ilike` ne compare qu'une colonne à la fois : « Jean Dupont » ne pouvait
 * donc matcher ni first_name ni last_name, et la recherche ne remontait rien
 * dès qu'on tapait le nom complet. Sur deux mots ou plus, on teste les deux
 * ordres (« Jean Dupont » et « Dupont Jean ») via des `and()` imbriqués, que
 * PostgREST accepte à l'intérieur d'un `or()`.
 *
 * `extraColumns` reçoit les colonnes cherchées sur la saisie entière
 * (téléphone, email…), qu'on ne veut pas découper en mots.
 */
export function buildPersonSearchFilter(
  rawQuery: string,
  firstNameColumn: string,
  lastNameColumn: string,
  extraColumns: string[] = [],
): string | null {
  const sanitized = sanitizeSearchTerm(rawQuery);
  if (sanitized.length < 2) return null;

  const clauses = [
    `${firstNameColumn}.ilike.%${sanitized}%`,
    `${lastNameColumn}.ilike.%${sanitized}%`,
    ...extraColumns.map((column) => `${column}.ilike.%${sanitized}%`),
  ];

  const tokens = sanitized.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length >= 2) {
    const [first, ...rest] = tokens;
    const last = rest.join(" ");
    clauses.push(
      `and(${firstNameColumn}.ilike.%${first}%,${lastNameColumn}.ilike.%${last}%)`,
      `and(${firstNameColumn}.ilike.%${last}%,${lastNameColumn}.ilike.%${first}%)`,
    );
  }

  return clauses.join(",");
}

export async function searchCustomers(
  client: TClient,
  query: string,
): Promise<CustomerSearchResult[]> {
  const filter = buildPersonSearchFilter(query, "first_name", "last_name", ["phone", "email"]);
  if (filter === null) return [];
  const { data, error } = await client
    .from("customers")
    .select("id, first_name, last_name, phone, email")
    .or(filter)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as CustomerSearchResult[];
}
