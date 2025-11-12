import { User } from "lucide-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Profile() {
  const [isEditing, setIsEditing] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("Tom");
  const [lastName, setLastName] = useState("Uzan");
  const [phone, setPhone] = useState("+33614216442");
  const [email, setEmail] = useState("tom@oomworld.com");

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

  const handleSave = () => {
    // Save profile logic here
    toast.success("Profil mis à jour avec succès");
    setIsEditing(false);
  };

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
