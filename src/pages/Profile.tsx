import { User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Profile() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold text-foreground mb-8">Profile</h1>

        <Card className="border border-border bg-card shadow-sm">
          <CardContent className="p-8">
            {/* Photo de profil */}
            <div className="flex items-center gap-6 mb-8">
              <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
                <User className="w-12 h-12 text-muted-foreground" />
              </div>
              <Button variant="outline" size="sm">
                Upload Image
              </Button>
            </div>

            {/* Informations utilisateur */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  First name
                </label>
                <p className="text-base font-medium text-foreground">Tom Uzan</p>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Role
                </label>
                <p className="text-base font-medium text-foreground">Admin</p>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Phone
                </label>
                <p className="text-base font-medium text-foreground">+33614216442</p>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Email
                </label>
                <p className="text-base font-medium text-foreground">tom@oomworld.com</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
