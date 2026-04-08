import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin } from "lucide-react";
import { toast } from "sonner";

interface Hotel {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  image: string | null;
  status: string | null;
}

interface PwaHotelsProps {
  standalone?: boolean;
}

const PwaHotels = ({ standalone = false }: PwaHotelsProps) => {
  const { t } = useTranslation('pwa');
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchHotels();
  }, []);

  const fetchHotels = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/pwa/login");
        return;
      }

      // Get therapist's hotels
      const { data: therapistData } = await supabase
        .from("therapists")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!therapistData) {
        toast.error(t('common:errors.generic'));
        return;
      }

      // Get hotels associated with this therapist
      const { data: hotelAssociations } = await supabase
        .from("therapist_venues")
        .select("hotel_id")
        .eq("therapist_id", therapistData.id);

      if (!hotelAssociations || hotelAssociations.length === 0) {
        setHotels([]);
        setLoading(false);
        return;
      }

      const hotelIds = hotelAssociations.map(h => h.hotel_id);

      const { data: hotelsData, error } = await supabase
        .from("hotels")
        .select("*")
        .in("id", hotelIds);

      if (error) throw error;
      setHotels(hotelsData || []);
    } catch (error) {
      console.error("Error fetching hotels:", error);
      toast.error(t('common:errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">{t('common:loading')}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      {/* Header */}
      <div className="bg-background border-b p-4">
        <div className="flex items-center gap-3">
          {standalone && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/pwa/profile")}
              className="h-10 w-10"
            >
              <ArrowLeft className="h-6 w-6" />
            </Button>
          )}
          <h1 className="text-xl font-semibold">{t('hotels.title')}</h1>
        </div>
      </div>

      {/* Hotels List */}
      <div className="flex-1 min-h-0 divide-y">
        {hotels.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-muted-foreground">{t('hotels.noHotels')}</p>
          </div>
        ) : (
          hotels.map((hotel) => {
            const fullAddress = [
              hotel.address,
              hotel.postal_code,
              hotel.city,
              hotel.country
            ]
              .filter(Boolean)
              .join(", ");

            return (
              <div
                key={hotel.id}
                className="flex items-center gap-4 p-4 bg-background hover:bg-accent/5 transition-colors"
              >
                {/* Hotel Image */}
                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                  {hotel.image ? (
                    <img
                      src={hotel.image}
                      alt={hotel.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <MapPin className="h-6 w-6" />
                    </div>
                  )}
                </div>

                {/* Hotel Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base text-foreground mb-1 truncate">
                    {hotel.name}
                  </h3>
                  {fullAddress && (
                    <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <p className="line-clamp-2">{fullAddress}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PwaHotels;
