import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const BUCKET = "task-attachments";
const MAX_SIZE_MB = 5;
/** Les URLs signées ne servent qu'à l'affichage du panneau ouvert. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

interface TaskAttachmentsProps {
  /** Chemins dans le bucket privé, tels que stockés dans `tasks.attachments`. */
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * Captures d'écran d'une tâche. Le bucket est privé : on stocke le chemin et on
 * signe une URL au moment de l'affichage. En plus du sélecteur de fichier, la
 * zone accepte un collage (Cmd/Ctrl+V) — le geste naturel après une capture.
 */
export function TaskAttachments({ value, onChange }: TaskAttachmentsProps) {
  const { t } = useTranslation("admin");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Le bucket est privé : chaque vignette a besoin d'une URL signée. La clé suit
  // la liste des chemins, donc un ajout ou un retrait resigne ce qu'il faut.
  const { data: previews = {} } = useQuery({
    queryKey: ["task-attachment-urls", value],
    enabled: value.length > 0,
    staleTime: (SIGNED_URL_TTL_SECONDS / 2) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(value, SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      return Object.fromEntries(
        (data ?? [])
          .filter((item) => item.path && item.signedUrl)
          .map((item) => [item.path as string, item.signedUrl]),
      ) as Record<string, string>;
    },
  });

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t("tasks.fields.attachmentImageOnly"));
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(t("tasks.fields.attachmentTooLarge", { size: MAX_SIZE_MB }));
      return;
    }

    setUploading(true);
    try {
      const extension = file.name.split(".").pop() || file.type.split("/")[1] || "png";
      const path = `${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file);
      if (error) throw error;
      onChange([...value, path]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tasks.saveError"));
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const file = Array.from(event.clipboardData.files)[0];
    if (!file) return;
    event.preventDefault();
    await uploadFile(file);
  };

  // Le fichier reste dans le bucket : la tâche peut être annulée après coup, et
  // un orphelin coûte moins cher qu'une image supprimée par erreur.
  const removeAttachment = (path: string) => {
    onChange(value.filter((item) => item !== path));
  };

  return (
    <div
      className="space-y-2 rounded-md focus-within:ring-1 focus-within:ring-ring"
      onPaste={handlePaste}
      tabIndex={-1}
    >
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((path) => (
            <div key={path} className="group relative">
              <a href={previews[path]} target="_blank" rel="noopener noreferrer">
                <img
                  src={previews[path]}
                  alt=""
                  className="h-20 w-28 rounded border object-cover"
                />
              </a>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full opacity-0 shadow group-hover:opacity-100"
                onClick={() => removeAttachment(path)}
                aria-label={t("common.delete")}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
        )}
        {t("tasks.fields.addAttachment")}
      </Button>
      <p className="text-muted-foreground text-xs">{t("tasks.fields.attachmentHint")}</p>
    </div>
  );
}
