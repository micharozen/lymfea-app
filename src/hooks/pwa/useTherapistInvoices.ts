import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TherapistInvoice {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  issue_date: string;
  amount_ht: number;
  vat_amount: number;
  amount_ttc: number;
  currency: string;
  bookings_count: number;
  status: string;
  html_snapshot: string | null;
  hotel_name: string | null;
}

/**
 * Factures de commission du thérapeute connecté, en lecture seule.
 *
 * La policy « Therapists can view own invoices » restreint déjà les lignes à
 * celles du thérapeute : le filtre sur therapist_id sert à cibler la requête,
 * pas à sécuriser. Le nom du lieu vient de la jointure, qui peut être vide si
 * le thérapeute n'est plus rattaché au lieu facturé.
 */
export function useTherapistInvoices(therapistId: string | undefined) {
  return useQuery<TherapistInvoice[]>({
    queryKey: ["pwa", "invoices", therapistId],
    enabled: !!therapistId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          `
          id,
          invoice_number,
          period_start,
          period_end,
          issue_date,
          amount_ht,
          vat_amount,
          amount_ttc,
          currency,
          bookings_count,
          status,
          html_snapshot,
          hotels ( name )
        `,
        )
        .eq("therapist_id", therapistId!)
        .eq("invoice_kind", "therapist_commission")
        .neq("status", "draft")
        .order("period_start", { ascending: false })
        .order("invoice_number", { ascending: false });

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: row.id,
        invoice_number: row.invoice_number,
        period_start: row.period_start,
        period_end: row.period_end,
        issue_date: row.issue_date,
        amount_ht: Number(row.amount_ht),
        vat_amount: Number(row.vat_amount),
        amount_ttc: Number(row.amount_ttc),
        currency: row.currency,
        bookings_count: row.bookings_count,
        status: row.status,
        html_snapshot: row.html_snapshot,
        hotel_name: (row.hotels as { name: string } | null)?.name ?? null,
      }));
    },
  });
}
