import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Mail, Phone, LogOut, Star } from "lucide-react";
import { toast } from "sonner";

interface Hairdresser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country_code: string;
  profile_image: string | null;
  skills: string[] | null;
}

const PwaProfile = () => {
  const [hairdresser, setHairdresser] = useState<Hairdresser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/pwa/login");
        return;
      }

      const { data, error } = await supabase
        .from("hairdressers")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      setHairdresser(data);
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Erreur lors du chargement du profil");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Déconnexion réussie");
    navigate("/pwa/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Chargement...</div>
      </div>
    );
  }

  if (!hairdresser) {
    return null;
  }

  const initials = `${hairdresser.first_name[0]}${hairdresser.last_name[0]}`.toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-black text-white p-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/pwa/dashboard")}
            className="text-white hover:bg-white/20"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Mon Profil</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Profile Header */}
        <Card className="p-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <Avatar className="h-24 w-24 border-4 border-black">
              <AvatarImage src={hairdresser.profile_image || undefined} />
              <AvatarFallback className="bg-black text-white text-2xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-2xl font-bold">
                {hairdresser.first_name} {hairdresser.last_name}
              </h2>
              <p className="text-muted-foreground">Coiffeur professionnel</p>
            </div>
          </div>
        </Card>

        {/* Contact Info */}
        <Card className="p-4 space-y-4">
          <h3 className="font-semibold">Informations de contact</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-muted">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Email</div>
                <div className="font-medium">{hairdresser.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-muted">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Téléphone</div>
                <div className="font-medium">
                  {hairdresser.country_code} {hairdresser.phone}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Skills */}
        {hairdresser.skills && hairdresser.skills.length > 0 && (
          <Card className="p-4 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Star className="h-5 w-5" />
              Compétences
            </h3>
            <div className="flex flex-wrap gap-2">
              {hairdresser.skills.map((skill, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-black text-white rounded-full text-sm font-medium"
                >
                  {skill}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3 pt-4">
          <Button
            variant="outline"
            className="w-full"
            size="lg"
            onClick={() => navigate("/pwa/bookings")}
          >
            Voir mes réservations
          </Button>
          <Button
            variant="destructive"
            className="w-full"
            size="lg"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5 mr-2" />
            Se déconnecter
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PwaProfile;
