import { StatCard } from "@/components/StatCard";
import {
  Calendar,
  Users,
  TrendingUp,
  DollarSign,
  Package,
  Building2,
} from "lucide-react";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Tableau de bord
          </h1>
          <p className="text-muted-foreground">
            Vue d'ensemble de votre activité OOM
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <StatCard
            title="Réservations aujourd'hui"
            value={24}
            icon={Calendar}
            trend={{ value: "12%", isPositive: true }}
          />
          <StatCard
            title="Clients actifs"
            value={156}
            icon={Users}
            trend={{ value: "8%", isPositive: true }}
          />
          <StatCard
            title="Revenu du mois"
            value="€45,230"
            icon={DollarSign}
            trend={{ value: "15%", isPositive: true }}
          />
          <StatCard
            title="Taux d'occupation"
            value="87%"
            icon={TrendingUp}
            trend={{ value: "5%", isPositive: true }}
          />
          <StatCard
            title="Commandes en attente"
            value={12}
            icon={Package}
            trend={{ value: "3%", isPositive: false }}
          />
          <StatCard
            title="Hôtels actifs"
            value={8}
            icon={Building2}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card p-6 rounded-lg border border-border shadow-sm">
            <h3 className="text-xl font-semibold text-card-foreground mb-4">
              Activité récente
            </h3>
            <div className="space-y-3">
              {[
                { text: "Nouvelle réservation - Spa Déluxe", time: "Il y a 5 min" },
                { text: "Commande livrée - Hôtel Majestic", time: "Il y a 15 min" },
                { text: "Nouveau client enregistré", time: "Il y a 1h" },
                { text: "Paiement reçu - €1,250", time: "Il y a 2h" },
              ].map((activity, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <span className="text-sm text-card-foreground">{activity.text}</span>
                  <span className="text-xs text-muted-foreground">{activity.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card p-6 rounded-lg border border-border shadow-sm">
            <h3 className="text-xl font-semibold text-card-foreground mb-4">
              Top services
            </h3>
            <div className="space-y-3">
              {[
                { name: "Massage relaxant", bookings: 45 },
                { name: "Coupe & coiffage", bookings: 38 },
                { name: "Soin du visage", bookings: 32 },
                { name: "Manucure", bookings: 28 },
              ].map((service, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2"
                >
                  <span className="text-sm text-card-foreground">{service.name}</span>
                  <span className="text-sm font-medium text-primary">
                    {service.bookings} réservations
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
