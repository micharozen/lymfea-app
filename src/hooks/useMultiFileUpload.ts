import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UseMultiFileUploadOptions {
  bucket?: string;
  path?: string;
  maxSizeMB?: number;
  maxFiles?: number;
}

interface UseMultiFileUploadReturn {
  urls: string[];
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  triggerFileSelect: () => void;
  removeUrl: (index: number) => void;
  reset: () => void;
  canAddMore: boolean;
}

export function useMultiFileUpload(
  options: UseMultiFileUploadOptions = {}
): UseMultiFileUploadReturn {
  const {
    bucket = "avatars",
    path = "tickets/",
    maxSizeMB = 5,
    maxFiles = 3,
  } = options;

  const [urls, setUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAddMore = urls.length < maxFiles;

  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        toast.error("Le fichier doit être une image");
        return;
      }

      if (file.size > maxSizeMB * 1024 * 1024) {
        toast.error(`L'image ne doit pas dépasser ${maxSizeMB}MB`);
        return;
      }

      if (urls.length >= maxFiles) {
        toast.error(`Maximum ${maxFiles} captures d'écran`);
        return;
      }

      try {
        setUploading(true);
        const fileExt = file.name.split(".").pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${path}${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from(bucket).getPublicUrl(filePath);

        setUrls((prev) => [...prev, publicUrl]);
      } catch (error) {
        toast.error("Erreur lors du téléchargement de l'image");
        console.error(error);
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [bucket, path, maxSizeMB, maxFiles, urls.length]
  );

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const removeUrl = useCallback((index: number) => {
    setUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reset = useCallback(() => {
    setUrls([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return {
    urls,
    uploading,
    fileInputRef,
    handleUpload,
    triggerFileSelect,
    removeUrl,
    reset,
    canAddMore,
  };
}
