import type { OrgScope, TClient, Database } from "./client.ts";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

export type TaskWithLinks = TaskRow & {
  hotel: { id: string; name: string } | null;
  booking:
    | {
        id: string;
        booking_id: number | null;
        client_first_name: string | null;
        client_last_name: string | null;
      }
    | null;
  customer: { id: string; first_name: string | null; last_name: string | null } | null;
};

const TASK_SELECT =
  "id, organization_id, hotel_id, booking_id, customer_id, assigned_to_user_id, created_by, title, description, status, priority, due_date, position, completed_at, created_at, updated_at, " +
  "hotel:hotels(id, name), " +
  "booking:bookings(id, booking_id, client_first_name, client_last_name), " +
  "customer:customers(id, first_name, last_name)";

// Tasks carry organization_id directly, so scoping is a single equality filter
// (or none for the super-admin "View All" flow).
export async function listTasksForOrg(
  client: TClient,
  scope: OrgScope,
): Promise<TaskWithLinks[]> {
  let query = client
    .from("tasks")
    .select(TASK_SELECT)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });

  if (!("allOrganizations" in scope && scope.allOrganizations)) {
    query = query.eq("organization_id", (scope as { organizationId: string }).organizationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as TaskWithLinks[];
}

export async function createTask(
  client: TClient,
  payload: TaskInsert,
): Promise<TaskRow> {
  const { data, error } = await client
    .from("tasks")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as TaskRow;
}

export async function updateTask(
  client: TClient,
  id: string,
  patch: TaskUpdate,
): Promise<TaskRow> {
  const { data, error } = await client
    .from("tasks")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as TaskRow;
}

export async function deleteTask(client: TClient, id: string): Promise<void> {
  const { error } = await client.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
