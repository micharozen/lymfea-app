import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UseFileUploadOptions {
  bucket?: string;
  path?: string;
  maxSizeMB?: number;
  initialUrl?: string;
  onSuccess?: (url: string) => void;
  onError?: (error: Error) => void;
}

interface UseFileUploadReturn {
  url: string;
  setUrl: (url: string) => void;
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  triggerFileSelect: () => void;
  reset: () => void;
}

export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
  const {
    bucket = "avatars",
    path = "",
    maxSizeMB = 5,
    initialUrl = "",
    onSuccess,
    onError,
  } = options;

  const [url, setUrl] = useState<string>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
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

    try {
      setUploading(true);
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = path ? `${path}${fileName}` : fileName;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      setUrl(publicUrl);
      toast.success("Image téléchargée avec succès");
      onSuccess?.(publicUrl);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Upload failed");
      toast.error("Erreur lors du téléchargement de l'image");
      console.error(error);
      onError?.(err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [bucket, path, maxSizeMB, onSuccess, onError]);

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const reset = useCallback(() => {
    setUrl(initialUrl);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [initialUrl]);

  return {
    url,
    setUrl,
    uploading,
    fileInputRef,
    handleUpload,
    triggerFileSelect,
    reset,
  };
}
