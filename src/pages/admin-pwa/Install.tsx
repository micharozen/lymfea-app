import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, Share, Menu, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AdminPwaInstall() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <Check className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">App installée !</h1>
          <p className="text-muted-foreground">
            OOM Admin est maintenant sur votre écran d'accueil
          </p>
          <Button onClick={() => navigate("/admin-pwa")} className="w-full">
            Ouvrir l'application
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b border-border p-4">
        <div className="max-w-md mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin-pwa")}>
            ←
          </Button>
          <h1 className="text-xl font-semibold">Installer l'app</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto p-6 space-y-8">
        <div className="text-center space-y-4">
          <div className="w-24 h-24 mx-auto bg-black rounded-2xl flex items-center justify-center">
            <span className="text-white text-3xl font-bold">oom</span>
          </div>
          <h2 className="text-2xl font-bold">OOM Admin</h2>
          <p className="text-muted-foreground">
            Installez l'app pour gérer vos réservations depuis votre mobile
          </p>
        </div>

        {isIOS && (
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-lg">Sur iPhone/iPad</h3>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold">1</div>
                <div>
                  <p className="font-medium">Ouvrir le menu de partage</p>
                  <p className="text-sm text-muted-foreground">Appuyez sur le bouton <Share className="inline w-4 h-4" /> en bas de Safari</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold">2</div>
                <div>
                  <p className="font-medium">Ajouter à l'écran d'accueil</p>
                  <p className="text-sm text-muted-foreground">Scrollez et sélectionnez "Sur l'écran d'accueil"</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold">3</div>
                <div>
                  <p className="font-medium">Confirmer</p>
                  <p className="text-sm text-muted-foreground">Appuyez sur "Ajouter" en haut à droite</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isIOS && (
          <div className="space-y-4">
            {isInstallable ? (
              <Button onClick={handleInstall} className="w-full h-14 text-lg" size="lg">
                <Download className="mr-2 h-5 w-5" /> Installer l'application
              </Button>
            ) : (
              <div className="bg-card border border-border rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-lg">Sur Android</h3>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold">1</div>
                    <div>
                      <p className="font-medium">Ouvrir le menu</p>
                      <p className="text-sm text-muted-foreground">Appuyez sur <Menu className="inline w-4 h-4" /> en haut de Chrome</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold">2</div>
                    <div>
                      <p className="font-medium">Installer l'application</p>
                      <p className="text-sm text-muted-foreground">Sélectionnez "Installer l'application" ou "Ajouter à l'écran d'accueil"</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold">3</div>
                    <div>
                      <p className="font-medium">Confirmer</p>
                      <p className="text-sm text-muted-foreground">Appuyez sur "Installer"</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-muted/50 rounded-lg p-6 space-y-3">
          <h3 className="font-semibold">Avantages de l'installation</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <span>Accès instantané depuis votre écran d'accueil</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <span>Notifications push pour les réservations</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <span>Expérience plein écran</span>
            </li>
          </ul>
        </div>

        <Button variant="ghost" className="w-full" onClick={() => navigate("/admin-pwa")}>
          Continuer sans installer
        </Button>
      </div>
    </div>
  );
}
