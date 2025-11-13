import { User } from "lucide-react";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function Profile() {
  const [isEditing, setIsEditing] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: admin } = await supabase
            .from('admins')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (admin) {
            setAdminId(admin.id);
            setFirstName(admin.first_name || "");
            setLastName(admin.last_name || "");
            setPhone(admin.phone || "");
            setEmail(admin.email || "");
            setProfileImage(admin.profile_image || null);
          }
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        toast.error("Erreur lors du chargement du profil");
      } finally {
        setLoading(false);
      }
    };
    
    fetchProfile();
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !adminId) return;

    try {
      // Upload vers Supabase Storage
      const fileExt = file.name.split('.').pop();
      const filePath = `${adminId}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Récupérer l'URL publique
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setProfileImage(publicUrl);
      toast.success("Image uploadée avec succès");
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Erreur lors de l'upload de l'image");
    }
  };

  const handleSave = async () => {
    if (!adminId) {
      toast.error("Impossible de sauvegarder le profil");
      return;
    }

    try {
      const { error } = await supabase
        .from('admins')
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          profile_image: profileImage,
        })
        .eq('id', adminId);

      if (error) throw error;

      toast.success("Profil mis à jour avec succès");
      setIsEditing(false);
      
      // Rafraîchir la page pour mettre à jour la sidebar
      window.location.reload();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Erreur lors de la mise à jour du profil");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl">
          <h1 className="text-3xl font-bold text-foreground mb-8">Profil</h1>
          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="p-8">
              <p className="text-muted-foreground">Chargement...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold text-foreground mb-8">Profil</h1>

        <Card className="border border-border bg-card shadow-sm">
          <CardContent className="p-8">
            {/* Photo de profil */}
            <div className="flex items-center gap-6 mb-8">
              <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {profileImage ? (
                  <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-12 h-12 text-muted-foreground" />
                )}
              </div>
              <input
                type="file"
                id="profile-upload"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => document.getElementById('profile-upload')?.click()}
                type="button"
                disabled={!isEditing}
              >
                Télécharger une image
              </Button>
            </div>

            {/* Informations utilisateur */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <Label htmlFor="firstName" className="text-sm text-muted-foreground mb-1.5 block">
                  Prénom
                </Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="h-10"
                  disabled={!isEditing}
                />
              </div>

              <div>
                <Label htmlFor="lastName" className="text-sm text-muted-foreground mb-1.5 block">
                  Nom
                </Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="h-10"
                  disabled={!isEditing}
                />
              </div>

              <div>
                <Label htmlFor="role" className="text-sm text-muted-foreground mb-1.5 block">
                  Rôle
                </Label>
                <Input
                  id="role"
                  value="Admin"
                  disabled
                  className="h-10 bg-muted"
                />
              </div>

              <div>
                <Label htmlFor="phone" className="text-sm text-muted-foreground mb-1.5 block">
                  Téléphone
                </Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-10"
                  disabled={!isEditing}
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="email" className="text-sm text-muted-foreground mb-1.5 block">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10"
                  disabled={!isEditing}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              {!isEditing ? (
                <Button 
                  onClick={() => setIsEditing(true)}
                  className="bg-foreground text-background hover:bg-foreground/90"
                >
                  Modifier le profil
                </Button>
              ) : (
                <>
                  <Button 
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                  >
                    Annuler
                  </Button>
                  <Button 
                    onClick={handleSave}
                    className="bg-foreground text-background hover:bg-foreground/90"
                  >
                    Enregistrer les modifications
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
