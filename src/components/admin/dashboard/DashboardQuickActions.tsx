import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarPlus, Sparkles, Ticket, type LucideIcon } from "lucide-react";

import CreateBookingDialog from "@/components/booking/CreateBookingDialog";
import { AddExternalVoucherDialog } from "@/components/admin/venue/AddExternalVoucherDialog";
import { useUser } from "@/contexts/UserContext";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";

/**
 * Raccourcis de création en tête du dashboard — « Que voulez-vous faire ? ».
 *
 * Les trois créations les plus courantes sont sinon enfouies dans leurs pages
 * respectives. Aucune donnée n'est chargée ici : les deux dialogues sont
 * autonomes, et le soin passe par sa page dédiée.
 */

interface DashboardQuickActionsProps {
  /** Lieu courant du dashboard ("all" = tous) — pré-remplit les dialogues. */
  selectedHotel: string;
}

interface QuickAction {
  key: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  onSelect: () => void;
}

export function DashboardQuickActions({ selectedHotel }: DashboardQuickActionsProps) {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();
  const { role } = useUser();
  const { isVenueManagerView } = useEffectiveRole();

  const [bookingOpen, setBookingOpen] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);

  const presetHotelId = selectedHotel !== "all" ? selectedHotel : undefined;
  // Même règle que la page Menus de soins : la création reste aux admins,
  // et disparaît quand un admin regarde l'app à travers un lieu.
  const canCreateTreatment = role === "admin" && !isVenueManagerView;

  const actions: QuickAction[] = [
    {
      key: "booking",
      icon: CalendarPlus,
      label: t("dashboardPage.quickActions.booking.label"),
      hint: t("dashboardPage.quickActions.booking.hint"),
      onSelect: () => setBookingOpen(true),
    },
    ...(canCreateTreatment
      ? [
          {
            key: "treatment",
            icon: Sparkles,
            label: t("dashboardPage.quickActions.treatment.label"),
            hint: t("dashboardPage.quickActions.treatment.hint"),
            onSelect: () => navigate("/admin/treatments/new"),
          },
        ]
      : []),
    {
      key: "voucher",
      icon: Ticket,
      label: t("dashboardPage.quickActions.voucher.label"),
      hint: t("dashboardPage.quickActions.voucher.hint"),
      onSelect: () => setVoucherOpen(true),
    },
  ];

  return (
    <div className="qa">
      <h2 className="qa-title">{t("dashboardPage.quickActions.title")}</h2>
      <div className="qa-grid">
        {actions.map(({ key, icon: Icon, label, hint, onSelect }) => (
          <button key={key} type="button" className="qa-card" onClick={onSelect}>
            <Icon className="qa-icon" aria-hidden="true" />
            <span className="qa-label">{label}</span>
            <span className="qa-hint">{hint}</span>
          </button>
        ))}
      </div>

      <CreateBookingDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        presetHotelId={presetHotelId}
      />
      <AddExternalVoucherDialog
        open={voucherOpen}
        onOpenChange={setVoucherOpen}
        hotelId={presetHotelId}
      />
    </div>
  );
}
