import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  ChevronRight,
  ChevronLeft,
  User,
  Bell,
  Shield,
  HelpCircle,
  Hotel,
  Camera,
  Globe,
  CalendarDays,
  Star,
  FileText,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import VersionLine from "@/components/pwa/VersionLine";

interface Therapist {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country_code: string;
  profile_image: string | null;
}

interface TherapistTreatment {
  name: string;
  duration: number | null;
}

interface Rating {
  average: number;
  count: number;
}

/** Nombre de prestations montrées en aperçu avant la pastille « +N ». */
const TREATMENT_PREVIEW_COUNT = 4;

const PwaProfile = () => {
  const { t } = useTranslation('pwa');
  const [therapist, setTherapist] = useState<Therapist | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isLanguageDialogOpen, setIsLanguageDialogOpen] = useState(false);
  const [isTreatmentsOpen, setIsTreatmentsOpen] = useState(false);
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
  const [myTreatments, setMyTreatments] = useState<TherapistTreatment[]>([]);
  const [rating, setRating] = useState<Rating | null>(null);

  // Fetch profile on mount - use cache first, refresh in background
  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/pwa/login");
        return;
      }

      // Check for cached therapist data first
      const cachedTherapist = queryClient.getQueryData<Therapist>(["therapist", user.id]);

      if (cachedTherapist) {
        setTherapist(cachedTherapist);
        setEditForm({
          first_name: cachedTherapist.first_name,
          last_name: cachedTherapist.last_name,
          phone: cachedTherapist.phone,
          email: cachedTherapist.email,
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
        .from("therapists")
        .select("id, user_id, first_name, last_name, email, phone, country_code, profile_image")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;

      // Prestations réalisables — policy SELECT self sur therapist_treatments.
      // Un même soin peut exister dans plusieurs lieux : on dédoublonne par nom.
      const { data: treatmentRows } = await supabase
        .from("therapist_treatments")
        .select("treatment_menus(name, duration)")
        .eq("therapist_id", data.id);
      const byName = new Map<string, TherapistTreatment>();
      for (const row of treatmentRows ?? []) {
        const menu = row.treatment_menus;
        if (menu?.name && !byName.has(menu.name)) {
          byName.set(menu.name, { name: menu.name, duration: menu.duration });
        }
      }
      setMyTreatments(
        [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      );

      // Note réelle : moyenne des évaluations post-soin reçues.
      // send-rating-email pré-crée la ligne avec rating=5 en attendant la
      // réponse du client : seules les lignes soumises comptent.
      const { data: ratingRows } = await supabase
        .from("therapist_ratings")
        .select("rating")
        .eq("therapist_id", data.id)
        .not("submitted_at", "is", null);
      if (ratingRows && ratingRows.length > 0) {
        const sum = ratingRows.reduce((acc, row) => acc + row.rating, 0);
        setRating({ average: sum / ratingRows.length, count: ratingRows.length });
      } else {
        setRating(null);
      }

      // Cache the data
      queryClient.setQueryData(["therapist", user.id], data);

      setTherapist(data);
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
        .from("therapists")
        .update({ profile_image: publicUrl })
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      setTherapist({ ...therapist!, profile_image: publicUrl });
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
        .from("therapists")
        .update({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      setTherapist({
        ...therapist!,
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
    // Ignore error if session no longer exists server-side
    await supabase.auth.signOut().catch(() => {});
    toast.success(t('common:toasts.success'));
    navigate("/pwa/login");
  };

  const header = (
    <header
      className="hdr"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
    >
      <button
        className="back-btn"
        onClick={() => navigate("/pwa/dashboard")}
        aria-label={t('common:buttons.back', 'Retour')}
      >
        <ChevronLeft size={20} />
      </button>
      <div className="wordmark" style={{ flex: 1, textAlign: "center" }}>
        {t('profile.title')}
      </div>
      <div style={{ width: 38, flex: "none" }} />
    </header>
  );

  // Only show loader on very first load
  if (loading && !therapist) {
    return (
      <div className="app-refonte flex h-full min-h-0 flex-col">
        {header}
        <div className="app-scroll" style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="sk" style={{ height: 128, borderRadius: 18 }} />
          <div className="sk" style={{ height: 84, borderRadius: 18 }} />
          <div className="sk" style={{ height: 148, borderRadius: 18 }} />
        </div>
      </div>
    );
  }

  if (!therapist) {
    return null;
  }

  const initials = `${therapist.first_name[0]}${therapist.last_name[0]}`.toUpperCase();

  const sections: { label: string; items: { icon: typeof User; label: string; onClick: () => void }[] }[] = [
    {
      label: t('profile.sectionActivity'),
      items: [
        { icon: Hotel, label: t('hotels.title'), onClick: () => navigate("/pwa/profile/hotels") },
        { icon: CalendarDays, label: t('schedule.title'), onClick: () => navigate("/pwa/schedule") },
        { icon: FileText, label: t('invoices.title'), onClick: () => navigate("/pwa/invoices") },
      ],
    },
    {
      label: t('profile.sectionAccount'),
      items: [
        { icon: User, label: t('profile.editProfile'), onClick: () => setIsEditDialogOpen(true) },
        { icon: Bell, label: t('profile.notifications'), onClick: () => navigate("/pwa/profile/notifications") },
        { icon: Globe, label: t('profile.language'), onClick: () => setIsLanguageDialogOpen(true) },
        { icon: Shield, label: t('profile.security'), onClick: () => navigate("/pwa/account-security") },
      ],
    },
    {
      label: t('profile.sectionHelp'),
      items: [
        { icon: HelpCircle, label: t('support.title'), onClick: () => navigate("/pwa/support") },
      ],
    },
  ];

  const previewTreatments = myTreatments.slice(0, TREATMENT_PREVIEW_COUNT);
  const hiddenTreatmentCount = myTreatments.length - previewTreatments.length;

  return (
    <div className="app-refonte flex h-full min-h-0 flex-col">
      {header}

      <div className="app-scroll" style={{ paddingBottom: 24 }}>
        {/* Identité */}
        <div className="prof-id">
          <div className="prof-av-wrap">
            {therapist.profile_image ? (
              <img className="prof-av" src={therapist.profile_image} alt="" />
            ) : (
              <div className="prof-av prof-av-fallback">{initials}</div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="prof-cam"
              aria-label={t('profile.changePhoto')}
            >
              <Camera size={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
          <div className="prof-nm">
            {therapist.first_name} {therapist.last_name}
          </div>
          {rating && (
            <div className="prof-rate">
              <Star size={13} className="star" />
              <span>{rating.average.toFixed(1)}</span>
              <span className="cnt">{t('profile.ratingCount', { count: rating.count })}</span>
            </div>
          )}
        </div>

        {/* Prestations réalisables — aperçu, détail dans une feuille dédiée */}
        {myTreatments.length > 0 && (
          <>
            <div className="sec-label">
              {t('profile.myTreatments')}
              <span className="count">{myTreatments.length}</span>
              <button className="sec-action" onClick={() => setIsTreatmentsOpen(true)}>
                {t('profile.seeAll')}
              </button>
            </div>
            <button className="card prof-chips" onClick={() => setIsTreatmentsOpen(true)}>
              {previewTreatments.map((treatment) => (
                <span key={treatment.name} className="chip">{treatment.name}</span>
              ))}
              {hiddenTreatmentCount > 0 && (
                <span className="chip more">+{hiddenTreatmentCount}</span>
              )}
            </button>
          </>
        )}

        {/* Menu groupé */}
        {sections.map((section) => (
          <div key={section.label}>
            <div className="sec-label">{section.label}</div>
            <div className="card">
              {section.items.map((item) => (
                <button key={item.label} className="menu-row" onClick={item.onClick}>
                  <item.icon size={17} className="ic" />
                  <span className="lb">{item.label}</span>
                  <ChevronRight size={17} className="chev" />
                </button>
              ))}
            </div>
          </div>
        ))}

        <div style={{ padding: "18px 16px 0" }}>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 transition-all active:scale-[0.98]"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t('profile.logout')}
          </Button>
        </div>

        <VersionLine therapistId={therapist.id} userId={therapist.user_id} />
      </div>

      {/* Feuille « prestations réalisables » (lecture seule) */}
      {isTreatmentsOpen && (
        <div
          className="sheet-veil"
          onClick={() => setIsTreatmentsOpen(false)}
          role="presentation"
        >
          <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h3>{t('profile.myTreatments')}</h3>
              <button
                className="sheet-close"
                onClick={() => setIsTreatmentsOpen(false)}
                aria-label={t('common:buttons.close', 'Fermer')}
              >
                <X size={17} />
              </button>
            </div>
            <div className="sheet-body">
              {myTreatments.map((treatment) => (
                <div key={treatment.name} className="soin-row">
                  <div className="nm">{treatment.name}</div>
                  {treatment.duration && <div className="dur">{treatment.duration} min</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-normal">{t('profile.editProfile')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">{t('profile.firstName')}</Label>
              <Input
                id="first_name"
                value={editForm.first_name}
                onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">{t('profile.lastName')}</Label>
              <Input
                id="last_name"
                value={editForm.last_name}
                onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('profile.phone')}</Label>
              <Input
                id="phone"
                value={editForm.phone}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('profile.email')}</Label>
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
            <DialogTitle className="font-normal">{t('profile.language')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <LanguageSwitcher variant="list" persistToProfile onSelect={() => setIsLanguageDialogOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PwaProfile;
