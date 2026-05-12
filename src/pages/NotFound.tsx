import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-6xl font-bold tracking-tight">404</h1>
        <p className="mb-2 text-xl font-medium">
          {t("notFound.title", "Page introuvable")}
        </p>
        <p className="mb-6 text-sm text-muted-foreground break-all">
          {t("notFound.description", "La page demandée n'existe pas :")}{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {location.pathname}
          </code>
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("notFound.back", "Retour")}
          </Button>
          <Button onClick={() => navigate("/")}>
            <Home className="mr-2 h-4 w-4" />
            {t("notFound.home", "Accueil")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
