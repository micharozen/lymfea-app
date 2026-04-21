import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, Copy, Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface VenueClientPreviewTabProps {
  hotelId: string;
  /** Canonical slug for URL construction. Falls back to hotelId (UUID) if absent. */
  slug?: string | null;
}

export function VenueClientPreviewTab({ hotelId, slug }: VenueClientPreviewTabProps) {
  const { t } = useTranslation('admin');
  const [copied, setCopied] = useState(false);
  const [treatmentCopied, setTreatmentCopied] = useState(false);
  const [selectedTreatmentSlug, setSelectedTreatmentSlug] = useState<string>("");

  const identifier = slug || hotelId;
  const clientUrl = `${window.location.origin}/client/${identifier}`;

  const { data: treatments = [] } = useQuery({
    queryKey: ['venue-treatments-links', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('treatment_menus')
        .select('id, slug, name, name_en, category')
        .eq('hotel_id', hotelId)
        .eq('status', 'active')
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!hotelId,
    staleTime: 5 * 60 * 1000,
  });

  const treatmentUrl = selectedTreatmentSlug
    ? `${window.location.origin}/client/${identifier}/treatment/${selectedTreatmentSlug}`
    : '';

  const previewUrl = selectedTreatmentSlug ? treatmentUrl : clientUrl;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(clientUrl);
    setCopied(true);
    toast.success(t('venue.clientPreview.urlCopied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTreatmentCopy = async () => {
    if (!treatmentUrl) return;
    await navigator.clipboard.writeText(treatmentUrl);
    setTreatmentCopied(true);
    toast.success(t('venue.clientPreview.treatmentLinkCopied'));
    setTimeout(() => setTreatmentCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Device frame */}
      <div
        className="relative bg-black rounded-[40px] p-3 shadow-2xl"
        style={{ width: 390, height: 700 }}
      >
        {/* Notch */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full z-10" />
        {/* Screen */}
        <div className="w-full h-full rounded-[32px] overflow-hidden bg-background">
          <iframe
            key={previewUrl}
            src={previewUrl}
            className="w-full h-full border-0"
            title="Aperçu client"
            loading="lazy"
          />
        </div>
      </div>

      {/* Venue Link Section */}
      <div className="w-full max-w-md space-y-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('venue.clientPreview.venueLink')}
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground font-mono">
            {clientUrl}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="flex-shrink-0"
          >
            {copied ? (
              <Check className="h-4 w-4 mr-1.5 text-green-600" />
            ) : (
              <Copy className="h-4 w-4 mr-1.5" />
            )}
            {copied ? t('venue.clientPreview.urlCopied') : t('venue.clientPreview.copyUrl')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
            className="flex-shrink-0"
          >
            <a href={clientUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1.5" />
              {t('venue.clientPreview.openInNewTab')}
            </a>
          </Button>
        </div>
      </div>

      {/* Treatment Link Section */}
      <div className="w-full max-w-md space-y-2">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('venue.clientPreview.treatmentLink')}
          </label>
        </div>

        {treatments.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            {t('venue.clientPreview.noTreatments')}
          </p>
        ) : (
          <>
            <Select value={selectedTreatmentSlug} onValueChange={setSelectedTreatmentSlug}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('venue.clientPreview.selectTreatment')} />
              </SelectTrigger>
              <SelectContent>
                {treatments.map((tr) => (
                  <SelectItem key={tr.id} value={tr.slug || tr.id}>
                    <span className="text-muted-foreground text-xs mr-2">{tr.category}</span>
                    {tr.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedTreatmentSlug && treatmentUrl && (
              <div className="flex items-center gap-2 animate-fade-in">
                <div className="flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground font-mono">
                  {treatmentUrl}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTreatmentCopy}
                  className="flex-shrink-0"
                >
                  {treatmentCopied ? (
                    <Check className="h-4 w-4 mr-1.5 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4 mr-1.5" />
                  )}
                  {treatmentCopied ? t('venue.clientPreview.urlCopied') : t('venue.clientPreview.copyUrl')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="flex-shrink-0"
                >
                  <a href={treatmentUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1.5" />
                    {t('venue.clientPreview.openInNewTab')}
                  </a>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
