import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUser } from "@/contexts/UserContext";
import { VenueSetupSubmissionsPanel } from "@/components/admin/venue-setup/VenueSetupSubmissionsPanel";

export default function OnboardingRequests() {
  const { t } = useTranslation("admin");
  const { isSuperAdmin, loading } = useUser();

  if (!loading && !isSuperAdmin) return <Navigate to="/admin" replace />;

  return (
    <div className="bg-background flex flex-col min-h-0">
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6 mb-4">
        <h1 className="text-lg font-medium text-foreground">{t("venueSetup.pageTitle")}</h1>
        <p className="text-xs text-muted-foreground mt-1">{t("venueSetup.pageSubtitle")}</p>
      </div>
      <div className="flex-1 px-4 md:px-6 pb-6">
        <VenueSetupSubmissionsPanel />
      </div>
    </div>
  );
}
