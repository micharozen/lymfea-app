export type CancellationFeeType = "none" | "fixed" | "percentage";

export function formatVenueCancellationPolicy(
  feeType: CancellationFeeType | string | null | undefined,
  feeAmount: number | null | undefined,
  lng: "fr" | "en",
  customText?: { fr?: string | null; en?: string | null } | null,
): string {
  const custom = lng === "fr" ? customText?.fr?.trim() : customText?.en?.trim();
  if (custom) return custom;

  const amount = Number(feeAmount) || 0;
  if (!feeType || feeType === "none" || amount <= 0) {
    return lng === "fr"
      ? "Les conditions d'annulation de cet établissement s'appliquent. Contactez la réception pour toute question."
      : "This venue's cancellation terms apply. Contact the front desk with any questions.";
  }
  if (feeType === "fixed") {
    return lng === "fr"
      ? `En cas d'annulation tardive (option admin), des frais de ${amount}€ peuvent être retenus sur l'acompte.`
      : `For late cancellations (admin option), a fee of €${amount} may be withheld from the deposit.`;
  }
  return lng === "fr"
    ? `En cas d'annulation tardive (option admin), des frais de ${amount}% du montant total peuvent être retenus sur l'acompte.`
    : `For late cancellations (admin option), a fee of ${amount}% of the total may be withheld from the deposit.`;
}
