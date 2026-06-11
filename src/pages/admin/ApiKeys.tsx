import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Copy, RefreshCw, KeyRound, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useOrgApiKey,
  useRegenerateOrgApiKey,
  useRevealOrgApiKey,
} from "@/hooks/useOrgApiKey";

const PARTNER_DOCS_URL = "/docs/partners";

function maskedFromPrefix(prefix: string): string {
  return `${prefix}_${"•".repeat(24)}`;
}

export default function ApiKeys() {
  const { t } = useTranslation("admin");
  const { data: metadata, isLoading, isError } = useOrgApiKey();
  const reveal = useRevealOrgApiKey();
  const regenerate = useRegenerateOrgApiKey();

  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const handleReveal = async () => {
    if (revealedKey) {
      setRevealedKey(null);
      return;
    }
    try {
      const key = await reveal.mutateAsync();
      setRevealedKey(key);
    } catch (err) {
      toast.error(t("apiKey.revealError"), {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("apiKey.copied"));
    } catch {
      toast.error(t("apiKey.copy"));
    }
  };

  const handleCopyCurrent = async () => {
    if (revealedKey) {
      await handleCopy(revealedKey);
      return;
    }
    try {
      const key = await reveal.mutateAsync();
      setRevealedKey(key);
      await handleCopy(key);
    } catch (err) {
      toast.error(t("apiKey.revealError"), {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleRegenerate = async () => {
    setConfirmOpen(false);
    try {
      const result = await regenerate.mutateAsync();
      setRevealedKey(null);
      setNewKey(result.api_key);
      toast.success(t("apiKey.regenerateSuccess"));
    } catch (err) {
      toast.error(t("apiKey.regenerateError"), {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const displayedValue = revealedKey
    ? revealedKey
    : metadata
    ? maskedFromPrefix(metadata.key_prefix)
    : "";

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl">
        <h1 className="text-lg font-medium text-foreground mb-4 md:mb-8">
          {t("apiKey.title")}
        </h1>

        <Card className="border border-border bg-card">
          <CardContent className="p-4 md:p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-medium text-foreground">
                  {t("apiKey.title")}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("apiKey.subtitle")}
                </p>
              </div>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">{t("apiKey.loading")}</p>
            ) : isError ? (
              <p className="text-sm text-destructive">{t("apiKey.loadError")}</p>
            ) : !metadata ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("apiKey.missing")}</p>
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={regenerate.isPending}
                >
                  {t("apiKey.generate")}
                </Button>
              </div>
            ) : (
              <>
                <Label
                  htmlFor="apiKey"
                  className="text-sm text-muted-foreground mb-1.5 block"
                >
                  {t("apiKey.fieldLabel")}
                </Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="apiKey"
                      value={displayedValue}
                      readOnly
                      className="h-10 pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleReveal}
                      disabled={reveal.isPending}
                      aria-label={revealedKey ? t("apiKey.hide") : t("apiKey.reveal")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {revealedKey ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCurrent}
                    disabled={reveal.isPending}
                    className="h-10"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    {t("apiKey.copy")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmOpen(true)}
                    disabled={regenerate.isPending}
                    className="h-10"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t("apiKey.regenerate")}
                  </Button>
                </div>

                <a
                  href={PARTNER_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-6 text-sm text-primary hover:underline"
                >
                  <BookOpen className="w-4 h-4" />
                  {t("apiKey.docsLink")}
                </a>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("apiKey.regenerateDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("apiKey.regenerateDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("apiKey.regenerateDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerate}>
              {t("apiKey.regenerateDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={newKey !== null}
        onOpenChange={(open) => {
          if (!open) setNewKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("apiKey.newKeyDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("apiKey.newKeyDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-md p-3 font-mono text-sm break-all">
            {newKey}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => newKey && handleCopy(newKey)}
            >
              <Copy className="w-4 h-4 mr-2" />
              {t("apiKey.copy")}
            </Button>
            <Button onClick={() => setNewKey(null)}>
              {t("apiKey.newKeyDialog.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
