import { describe, it, expect } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers extraits de la logique métier (reproduits ici pour les tester
// en isolation, sans dépendance React/Supabase)
// ─────────────────────────────────────────────────────────────────────────────

/** Reproduit PaymentSelectionDrawer.tsx */
function supportsRoomPayment(venueType: string | null | undefined, roomNumber: string | null | undefined): boolean {
  return venueType === "hotel" && !!roomNumber;
}

/** Reproduit Dashboard.tsx getPaymentStatusBadge */
function getPaymentStatusLabel(paymentStatus: string | null | undefined): string | null {
  switch (paymentStatus) {
    case "paid":               return "Payé";
    case "charged_to_room":    return "Chambre";
    case "card_saved":         return "Carte enregistrée";
    case "pending":            return "Paiement dû";
    case "failed":             return "Échoué";
    default:                   return null;
  }
}

/** Reproduit Notifications.tsx getNotificationIcon (retourne le type d'icône) */
function getNotificationIconType(type: string): string {
  switch (type) {
    case "new_booking":      return "Bell";
    case "booking_cancelled":return "XCircle";
    case "booking_taken":
    case "booking_confirmed":return "CheckCircle";
    case "payment_failed":   return "AlertCircle";
    default:                 return "Mail";
  }
}

/** Reproduit la logique de priorité genre de trigger-new-booking-notifications */
type Therapist = { id: string; gender: string | null; declined_by_booking?: boolean };

function applyGenderPriority(
  eligible: Therapist[],
  genderPref: string | null,
): Therapist[] {
  if (!genderPref) return eligible;
  const priority = eligible.filter(t => t.gender === genderPref);
  return priority.length > 0 ? priority : eligible;
}

/** Reproduit le calcul de totalDuration dans BookingDetail.tsx */
function computeTotalDuration(
  bookingDuration: number | null | undefined,
  treatmentsDuration: number,
): number {
  return (bookingDuration ?? 0) > 0 ? bookingDuration! : (treatmentsDuration || 60);
}

/** Reproduit la condition CTA "Finaliser" dans BookingDetail.tsx */
const DONE_PAYMENT_STATUSES = ["paid", "charged_to_room", "pending_partner_billing"];

function shouldShowFinalizeButton(
  status: string,
  effectivePaymentStatus: string | null | undefined,
): boolean {
  if (!["confirmed", "ongoing"].includes(status)) return false;
  if (effectivePaymentStatus === "card_saved") return true; // bouton "Débiter carte"
  return !DONE_PAYMENT_STATUSES.includes(effectivePaymentStatus ?? "");
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Paiement chambre – supportsRoomPayment", () => {
  it("autorisé si hotel + numéro de chambre", () => {
    expect(supportsRoomPayment("hotel", "42")).toBe(true);
  });
  it("refusé si spa même avec numéro de chambre", () => {
    expect(supportsRoomPayment("spa", "42")).toBe(false);
  });
  it("refusé si hotel sans numéro de chambre", () => {
    expect(supportsRoomPayment("hotel", null)).toBe(false);
    expect(supportsRoomPayment("hotel", "")).toBe(false);
  });
  it("refusé si venueType null", () => {
    expect(supportsRoomPayment(null, "42")).toBe(false);
  });
});

describe("Badge de paiement – labels", () => {
  it("'pending' affiche 'Paiement dû' (plus 'En attente')", () => {
    expect(getPaymentStatusLabel("pending")).toBe("Paiement dû");
    expect(getPaymentStatusLabel("pending")).not.toBe("En attente");
  });
  it("'paid' affiche 'Payé'", () => {
    expect(getPaymentStatusLabel("paid")).toBe("Payé");
  });
  it("'card_saved' affiche 'Carte enregistrée'", () => {
    expect(getPaymentStatusLabel("card_saved")).toBe("Carte enregistrée");
  });
  it("'charged_to_room' affiche 'Chambre'", () => {
    expect(getPaymentStatusLabel("charged_to_room")).toBe("Chambre");
  });
  it("status inconnu retourne null", () => {
    expect(getPaymentStatusLabel(null)).toBeNull();
    expect(getPaymentStatusLabel(undefined)).toBeNull();
    expect(getPaymentStatusLabel("unknown_status")).toBeNull();
  });
});

describe("Icônes de notifications", () => {
  it("new_booking → Bell", () => {
    expect(getNotificationIconType("new_booking")).toBe("Bell");
  });
  it("booking_cancelled → XCircle", () => {
    expect(getNotificationIconType("booking_cancelled")).toBe("XCircle");
  });
  it("booking_confirmed → CheckCircle (était manquant)", () => {
    expect(getNotificationIconType("booking_confirmed")).toBe("CheckCircle");
  });
  it("booking_taken → CheckCircle", () => {
    expect(getNotificationIconType("booking_taken")).toBe("CheckCircle");
  });
  it("payment_failed → AlertCircle (était manquant)", () => {
    expect(getNotificationIconType("payment_failed")).toBe("AlertCircle");
  });
  it("type inconnu → Mail (fallback)", () => {
    expect(getNotificationIconType("some_random_type")).toBe("Mail");
  });
});

describe("Priorité genre – notifications thérapeutes", () => {
  const therapists: Therapist[] = [
    { id: "f1", gender: "female" },
    { id: "f2", gender: "female" },
    { id: "m1", gender: "male" },
    { id: "n1", gender: null },
  ];

  it("sans préférence → tous les thérapeutes notifiés", () => {
    expect(applyGenderPriority(therapists, null)).toHaveLength(4);
  });

  it("préférence female → seulement les femmes en phase 1", () => {
    const result = applyGenderPriority(therapists, "female");
    expect(result).toHaveLength(2);
    expect(result.every(t => t.gender === "female")).toBe(true);
  });

  it("préférence male → seulement les hommes en phase 1", () => {
    const result = applyGenderPriority(therapists, "male");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("m1");
  });

  it("phase 2 (tous les prioritaires ont refusé) → fallback sur tout le monde", () => {
    // Tous les thérapeutes female ont déjà décliné → eligible ne contient que male + null
    const afterDeclines: Therapist[] = [
      { id: "m1", gender: "male" },
      { id: "n1", gender: null },
    ];
    const result = applyGenderPriority(afterDeclines, "female");
    // priority group vide → retourne le fallback complet
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toContain("m1");
    expect(result.map(t => t.id)).toContain("n1");
  });

  it("préférence genre mais aucun thérapeute du genre → fallback immédiat", () => {
    const maleOnly: Therapist[] = [{ id: "m1", gender: "male" }];
    const result = applyGenderPriority(maleOnly, "female");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("m1");
  });
});

describe("Calcul de durée totale du booking", () => {
  it("utilise booking.duration s'il est défini et > 0", () => {
    expect(computeTotalDuration(90, 60)).toBe(90);
  });
  it("utilise la somme des soins si booking.duration est null", () => {
    expect(computeTotalDuration(null, 75)).toBe(75);
  });
  it("utilise la somme des soins si booking.duration est 0", () => {
    expect(computeTotalDuration(0, 60)).toBe(60);
  });
  it("fallback à 60 min si aucune durée disponible", () => {
    expect(computeTotalDuration(null, 0)).toBe(60);
  });
});

describe("Bouton Finaliser – conditions d'affichage", () => {
  it("affiché pour booking confirmed avec paiement pending", () => {
    expect(shouldShowFinalizeButton("confirmed", "pending")).toBe(true);
  });
  it("affiché pour booking ongoing avec paiement pending", () => {
    expect(shouldShowFinalizeButton("ongoing", "pending")).toBe(true);
  });
  it("affiché pour card_saved (bouton débiter carte)", () => {
    expect(shouldShowFinalizeButton("confirmed", "card_saved")).toBe(true);
  });
  it("masqué si paiement déjà effectué (paid)", () => {
    expect(shouldShowFinalizeButton("confirmed", "paid")).toBe(false);
  });
  it("masqué si facturé à la chambre", () => {
    expect(shouldShowFinalizeButton("confirmed", "charged_to_room")).toBe(false);
  });
  it("masqué si facturation partenaire en cours", () => {
    expect(shouldShowFinalizeButton("confirmed", "pending_partner_billing")).toBe(false);
  });
  it("masqué si booking déjà terminé (completed)", () => {
    expect(shouldShowFinalizeButton("completed", "pending")).toBe(false);
  });
  it("masqué si booking pending (pas encore accepté)", () => {
    expect(shouldShowFinalizeButton("pending", "pending")).toBe(false);
  });
  it("masqué si no-show", () => {
    expect(shouldShowFinalizeButton("noshow", null)).toBe(false);
  });
  it("pas de signature requise – le statut ne conditionne plus le bouton", () => {
    // Avant : !booking.client_signature était requis. Maintenant non.
    // Le test vérifie que la logique ne dépend PAS d'une signature
    const withPaymentPending = shouldShowFinalizeButton("confirmed", "pending");
    expect(withPaymentPending).toBe(true); // indépendant de la signature
  });
});
