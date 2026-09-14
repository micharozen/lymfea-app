import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-center"
      // L'app est en viewport-fit=cover : sans safe-area, les toasts top-center
      // passent sous la barre de statut / Dynamic Island en PWA installée et
      // sont tronqués. Sonner applique --mobile-offset-* sous 600px, il faut
      // donc décaler les deux. Les autres côtés gardent leurs valeurs par défaut.
      offset={{ top: "calc(env(safe-area-inset-top, 0px) + 32px)" }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
