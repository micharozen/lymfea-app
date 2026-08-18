import { useCallback, useState } from "react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import type { DateRange } from "@/lib/billingPeriod";

export type SkipReason = "no_bookings" | "zero_amount" | "missing_rates";

export interface TherapistInvoiceRow {
  therapist_id: string;
  therapist_name: string;
  therapist_email: string | null;
  hotel_id: string | null;
  hotel_name?: string | null;
  success: boolean;
  skipped?: boolean;
  reason?: SkipReason;
  error?: string;
  bookingsCount?: number;
  amountHt?: number;
  vatRate?: number;
  vatAmount?: number;
  amountTtc?: number;
  /** Renseigné après une génération réelle. */
  invoiceId?: string;
  /** Horodatage local de la génération, posé à la réception du résultat. */
  generatedAt?: string;
  /** Facture déjà en base sur cette date de début — sera remplacée. */
  existingInvoiceId?: string;
  existingInvoiceNumber?: string;
  existingPeriodEnd?: string;
  htmlSnapshot?: string;
}

export interface TherapistInvoiceBatchResponse {
  success: boolean;
  mode: string;
  period: DateRange;
  results: TherapistInvoiceRow[];
  generated: number;
  skipped: number;
}

const EDGE_FUNCTION = "generate-therapist-invoices";

/** Une ligne est facturable si elle a produit un montant et n'a pas été ignorée. */
export const isBillable = (row: TherapistInvoiceRow): boolean =>
  row.success && !row.skipped && (row.amountHt ?? 0) > 0;

/**
 * Dry-run : calcule les montants de tous les thérapeutes du lieu sur la période,
 * sans rien écrire en base.
 *
 * Volontairement une mutation et non une `useQuery` : l'appel est coûteux et ne
 * doit se déclencher que sur action explicite de l'utilisateur.
 */
export function useTherapistInvoicePreview(
  hotelId: string,
): UseMutationResult<TherapistInvoiceBatchResponse, Error, DateRange> {
  return useMutation({
    mutationFn: async (range: DateRange) => {
      const { data, error } = await invokeEdgeFunction<
        Record<string, unknown>,
        TherapistInvoiceBatchResponse
      >(EDGE_FUNCTION, {
        body: {
          mode: "preview",
          hotel_id: hotelId,
          period_start: range.start,
          period_end: range.end,
        },
        logContext: { flow: "preview-therapist-invoices", hotelId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error("Preview failed");
      return data;
    },
  });
}

/**
 * Génération réelle, un appel par thérapeute : un échec reste circonscrit à sa
 * ligne et aucune requête ne peut atteindre le timeout de l'edge function.
 */
export function useTherapistInvoiceGeneration(hotelId: string) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(
    async (range: DateRange, therapistIds: string[]): Promise<TherapistInvoiceRow[]> => {
      if (therapistIds.length === 0) return [];

      setIsGenerating(true);
      setProgress({ done: 0, total: therapistIds.length });

      const results: TherapistInvoiceRow[] = [];
      let done = 0;

      const runOne = async (therapistId: string): Promise<TherapistInvoiceRow[]> => {
        try {
          const { data, error } = await invokeEdgeFunction<
            Record<string, unknown>,
            TherapistInvoiceBatchResponse
          >(EDGE_FUNCTION, {
            body: {
              mode: "manual",
              hotel_id: hotelId,
              therapist_id: therapistId,
              period_start: range.start,
              period_end: range.end,
            },
            logContext: { flow: "generate-therapist-invoices", hotelId, therapistId },
          });
          if (error) throw error;
          const stamp = new Date().toISOString();
          return (data?.results ?? []).map((r) =>
            r.invoiceId ? { ...r, generatedAt: stamp } : r,
          );
        } catch (err) {
          console.error(`Error generating invoice for therapist ${therapistId}:`, err);
          return [
            {
              therapist_id: therapistId,
              therapist_name: "",
              therapist_email: null,
              hotel_id: hotelId,
              success: false,
              error: err instanceof Error ? err.message : String(err),
            },
          ];
        } finally {
          done += 1;
          setProgress({ done, total: therapistIds.length });
        }
      };

      try {
        const queue = [...therapistIds];
        const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
          for (let next = queue.shift(); next; next = queue.shift()) {
            results.push(...(await runOne(next)));
          }
        });
        await Promise.all(workers);
        return results;
      } finally {
        setIsGenerating(false);
        setProgress(null);
      }
    },
    [hotelId],
  );

  return { generate, progress, isGenerating };
}

/**
 * HTML d'aperçu d'une facture non encore générée, pour un seul thérapeute.
 * Le HTML est exclu du preview global : ~30 Ko par facture y saturerait la
 * réponse.
 */
export function useTherapistInvoiceHtml(
  hotelId: string,
): UseMutationResult<string | null, Error, { therapistId: string; range: DateRange }> {
  return useMutation({
    mutationFn: async ({ therapistId, range }) => {
      const { data, error } = await invokeEdgeFunction<
        Record<string, unknown>,
        TherapistInvoiceBatchResponse
      >(EDGE_FUNCTION, {
        body: {
          mode: "preview",
          hotel_id: hotelId,
          therapist_id: therapistId,
          period_start: range.start,
          period_end: range.end,
          include_html: true,
        },
        logContext: { flow: "preview-therapist-invoice-html", hotelId, therapistId },
      });

      if (error) throw error;
      return data?.results?.[0]?.htmlSnapshot ?? null;
    },
  });
}
