import type { CancellationTier } from "@/lib/cancellationTiers";

export type CancellationFeeType = "none" | "fixed" | "percentage";

export function formatVenueCancellationPolicy(
  feeType: CancellationFeeType | string | null | undefined,
  feeAmount: number | null | undefined,
  lng: "fr" | "en",
  customText?: { fr?: string | null; en?: string | null } | null,
  options?: {
    cutoffHours?: number;
    tiers?: CancellationTier[];
  },
): string {
  const custom = lng === "fr" ? customText?.fr?.trim() : customText?.en?.trim();
  if (custom) return custom;

  const cutoff = options?.cutoffHours ?? 2;
  const tiers = options?.tiers ?? [];
  const tierLines = tiers
    .slice()
    .sort((a, b) => b.max_hours - a.max_hours)
    .map((tier) => {
      if (lng === "fr") {
        return `• Entre ${tier.min_hours} h et ${tier.max_hours} h avant le rendez-vous : remboursement de ${tier.refund_percent} % de l'acompte.`;
      }
      return `• Between ${tier.min_hours}h and ${tier.max_hours}h before the appointment: ${tier.refund_percent}% deposit refund.`;
    });

  if (tierLines.length > 0) {
    const header =
      lng === "fr"
        ? `Annulation en ligne possible jusqu'à ${cutoff} h avant le rendez-vous. Au-delà, contactez l'établissement.\n\n`
        : `Online cancellation is available until ${cutoff}h before the appointment. After that, contact the venue.\n\n`;
    return header + tierLines.join("\n");
  }

  const amount = Number(feeAmount) || 0;
  if (!feeType || feeType === "none" || amount <= 0) {
    return lng === "fr"
      ? `Annulation en ligne possible jusqu'à ${cutoff} h avant le rendez-vous. Contactez la réception pour toute question.`
      : `Online cancellation is available until ${cutoff}h before the appointment. Contact the front desk with any questions.`;
  }
  if (feeType === "fixed") {
    return lng === "fr"
      ? `Annulation en ligne jusqu'à ${cutoff} h avant le rendez-vous. En cas d'annulation tardive (option admin), des frais de ${amount}€ peuvent être retenus sur l'acompte.`
      : `Online cancellation until ${cutoff}h before the appointment. For late cancellations (admin option), a fee of €${amount} may be withheld from the deposit.`;
  }
  return lng === "fr"
    ? `Annulation en ligne jusqu'à ${cutoff} h avant le rendez-vous. En cas d'annulation tardive (option admin), des frais de ${amount}% du montant total peuvent être retenus sur l'acompte.`
    : `Online cancellation until ${cutoff}h before the appointment. For late cancellations (admin option), a fee of ${amount}% of the total may be withheld from the deposit.`;
}
