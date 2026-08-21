import { EntityDetailDialog } from "./EntityDetailDialog";
import { DetailSection, DetailCard, DetailField, DetailGrid, DetailStat } from "./DetailSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Euro, HandHeart, Building2, Clock } from "lucide-react";
import { formatPrice } from "@/lib/formatPrice";
import { getSpecialtyLabel } from "@/lib/specialtyTypes";
import { useTranslation } from "react-i18next";

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

interface TreatmentMenu {
  id: string;
  name: string;
  description: string | null;
  duration: number | null;
  price: number | null;
  lead_time: number | null;
  service_for: string | null;
  category: string | null;
  status: string;
  currency: string | null;
  price_on_request: boolean | null;
  hotel_id: string | null;
  image: string | null;
  treatment_type: string | null;
}

interface TreatmentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treatment: TreatmentMenu | null;
  hotel: Hotel | null;
  onEdit?: () => void;
  onDuplicate?: () => void;
}

export function TreatmentDetailDialog({
  open,
  onOpenChange,
  treatment,
  hotel,
  onEdit,
  onDuplicate,
}: TreatmentDetailDialogProps) {
  const { t, i18n } = useTranslation(['admin', 'common']);

  if (!treatment) return null;

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "-";
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h${remainingMinutes}min` : `${hours}h`;
    }
    return `${minutes}min`;
  };

  const formatLeadTime = (minutes: number | null) => {
    if (!minutes) return "-";
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h${remainingMinutes}` : `${hours}h`;
    }
    return `${minutes}min`;
  };

  const getServiceForLabel = (serviceFor: string | null) => {
    switch (serviceFor) {
      case "Male": return t('treatmentDetail.dialog.serviceForMale');
      case "Female": return t('treatmentDetail.dialog.serviceForFemale');
      default: return t('treatmentDetail.dialog.serviceForAll');
    }
  };

  const getServiceForEmoji = (serviceFor: string | null) => {
    switch (serviceFor) {
      case "Male": return "👨";
      case "Female": return "👩";
      default: return "👥";
    }
  };

  return (
    <EntityDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
      onDuplicate={onDuplicate}
      title={treatment.name}
      image={treatment.image}
      emoji="💆"
      status={treatment.status}
    >
      {/* Pricing */}
      <DetailSection icon={Euro} title={t('treatmentDetail.dialog.pricing')}>
        <DetailGrid columns={3}>
          <DetailStat
            label={t('treatments.price')}
            value={treatment.price_on_request ? t('treatmentDetail.dialog.onRequest') : formatPrice(treatment.price || 0, treatment.currency || "EUR", { decimals: 0 })}
            center
          />
          <DetailStat
            label={t('treatments.duration')}
            value={treatment.price_on_request ? t('treatmentDetail.dialog.onRequest') : formatDuration(treatment.duration)}
            center
          />
          <DetailStat
            label={t('treatmentDetail.dialog.leadTime')}
            value={formatLeadTime(treatment.lead_time)}
            center
          />
        </DetailGrid>
      </DetailSection>

      {/* Details */}
      <DetailSection icon={HandHeart} title={t('treatmentDetail.dialog.details')}>
        <DetailCard>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('treatments.category')}</p>
                <p className="text-sm font-medium">{treatment.category || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('treatments.specialty')}</p>
                <p className="text-sm font-medium">
                  {treatment.treatment_type
                    ? getSpecialtyLabel(treatment.treatment_type, i18n.language)
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('treatmentDetail.dialog.audience')}</p>
                <p className="text-sm font-medium">
                  {getServiceForEmoji(treatment.service_for)} {getServiceForLabel(treatment.service_for)}
                </p>
              </div>
            </div>
            {treatment.description && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('treatments.description')}</p>
                <p className="text-sm text-muted-foreground">{treatment.description}</p>
              </div>
            )}
          </div>
        </DetailCard>
      </DetailSection>

      {/* Hotel */}
      <DetailSection icon={Building2} title={t('treatmentDetail.dialog.assignment')} showSeparator={false}>
        <DetailCard>
          {hotel ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={hotel.image || undefined} />
                <AvatarFallback className="text-xs">
                  {hotel.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{hotel.name}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('treatmentDetail.dialog.globalTreatment')}</p>
          )}
        </DetailCard>
      </DetailSection>
    </EntityDetailDialog>
  );
}
