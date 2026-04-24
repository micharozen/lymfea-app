import { ArrowLeft, User, Check, ChevronsUpDown, Loader2, Mail, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { countries, formatPhoneNumber } from "@/lib/adminPhone";

const adminFormSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  email: z.string().min(1, "L'email est requis").email("Format d'email invalide"),
  phone: z.string().min(1, "Le téléphone est requis"),
  countryCode: z.string(),
  profileImage: z.string().nullable(),
});

type AdminFormValues = z.infer<typeof adminFormSchema>;

export default function AdminDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openCountrySelect, setOpenCountrySelect] = useState(false);
  const [confirmResend, setConfirmResend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const form = useForm<AdminFormValues>({
    resolver: zodResolver(adminFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      countryCode: "+33",
      profileImage: null,
    },
  });

  const { data: admin, isLoading } = useQuery({
    queryKey: ["admin", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("admins")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (admin) {
      form.reset({
        firstName: admin.first_name ?? "",
        lastName: admin.last_name ?? "",
        email: admin.email ?? "",
        phone: admin.phone ?? "",
        countryCode: admin.country_code ?? "+33",
        profileImage: admin.profile_image ?? null,
      });
    }
  }, [admin, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: AdminFormValues) => {
      if (!id) throw new Error("ID manquant");
      const { error } = await supabase
        .from("admins")
        .update({
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email,
          phone: data.phone,
          country_code: data.countryCode,
          profile_image: data.profileImage,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", id] });
      queryClient.invalidateQueries({ queryKey: ["admins"] });
      toast({ title: "Succès", description: "Administrateur modifié" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de la modification",
        variant: "destructive",
      });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async () => {
      if (!admin) throw new Error("Admin introuvable");
      const { error } = await invokeEdgeFunction("invite-admin", {
        body: {
          email: admin.email,
          firstName: admin.first_name,
          lastName: admin.last_name,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Invitation renvoyée",
        description:
          "Un nouvel email avec un mot de passe temporaire a été envoyé.",
      });
      setConfirmResend(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Le renvoi a échoué",
        variant: "destructive",
      });
      setConfirmResend(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("ID manquant");
      const { error } = await invokeEdgeFunction("delete-admin", {
        body: { adminId: id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admins"] });
      toast({ title: "Succès", description: "Administrateur supprimé" });
      navigate("/admin/admins");
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de la suppression",
        variant: "destructive",
      });
      setConfirmDelete(false);
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);
      form.setValue("profileImage", publicUrl, { shouldDirty: true });
    } catch (error) {
      console.error("Error uploading image:", error);
      toast({
        title: "Erreur",
        description: "Erreur lors de l'upload",
        variant: "destructive",
      });
    }
  };

  const onSubmit = (data: AdminFormValues) => updateMutation.mutate(data);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" onClick={() => navigate("/admin/admins")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Retour
          </Button>
          <p className="mt-6 text-muted-foreground">Administrateur introuvable.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/admins")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Admins
          </Button>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center overflow-hidden">
            {admin.profile_image ? (
              <img
                src={admin.profile_image}
                alt={`${admin.first_name} ${admin.last_name}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">
              {admin.first_name} {admin.last_name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">{admin.email}</span>
              <Badge
                variant={admin.status === "active" ? "default" : "secondary"}
                className={cn(
                  "font-medium",
                  admin.status === "active" &&
                    "bg-green-500/10 text-green-700 hover:bg-green-500/10",
                  admin.status === "pending" &&
                    "bg-orange-500/10 text-orange-700 hover:bg-orange-500/10",
                )}
              >
                {admin.status === "active"
                  ? "Actif"
                  : admin.status === "pending"
                    ? "En attente"
                    : admin.status}
              </Badge>
            </div>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Informations</CardTitle>
            <CardDescription>Modifier les informations du compte administrateur</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <Label className="text-sm font-normal mb-2 block">Photo de profil</Label>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                      {form.watch("profileImage") ? (
                        <img
                          src={form.watch("profileImage")!}
                          alt="Profile"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <input
                      type="file"
                      id="profile-image-detail"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById("profile-image-detail")?.click()}
                      type="button"
                    >
                      Télécharger l'image
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-normal">Prénom</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-10" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-normal">Nom</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-10" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-normal">Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} className="h-10" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-normal">Téléphone</FormLabel>
                      <div className="flex gap-2">
                        <Popover open={openCountrySelect} onOpenChange={setOpenCountrySelect}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className="w-[160px] h-10 justify-between"
                              type="button"
                            >
                              {form.watch("countryCode")
                                ? `${countries.find((c) => c.code === form.watch("countryCode"))?.flag} ${form.watch("countryCode")}`
                                : "Sélectionner..."}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[200px] p-0">
                            <Command>
                              <CommandInput placeholder="Rechercher pays..." />
                              <CommandList>
                                <CommandEmpty>Aucun pays trouvé.</CommandEmpty>
                                <CommandGroup>
                                  {countries.map((country) => (
                                    <CommandItem
                                      key={country.code}
                                      value={`${country.label} ${country.code}`}
                                      keywords={[country.code.replace("+", ""), country.label]}
                                      onSelect={() => {
                                        form.setValue("countryCode", country.code, {
                                          shouldDirty: true,
                                        });
                                        setOpenCountrySelect(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          form.watch("countryCode") === country.code
                                            ? "opacity-100"
                                            : "opacity-0",
                                        )}
                                      />
                                      {country.flag} {country.label} ({country.code})
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <FormControl>
                          <Input
                            type="tel"
                            {...field}
                            onChange={(e) => {
                              const formatted = formatPhoneNumber(
                                e.target.value,
                                form.watch("countryCode"),
                              );
                              field.onChange(formatted);
                            }}
                            className="h-10 flex-1"
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    disabled={!form.formState.isDirty || updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "Enregistrement..." : "Enregistrer"}
                    {updateMutation.isPending && (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium">Renvoyer l'invitation</p>
                <p className="text-sm text-muted-foreground">
                  Génère un nouveau mot de passe temporaire et renvoie l'email de
                  connexion.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setConfirmResend(true)}
                disabled={resendInviteMutation.isPending}
              >
                <Mail className="h-4 w-4 mr-2" />
                Renvoyer
              </Button>
            </div>

            <div className="border-t border-border" />

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium text-destructive">
                  Supprimer l'administrateur
                </p>
                <p className="text-sm text-muted-foreground">
                  Cette action est irréversible.
                </p>
              </div>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmResend} onOpenChange={setConfirmResend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renvoyer l'invitation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Un nouveau mot de passe temporaire sera généré et envoyé à{" "}
              <strong>{admin.email}</strong>. L'ancien mot de passe ne fonctionnera
              plus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resendInviteMutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                resendInviteMutation.mutate();
              }}
              disabled={resendInviteMutation.isPending}
            >
              {resendInviteMutation.isPending ? "Envoi..." : "Renvoyer"}
              {resendInviteMutation.isPending && (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Cet administrateur sera définitivement
              supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Suppression..." : "Supprimer"}
              {deleteMutation.isPending && (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
