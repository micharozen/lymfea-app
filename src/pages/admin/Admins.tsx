import { Search, User, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
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

export default function Admins() {
  const navigate = useNavigate();
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [openCountrySelect, setOpenCountrySelect] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof adminFormSchema>>({
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

  const { data: userRole } = useQuery({
    queryKey: ["userRole"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data?.role || null;
    },
  });

  const isAdmin = userRole === "admin";

  const { data: admins = [], isLoading } = useQuery({
    queryKey: ["admins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admins")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredAdmins = admins.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.first_name?.toLowerCase().includes(q) ||
      a.last_name?.toLowerCase().includes(q) ||
      a.email?.toLowerCase().includes(q) ||
      a.phone?.toLowerCase().includes(q)
    );
  });

  const createAdminMutation = useMutation({
    mutationFn: async (data: z.infer<typeof adminFormSchema>) => {
      const { data: existingAdmins, error: checkError } = await supabase
        .from("admins")
        .select("email, phone")
        .or(`email.eq.${data.email},phone.eq.${data.phone}`);
      if (checkError) throw checkError;

      if (existingAdmins && existingAdmins.length > 0) {
        const existing = existingAdmins[0];
        if (existing.email === data.email) {
          throw new Error("Un administrateur avec cet email existe déjà");
        }
        if (existing.phone === data.phone) {
          throw new Error("Un administrateur avec ce numéro de téléphone existe déjà");
        }
      }

      const { data: inserted, error: insertError } = await supabase
        .from("admins")
        .insert({
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email,
          phone: data.phone,
          country_code: data.countryCode,
          profile_image: data.profileImage,
          status: "En attente",
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      const { error: inviteError } = await invokeEdgeFunction("invite-admin", {
        body: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
        },
      });

      return {
        invited: !inviteError,
        inviteErrorMessage: inviteError?.message,
        adminId: inserted?.id as string | undefined,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admins"] });

      if (result?.invited) {
        toast({
          title: "Succès",
          description: "Administrateur ajouté. Un email d'invitation a été envoyé.",
        });
      } else {
        toast({
          title: "Admin créé",
          description:
            result?.inviteErrorMessage ||
            "Admin créé mais l'email d'invitation n'a pas pu être envoyé.",
          variant: "destructive",
        });
      }

      form.reset();
      setIsAddAdminOpen(false);
      if (result?.adminId) navigate(`/admin/admins/${result.adminId}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de l'ajout",
        variant: "destructive",
      });
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
      form.setValue("profileImage", publicUrl);
      toast({ title: "Succès", description: "Image uploadée" });
    } catch (error) {
      console.error("Error uploading image:", error);
      toast({
        title: "Erreur",
        description: "Erreur lors de l'upload",
        variant: "destructive",
      });
    }
  };

  const onSubmit = (data: z.infer<typeof adminFormSchema>) => {
    createAdminMutation.mutate(data);
  };

  const handleOpenAddDialog = () => {
    form.reset({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      countryCode: "+33",
      profileImage: null,
    });
    setIsAddAdminOpen(true);
  };

  const handleCloseDialog = () => {
    form.reset();
    setIsAddAdminOpen(false);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 md:mb-6">
          <h1 className="text-lg font-medium text-foreground mb-4 md:mb-8">
            Admins
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher"
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {isAdmin && (
            <Button className="md:ml-auto" onClick={handleOpenAddDialog}>
              Nouvel administrateur
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Nom</TableHead>
                <TableHead className="font-semibold">Email</TableHead>
                <TableHead className="font-semibold">Numéro de téléphone</TableHead>
                <TableHead className="font-semibold">Statut</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Chargement...
                  </TableCell>
                </TableRow>
              ) : filteredAdmins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Aucun administrateur trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filteredAdmins.map((admin) => (
                  <TableRow
                    key={admin.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => navigate(`/admin/admins/${admin.id}`)}
                  >
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                          {admin.profile_image ? (
                            <img
                              src={admin.profile_image}
                              alt={`${admin.first_name} ${admin.last_name}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <span className="font-medium whitespace-nowrap">
                          {admin.first_name} {admin.last_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="align-middle text-sm">{admin.email}</TableCell>
                    <TableCell className="align-middle text-sm">
                      {admin.country_code} {admin.phone}
                    </TableCell>
                    <TableCell className="align-middle">
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
                    </TableCell>
                    <TableCell className="align-middle text-right">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={isAddAdminOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              Ajouter un admin
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
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
                    id="profile-image"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border"
                    onClick={() => document.getElementById("profile-image")?.click()}
                    type="button"
                  >
                    Télécharger l'image
                  </Button>
                </div>
              </div>

              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">Prénom</FormLabel>
                    <FormControl>
                      <Input placeholder="Prénom" {...field} className="h-10" />
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
                      <Input placeholder="Nom" {...field} className="h-10" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="Saisir l'adresse e-mail"
                        {...field}
                        className="h-10"
                      />
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
                              ? `${countries.find((c) => c.code === form.watch("countryCode"))?.flag} ${countries.find((c) => c.code === form.watch("countryCode"))?.label} (${form.watch("countryCode")})`
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
                                      form.setValue("countryCode", country.code);
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

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={handleCloseDialog}
                  className="px-5"
                  type="button"
                  disabled={createAdminMutation.isPending}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  className="px-5"
                  disabled={createAdminMutation.isPending}
                >
                  {createAdminMutation.isPending ? "Enregistrement..." : "Créer"}
                  {createAdminMutation.isPending && (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
