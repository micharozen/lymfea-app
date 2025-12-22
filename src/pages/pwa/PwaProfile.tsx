import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, ChevronRight, User, Bell, Shield, HelpCircle, Hotel, Package, Camera, Globe } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import PwaHeader from "@/components/pwa/PwaHeader";
import PwaPageLoader from "@/components/pwa/PwaPageLoader";

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
  const { t } = useTranslation('pwa');
  const [hairdresser, setHairdresser] = useState<Hairdresser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isLanguageDialogOpen, setIsLanguageDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch profile on mount - use cache first, refresh in background
  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/pwa/login");
        return;
      }

      // Check for cached hairdresser data first
      const cachedHairdresser = queryClient.getQueryData<Hairdresser>(["hairdresser", user.id]);
      
      if (cachedHairdresser) {
        setHairdresser(cachedHairdresser);
        setEditForm({
          first_name: cachedHairdresser.first_name,
          last_name: cachedHairdresser.last_name,
          phone: cachedHairdresser.phone,
          email: cachedHairdresser.email,
        });
        setLoading(false);
      }

      // Always fetch fresh data in background
      fetchProfile();
    };

    loadProfile();
  }, [queryClient, navigate]);

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
      
      // Cache the data
      queryClient.setQueryData(["hairdresser", user.id], data);
      
      setHairdresser(data);
      setEditForm({
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        email: data.email,
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error(t('common:errors.generic'));
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
      toast.success(t('common:toasts.saved'));
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error(t('common:errors.generic'));
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
      toast.success(t('common:toasts.saved'));
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(t('common:errors.generic'));
    }
  };

  const handleLogout = async () => {
    // On ignore l'erreur si la session n'existe plus côté serveur
    await supabase.auth.signOut().catch(() => {});
    toast.success(t('common:toasts.success'));
    navigate("/pwa/login");
  };

  // Only show loader on very first load
  if (loading && !hairdresser) {
    return (
      <PwaPageLoader 
        title={t('profile.title')} 
        showBack 
        backPath="/pwa/dashboard" 
      />
    );
  }

  if (!hairdresser) {
    return null;
  }

  const initials = `${hairdresser.first_name[0]}${hairdresser.last_name[0]}`.toUpperCase();

  const menuItems = [
    { icon: User, label: t('profile.editProfile'), onClick: () => setIsEditDialogOpen(true) },
    { icon: Hotel, label: t('hotels.title'), onClick: () => navigate("/pwa/profile/hotels") },
    { icon: Package, label: "OOM product", onClick: () => {} },
    { icon: Bell, label: t('profile.notifications'), onClick: () => navigate("/pwa/profile/notifications") },
    { icon: Globe, label: t('profile.language'), onClick: () => setIsLanguageDialogOpen(true) },
    { icon: Shield, label: t('profile.security'), onClick: () => navigate("/pwa/account-security") },
    { icon: HelpCircle, label: "Support", onClick: () => window.open("https://wa.me/33769627754", "_blank") },
  ];

  return (
    <div className="h-full flex flex-col bg-background">
      <PwaHeader
        title={t('profile.title')}
        showBack
        backPath="/pwa/dashboard"
      />

      {/* Content */}
      <div className="flex-1 flex flex-col px-4 pt-4 pb-6">
        {/* Profile Header - Centered */}
        <div className="flex flex-col items-center text-center mb-4">
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
              className="absolute bottom-0 right-0 flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-full"
              style={{ width: 28, height: 28, minWidth: 28, minHeight: 28 }}
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
          <h2 className="text-base font-semibold mt-2">
            {hairdresser.first_name} {hairdresser.last_name}
          </h2>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-yellow-500 text-sm">⭐</span>
            <span className="text-sm text-muted-foreground">3.0</span>
          </div>
        </div>

        {/* Compact Menu Items */}
        <div className="space-y-0.5 flex-1">
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={item.onClick}
              className="w-full flex items-center justify-between py-2.5 px-3 hover:bg-muted/50 rounded-lg transition-all active:scale-[0.98] active:bg-muted"
            >
              <div className="flex items-center gap-2.5">
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{item.label}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>

        {/* Logout Button - pushed to bottom */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-auto text-destructive hover:text-destructive hover:bg-destructive/10 transition-all active:scale-[0.98]"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          {t('profile.logout')}
        </Button>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('profile.editProfile')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">{t('booking.client')} - {t('common:buttons.edit')}</Label>
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
              {t('common:buttons.cancel')}
            </Button>
            <Button
              className="flex-1 transition-all active:scale-[0.98]"
              onClick={handleSaveProfile}
            >
              {t('common:buttons.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Language Dialog */}
      <Dialog open={isLanguageDialogOpen} onOpenChange={setIsLanguageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('profile.language')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <LanguageSwitcher variant="list" onSelect={() => setIsLanguageDialogOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PwaProfile;
