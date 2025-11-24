import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, Phone, Mail } from "lucide-react";
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

const PwaHotels = () => {
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

      // Get hairdresser's hotels
      const { data: hairdresserData } = await supabase
        .from("hairdressers")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!hairdresserData) {
        toast.error("Profil coiffeur non trouvé");
        return;
      }

      // Get hotels associated with this hairdresser
      const { data: hotelAssociations } = await supabase
        .from("hairdresser_hotels")
        .select("hotel_id")
        .eq("hairdresser_id", hairdresserData.id);

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
      toast.error("Erreur lors du chargement des hôtels");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-background border-b p-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/pwa/profile")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Mes Hôtels</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-4">
        {hotels.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Aucun hôtel associé</p>
          </div>
        ) : (
          hotels.map((hotel) => (
            <div
              key={hotel.id}
              className="bg-card border rounded-lg overflow-hidden"
            >
              {hotel.image && (
                <div className="w-full h-40 overflow-hidden">
                  <img
                    src={hotel.image}
                    alt={hotel.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-4 space-y-3">
                <div>
                  <h3 className="font-semibold text-lg">{hotel.name}</h3>
                  {hotel.status && (
                    <span className={`inline-block px-2 py-1 rounded-full text-xs mt-1 ${
                      hotel.status === "Active"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                    }`}>
                      {hotel.status}
                    </span>
                  )}
                </div>
                
                {(hotel.address || hotel.city || hotel.country) && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      {hotel.address && <p>{hotel.address}</p>}
                      <p>
                        {[hotel.postal_code, hotel.city, hotel.country]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PwaHotels;
