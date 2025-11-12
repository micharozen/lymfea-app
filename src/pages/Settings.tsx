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
                placeholder="Prénom"
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
                placeholder="Nom"
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
                              value={`${country.label} ${country.code}`}
                              keywords={[country.code.replace('+', ''), country.label]}
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
                  onChange={(e) => {
                    const formatted = formatPhoneNumber(e.target.value, countryCode);
                    setPhone(formatted);
                  }}
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
