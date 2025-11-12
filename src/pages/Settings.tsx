import { Search, Plus, User, Mail, Phone, X, Check, ChevronsUpDown, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";

const adminFormSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  email: z.string().min(1, "L'email est requis").email("Format d'email invalide"),
  phone: z.string().min(1, "Le téléphone est requis"),
  countryCode: z.string(),
  profileImage: z.string().nullable(),
});

const countries = [
  { code: "+33", label: "France", flag: "🇫🇷" },
  { code: "+39", label: "Italie", flag: "🇮🇹" },
  { code: "+1", label: "USA", flag: "🇺🇸" },
  { code: "+44", label: "UK", flag: "🇬🇧" },
  { code: "+49", label: "Allemagne", flag: "🇩🇪" },
  { code: "+34", label: "Espagne", flag: "🇪🇸" },
  { code: "+41", label: "Suisse", flag: "🇨🇭" },
  { code: "+32", label: "Belgique", flag: "🇧🇪" },
  { code: "+971", label: "EAU", flag: "🇦🇪" },
];

const formatPhoneNumber = (value: string, countryCode: string): string => {
  // Remove all non-numeric characters
  const numbers = value.replace(/\D/g, '');
  
  switch (countryCode) {
    case "+33": // France: 6 14 21 64 42 (10 digits)
      const fr = numbers.slice(0, 10);
      if (fr.length <= 1) return fr;
      if (fr.length <= 3) return `${fr.slice(0, 1)} ${fr.slice(1)}`;
      if (fr.length <= 5) return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3)}`;
      if (fr.length <= 7) return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5)}`;
      if (fr.length <= 9) return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5, 7)} ${fr.slice(7)}`;
      return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5, 7)} ${fr.slice(7, 9)} ${fr.slice(9, 10)}`;
      
    case "+1": // USA: (555) 123-4567 (10 digits)
      const us = numbers.slice(0, 10);
      if (us.length <= 3) return us;
      if (us.length <= 6) return `(${us.slice(0, 3)}) ${us.slice(3)}`;
      return `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
      
    case "+44": // UK: 1234 567 890 (10 digits)
      const uk = numbers.slice(0, 10);
      if (uk.length <= 4) return uk;
      if (uk.length <= 7) return `${uk.slice(0, 4)} ${uk.slice(4)}`;
      return `${uk.slice(0, 4)} ${uk.slice(4, 7)} ${uk.slice(7)}`;
      
    case "+39": // Italie: 123 456 7890 (10 digits)
      const it = numbers.slice(0, 10);
      if (it.length <= 3) return it;
      if (it.length <= 6) return `${it.slice(0, 3)} ${it.slice(3)}`;
      return `${it.slice(0, 3)} ${it.slice(3, 6)} ${it.slice(6)}`;
      
    case "+49": // Allemagne: 123 45678901 (11 digits)
      const de = numbers.slice(0, 11);
      if (de.length <= 3) return de;
      return `${de.slice(0, 3)} ${de.slice(3)}`;
      
    case "+34": // Espagne: 612 34 56 78 (9 digits)
      const es = numbers.slice(0, 9);
      if (es.length <= 3) return es;
      if (es.length <= 5) return `${es.slice(0, 3)} ${es.slice(3)}`;
      if (es.length <= 7) return `${es.slice(0, 3)} ${es.slice(3, 5)} ${es.slice(5)}`;
      return `${es.slice(0, 3)} ${es.slice(3, 5)} ${es.slice(5, 7)} ${es.slice(7)}`;
      
    case "+41": // Suisse: 12 345 67 89 (9 digits)
      const ch = numbers.slice(0, 9);
      if (ch.length <= 2) return ch;
      if (ch.length <= 5) return `${ch.slice(0, 2)} ${ch.slice(2)}`;
      if (ch.length <= 7) return `${ch.slice(0, 2)} ${ch.slice(2, 5)} ${ch.slice(5)}`;
      return `${ch.slice(0, 2)} ${ch.slice(2, 5)} ${ch.slice(5, 7)} ${ch.slice(7)}`;
      
    case "+32": // Belgique: 123 45 67 89 (9 digits)
      const be = numbers.slice(0, 9);
      if (be.length <= 3) return be;
      if (be.length <= 5) return `${be.slice(0, 3)} ${be.slice(3)}`;
      if (be.length <= 7) return `${be.slice(0, 3)} ${be.slice(3, 5)} ${be.slice(5)}`;
      return `${be.slice(0, 3)} ${be.slice(3, 5)} ${be.slice(5, 7)} ${be.slice(7)}`;
      
    case "+971": // EAU: 50 123 4567 (9 digits)
      const ae = numbers.slice(0, 9);
      if (ae.length <= 2) return ae;
      if (ae.length <= 5) return `${ae.slice(0, 2)} ${ae.slice(2)}`;
      if (ae.length <= 9) return `${ae.slice(0, 2)} ${ae.slice(2, 5)} ${ae.slice(5)}`;
      return ae;
      
    default:
      const def = numbers.slice(0, 10);
      if (def.length <= 2) return def;
      return def.match(/.{1,2}/g)?.join(' ') || def;
  }
};

export default function Settings() {
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<any>(null);
  const [deleteAdminId, setDeleteAdminId] = useState<string | null>(null);
  const [openCountrySelect, setOpenCountrySelect] = useState(false);
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

  // Fetch admins from database
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

  // Create admin mutation
  const createAdminMutation = useMutation({
    mutationFn: async (data: z.infer<typeof adminFormSchema>) => {
      const { error } = await supabase.from("admins").insert({
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone,
        country_code: data.countryCode,
        profile_image: data.profileImage,
        status: "Actif",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admins"] });
      toast({
        title: "Succès",
        description: "L'administrateur a été ajouté avec succès",
      });
      form.reset();
      setIsAddAdminOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error.message || "Une erreur est survenue lors de l'ajout de l'administrateur",
        variant: "destructive",
      });
    },
  });

  // Update admin mutation
  const updateAdminMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: z.infer<typeof adminFormSchema> }) => {
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
      queryClient.invalidateQueries({ queryKey: ["admins"] });
      toast({
        title: "Succès",
        description: "L'administrateur a été modifié avec succès",
      });
      form.reset();
      setEditingAdmin(null);
      setIsAddAdminOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error.message || "Une erreur est survenue lors de la modification",
        variant: "destructive",
      });
    },
  });

  // Delete admin mutation
  const deleteAdminMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("admins").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admins"] });
      toast({
        title: "Succès",
        description: "L'administrateur a été supprimé avec succès",
      });
      setDeleteAdminId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error.message || "Une erreur est survenue lors de la suppression",
        variant: "destructive",
      });
    },
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        form.setValue("profileImage", reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = (data: z.infer<typeof adminFormSchema>) => {
    if (editingAdmin) {
      updateAdminMutation.mutate({ id: editingAdmin.id, data });
    } else {
      createAdminMutation.mutate(data);
    }
  };

  const handleEditAdmin = (admin: any) => {
    setEditingAdmin(admin);
    form.reset({
      firstName: admin.first_name,
      lastName: admin.last_name,
      email: admin.email,
      phone: admin.phone,
      countryCode: admin.country_code,
      profileImage: admin.profile_image,
    });
    setIsAddAdminOpen(true);
  };

  const handleCloseDialog = () => {
    form.reset({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      countryCode: "+33",
      profileImage: null,
    });
    setEditingAdmin(null);
    setIsAddAdminOpen(false);
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
    setEditingAdmin(null);
    setIsAddAdminOpen(true);
  };


  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-8">Paramètres & Accès</h1>
      </div>

      <div className="max-w-6xl">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Admin</h2>
          
          <div className="relative w-64 mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher"
              className="pl-10"
            />
          </div>
        </div>

        <div className="bg-card rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border">
                <TableHead className="text-muted-foreground font-normal py-4">
                  <div className="flex items-center gap-3">
                    <span>Nom</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 hover:bg-muted"
                      onClick={handleOpenAddDialog}
                    >
                      <Plus className="h-4 w-4 text-foreground" />
                    </Button>
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground font-normal py-4">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground font-normal py-4">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Numéro de téléphone
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground font-normal py-4">
                  Statut
                </TableHead>
                <TableHead className="text-muted-foreground font-normal py-4 w-[100px]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Chargement...
                  </TableCell>
                </TableRow>
              ) : admins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Aucun administrateur trouvé
                  </TableCell>
                </TableRow>
              ) : (
                admins.map((admin) => (
                  <TableRow key={admin.id} className="border-0">
                    <TableCell className="py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                          {admin.profile_image ? (
                            <img src={admin.profile_image} alt={`${admin.first_name} ${admin.last_name}`} className="w-full h-full object-cover" />
                          ) : (
                            <User className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <span className="font-medium">{admin.first_name} {admin.last_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-5">
                      <a href={`mailto:${admin.email}`} className="text-primary hover:underline">
                        {admin.email}
                      </a>
                    </TableCell>
                    <TableCell className="py-5">{admin.country_code} {admin.phone}</TableCell>
                    <TableCell className="py-5">
                      <span className="text-success font-medium">
                        {admin.status}
                      </span>
                    </TableCell>
                    <TableCell className="py-5">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-muted"
                          onClick={() => handleEditAdmin(admin)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleteAdminId(admin.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
              {editingAdmin ? "Modifier l'admin" : "Ajouter un admin"}
            </DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <div>
                <Label className="text-sm font-normal mb-2 block">Photo de profil</Label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                    {form.watch("profileImage") ? (
                      <img src={form.watch("profileImage")!} alt="Profile" className="w-full h-full object-cover" />
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
                    onClick={() => document.getElementById('profile-image')?.click()}
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
                      <Input type="email" placeholder="Saisir l'adresse e-mail" {...field} className="h-10" />
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
                            aria-expanded={openCountrySelect}
                            className="w-[160px] h-10 justify-between"
                            type="button"
                          >
                            {form.watch("countryCode")
                              ? `${countries.find((country) => country.code === form.watch("countryCode"))?.flag} ${countries.find((country) => country.code === form.watch("countryCode"))?.label} (${form.watch("countryCode")})`
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
                                    keywords={[country.code.replace('+', ''), country.label]}
                                    onSelect={() => {
                                      form.setValue("countryCode", country.code);
                                      setOpenCountrySelect(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        form.watch("countryCode") === country.code ? "opacity-100" : "opacity-0"
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
                            const formatted = formatPhoneNumber(e.target.value, form.watch("countryCode"));
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
                  disabled={createAdminMutation.isPending || updateAdminMutation.isPending}
                >
                  Annuler
                </Button>
                <Button 
                  type="submit"
                  className="px-5 bg-foreground text-background hover:bg-foreground/90"
                  disabled={createAdminMutation.isPending || updateAdminMutation.isPending}
                >
                  {createAdminMutation.isPending || updateAdminMutation.isPending
                    ? "Enregistrement..."
                    : "Suivant"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteAdminId} onOpenChange={() => setDeleteAdminId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Cet administrateur sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAdminMutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAdminId && deleteAdminMutation.mutate(deleteAdminId)}
              disabled={deleteAdminMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAdminMutation.isPending ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
