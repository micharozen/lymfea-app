import type { OrgScope, TClient, Database } from "./client.ts";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

/** Sous-tâche cochable stockée dans la colonne jsonb `tasks.checklist`. */
export interface TaskChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export type TaskWithLinks = Omit<TaskRow, "checklist"> & {
  checklist: TaskChecklistItem[];
  hotel: { id: string; name: string } | null;
  booking:
    | {
        id: string;
        booking_id: number | null;
        booking_date: string | null;
        client_first_name: string | null;
        client_last_name: string | null;
      }
    | null;
  customer: { id: string; first_name: string | null; last_name: string | null } | null;
  /** Nombre de messages du fil rattaché, tous canaux confondus (0 pour un appel ou un walk-in). */
  message_count: number;
  /** Nombre de commentaires internes, réponses comprises. */
  comment_count: number;
};

const TASK_SELECT =
  "id, organization_id, hotel_id, booking_id, customer_id, assigned_to_user_id, created_by, title, description, status, priority, task_type, task_type_other, treatment_menu_ids, therapist_ids, checklist, attachments, due_date, position, completed_at, created_at, updated_at, " +
  "channel, feedback_type, client_type, treatment_date, prospect_first_name, prospect_last_name, prospect_email, prospect_phone, converted_booking_id, " +
  "hotel:hotels(id, name), " +
  // `converted_booking_id` ajoute une seconde FK vers bookings : sans nommer la
  // contrainte, PostgREST refuse l'embed comme ambigu (PGRST201).
  "booking:bookings!tasks_booking_id_fkey(id, booking_id, booking_date, client_first_name, client_last_name), " +
  "customer:customers(id, first_name, last_name), " +
  "channel_messages(count), " +
  "task_comments(count)";

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

  // Les embeds `channel_messages(count)` et `task_comments(count)` remontent
  // sous forme de tableaux agrégés ; on les aplatit pour que l'UI lise de
  // simples nombres.
  // Le type inféré par PostgREST sur un embed agrégé n'est pas un objet pour
  // TypeScript : on repasse par `unknown` avant de déstructurer.
  const rows = (data ?? []) as unknown as Array<
    Record<string, unknown> & {
      channel_messages?: { count: number }[];
      task_comments?: { count: number }[];
    }
  >;
  return rows.map(({ channel_messages, task_comments, ...rest }) => ({
    ...rest,
    message_count: channel_messages?.[0]?.count ?? 0,
    comment_count: task_comments?.[0]?.count ?? 0,
  })) as unknown as TaskWithLinks[];
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
