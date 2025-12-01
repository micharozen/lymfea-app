import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, LogOut, ChevronRight, User, Bell, Shield, HelpCircle, Hotel, Package, Camera } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      setEditForm({
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        email: data.email,
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Erreur lors du chargement du profil");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      setUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}-${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("hairdressers")
        .update({ profile_image: publicUrl })
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      setHairdresser({ ...hairdresser!, profile_image: publicUrl });
      toast.success("Photo de profil mise à jour");
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Erreur lors de l'upload de l'image");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("hairdressers")
        .update({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      setHairdresser({
        ...hairdresser!,
        first_name: editForm.first_name,
        last_name: editForm.last_name,
      });

      setIsEditDialogOpen(false);
      toast.success("Profil mis à jour");
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Erreur lors de la mise à jour du profil");
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

  const menuItems = [
    { icon: User, label: "Personalisation", onClick: () => setIsEditDialogOpen(true) },
    { icon: Hotel, label: "Hotels", onClick: () => navigate("/pwa/profile/hotels") },
    { icon: Package, label: "OOM product", onClick: () => {} },
    { icon: Bell, label: "Notifications", onClick: () => navigate("/pwa/profile/notifications") },
    { icon: Shield, label: "Account security", onClick: () => navigate("/pwa/account-security") },
    { icon: HelpCircle, label: "Support", onClick: () => window.open("https://wa.me/33769627754", "_blank") },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-background border-b p-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/pwa/dashboard")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Profile</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Profile Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative">
            <Avatar className="h-20 w-20">
              <AvatarImage src={hairdresser.profile_image || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 p-1.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
          <div>
            <h2 className="text-xl font-bold">
              {hairdresser.first_name} {hairdresser.last_name}
            </h2>
            <div className="flex items-center justify-center gap-1 mt-1">
              <span className="text-yellow-500">⭐</span>
              <span className="text-sm font-medium">3.0</span>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="space-y-1">
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={item.onClick}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/50 rounded-lg transition-all active:scale-[0.98] active:bg-muted"
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          ))}
        </div>

        {/* Logout Button */}
        <Button
          variant="ghost"
          className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 transition-all active:scale-[0.98]"
          onClick={handleLogout}
        >
          Log out
        </Button>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Personalisation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                value={editForm.first_name}
                onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                value={editForm.last_name}
                onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                value={editForm.phone}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={editForm.email}
                disabled
                className="bg-muted"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 transition-all active:scale-[0.98]"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 transition-all active:scale-[0.98]"
              onClick={handleSaveProfile}
            >
              Save changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PwaProfile;
