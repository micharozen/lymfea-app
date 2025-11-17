import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Scissors, Calendar, Star, Clock } from "lucide-react";
import oomLogo from "@/assets/oom-monogram.svg";

const PwaWelcome = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Logo */}
      <div className="bg-black text-white p-6 text-center">
        <img 
          src={oomLogo} 
          alt="OOM" 
          className="w-20 h-20 mx-auto mb-4"
        />
        <h1 className="text-2xl font-bold">Beauty Room Services</h1>
        <p className="text-sm text-gray-300 mt-2">
          Votre espace professionnel pour gérer vos prestations
        </p>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Features */}
        <div className="space-y-4">
          <Card className="p-4 flex items-start gap-4">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-black text-white flex-shrink-0">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold">Gérez vos réservations</h3>
              <p className="text-sm text-muted-foreground">
                Consultez et gérez toutes vos réservations en temps réel
              </p>
            </div>
          </Card>

          <Card className="p-4 flex items-start gap-4">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-black text-white flex-shrink-0">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold">Planning optimisé</h3>
              <p className="text-sm text-muted-foreground">
                Visualisez votre emploi du temps de la journée
              </p>
            </div>
          </Card>

          <Card className="p-4 flex items-start gap-4">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-black text-white flex-shrink-0">
              <Scissors className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold">Prestations détaillées</h3>
              <p className="text-sm text-muted-foreground">
                Accédez aux informations complètes de chaque prestation
              </p>
            </div>
          </Card>

          <Card className="p-4 flex items-start gap-4">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-black text-white flex-shrink-0">
              <Star className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold">Suivi en direct</h3>
              <p className="text-sm text-muted-foreground">
                Mettez à jour le statut de vos prestations instantanément
              </p>
            </div>
          </Card>
        </div>

        {/* CTA Button */}
        <div className="pt-4">
          <Button
            onClick={() => navigate("/pwa/login")}
            className="w-full h-14 text-lg bg-black hover:bg-gray-800"
            size="lg"
          >
            Commencer
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground px-4">
          En continuant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité
        </p>
      </div>
    </div>
  );
};

export default PwaWelcome;
