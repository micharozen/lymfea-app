import type { ParsedEmail } from "../llm-agent/actions/parseEmail.ts";

/**
 * Seuil de confiance à partir duquel un message entrant ouvre une tâche.
 *
 * Volontairement plus bas que le 0.8 exigé pour convertir automatiquement en
 * réservation (`canAutoConvert`) : ici on cherche seulement à reconnaître une
 * demande, pas à la traiter. Sous ce seuil, le message reste dans la boîte et
 * l'opérateur crée la tâche à la main — c'est ce qui évite que le board se
 * remplisse de spam et de réponses automatiques.
 */
export const INBOUND_TASK_INTENT_THRESHOLD = 0.5;

export interface InboundTaskInput {
  organizationId: string;
  hotelId: string;
  subject: string | null;
  bodyText: string | null;
  parsed: ParsedEmail;
  channel?: string;
}

/**
 * Titre de la tâche.
 *
 * Le sujet d'un mail dit rarement ce qu'il y a à faire (« Re: », « Booking »,
 * ou rien) : on préfère le titre rédigé par l'extracteur, qui nomme le client
 * et sa demande. Le sujet ne sert que de repli.
 */
function taskTitle(input: InboundTaskInput): string {
  const summary = input.parsed.summary?.trim();
  if (summary) return summary;
  const subject = input.subject?.trim();
  if (subject) return subject;
  const name = [input.parsed.client_first_name, input.parsed.client_last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name ? `Demande de ${name}` : "Demande entrante";
}

/**
 * Colonnes d'une tâche créée depuis un message entrant.
 *
 * Ni assignée ni échéancée : c'est une tâche système, que l'équipe s'attribue
 * en l'ouvrant. Les coordonnées vont dans les champs prospect — aucune fiche
 * client n'est créée tant que la demande n'est pas convertie.
 */
export function buildInboundTaskColumns(input: InboundTaskInput) {
  const { parsed } = input;
  return {
    organization_id: input.organizationId,
    hotel_id: input.hotelId,
    title: taskTitle(input),
    description: input.bodyText?.trim() || parsed.notes || null,
    task_type: "inbound_request",
    channel: input.channel ?? "email",
    status: "todo",
    priority: "medium",
    treatment_date: parsed.requested_date ?? null,
    treatment_menu_ids: parsed.treatment_match?.id ? [parsed.treatment_match.id] : [],
    prospect_first_name: parsed.client_first_name ?? null,
    prospect_last_name: parsed.client_last_name ?? null,
    prospect_email: parsed.email ?? null,
    prospect_phone: parsed.phone ?? null,
  };
}
