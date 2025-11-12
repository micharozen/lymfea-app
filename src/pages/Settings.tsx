import { Search, Plus, User, Mail, Phone, X, Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
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
import { cn } from "@/lib/utils";

const countries = [
  { code: "+33", label: "France", flag: "🇫🇷" },
  { code: "+39", label: "Italie", flag: "🇮🇹" },
  { code: "+1", label: "USA", flag: "🇺🇸" },
  { code: "+44", label: "UK", flag: "🇬🇧" },
  { code: "+49", label: "Allemagne", flag: "🇩🇪" },
  { code: "+34", label: "Espagne", flag: "🇪🇸" },
  { code: "+41", label: "Suisse", flag: "🇨🇭" },
  { code: "+32", label: "Belgique", flag: "🇧🇪" },
];

export default function Settings() {
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+33");
  const [openCountrySelect, setOpenCountrySelect] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const admins = [
    {
      id: 1,
      name: "Tom Uzan",
      email: "tom@oomworld.com",
      phone: "+33 6 14 21 64 42",
      status: "Actif",
    },
  ];

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

        <div className="bg-card rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground font-normal py-4">
                  <div className="flex items-center gap-3">
                    <span>Nom</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 hover:bg-muted"
                      onClick={() => setIsAddAdminOpen(true)}
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((admin) => (
                <TableRow key={admin.id} className="border-0 hover:bg-transparent">
                  <TableCell className="py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <span className="font-medium">{admin.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-5">
                    <a href={`mailto:${admin.email}`} className="text-primary hover:underline">
                      {admin.email}
                    </a>
                  </TableCell>
                  <TableCell className="py-5">{admin.phone}</TableCell>
                  <TableCell className="py-5">
                    <span className="text-success font-medium">
                      {admin.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={isAddAdminOpen} onOpenChange={setIsAddAdminOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Ajouter un admin</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-normal mb-2 block">Photo de profil</Label>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                  {profileImage ? (
                    <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
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

            <div>
              <Label htmlFor="firstName" className="text-sm font-normal mb-1.5 block">
                Prénom
              </Label>
              <Input
                id="firstName"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="h-10"
              />
            </div>

            <div>
              <Label htmlFor="lastName" className="text-sm font-normal mb-1.5 block">
                Nom
              </Label>
              <Input
                id="lastName"
                placeholder="Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="h-10"
              />
            </div>

            <div>
              <Label htmlFor="email" className="text-sm font-normal mb-1.5 block">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Saisir l'adresse e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
              />
            </div>

            <div>
              <Label htmlFor="phone" className="text-sm font-normal mb-1.5 block">
                Téléphone
              </Label>
              <div className="flex gap-2">
                <Popover open={openCountrySelect} onOpenChange={setOpenCountrySelect}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openCountrySelect}
                      className="w-[160px] h-10 justify-between"
                    >
                      {countryCode
                        ? `${countries.find((country) => country.code === countryCode)?.flag} ${countries.find((country) => country.code === countryCode)?.label} (${countryCode})`
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
                              value={country.label}
                              onSelect={() => {
                                setCountryCode(country.code);
                                setOpenCountrySelect(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  countryCode === country.code ? "opacity-100" : "opacity-0"
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
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-10 flex-1"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button 
              variant="outline" 
              onClick={() => setIsAddAdminOpen(false)}
              className="px-5"
            >
              Annuler
            </Button>
            <Button 
              onClick={() => {
                // Handle form submission
                setIsAddAdminOpen(false);
              }}
              className="px-5 bg-foreground text-background hover:bg-foreground/90"
            >
              Suivant
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
