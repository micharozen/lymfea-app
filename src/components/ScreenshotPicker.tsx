import { useMultiFileUpload } from "@/hooks/useMultiFileUpload";
import { Button } from "@/components/ui/button";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

interface ScreenshotPickerProps {
  urls: string[];
  onUrlsChange: (urls: string[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

export function ScreenshotPicker({
  urls,
  onUrlsChange,
  maxFiles = 3,
  disabled = false,
}: ScreenshotPickerProps) {
  const {
    urls: internalUrls,
    uploading,
    fileInputRef,
    handleUpload,
    triggerFileSelect,
    removeUrl,
  } = useMultiFileUpload({ maxFiles });

  // Sync internal state to parent
  useEffect(() => {
    if (JSON.stringify(internalUrls) !== JSON.stringify(urls)) {
      onUrlsChange(internalUrls);
    }
  }, [internalUrls, onUrlsChange, urls]);

  const canAddMore = urls.length < maxFiles && !uploading && !disabled;

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />

      {urls.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {urls.map((url, index) => (
            <div
              key={url}
              className="relative group aspect-video rounded-md overflow-hidden border border-border bg-muted"
            >
              <img
                src={url}
                alt={`Screenshot ${index + 1}`}
                className="h-full w-full object-cover"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeUrl(index)}
                  className={cn(
                    "absolute top-1 right-1 h-5 w-5 rounded-full",
                    "bg-destructive text-destructive-foreground",
                    "flex items-center justify-center",
                    "opacity-0 group-hover:opacity-100 transition-opacity"
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={triggerFileSelect}
        disabled={!canAddMore}
        className="gap-2"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImagePlus className="h-4 w-4" />
        )}
        {uploading
          ? "Envoi..."
          : `Ajouter une capture (${urls.length}/${maxFiles})`}
      </Button>
    </div>
  );
}
