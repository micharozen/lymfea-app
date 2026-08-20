import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  useTreatmentCategories,
  type TreatmentCategory,
} from "@/hooks/useTreatmentCategories";

interface CategoryQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hotelId: string | null | undefined;
  defaultIsAddon?: boolean;
  hideIsAddon?: boolean;
  onCreated?: (category: TreatmentCategory) => void;
}

export function CategoryQuickCreateDialog({
  open,
  onOpenChange,
  hotelId,
  defaultIsAddon = false,
  hideIsAddon = false,
  onCreated,
}: CategoryQuickCreateDialogProps) {
  const { t } = useTranslation(["admin", "common"]);
  const { addCategory, updateNameEn, toggleAddon, isAdding } =
    useTreatmentCategories(hotelId);

  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [isAddon, setIsAddon] = useState(defaultIsAddon);

  const reset = () => {
    setName("");
    setNameEn("");
    setIsAddon(defaultIsAddon);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hotelId || !name.trim()) return;

    const created = await addCategory(name.trim());
    if (!created) return;

    if (nameEn.trim()) {
      await updateNameEn(created.id, nameEn.trim());
    }
    if (isAddon) {
      await toggleAddon(created.id, true);
    }

    onCreated?.({ ...created, name_en: nameEn.trim() || null, is_addon: isAddon } as TreatmentCategory);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('categoryQuickCreate.title')}</DialogTitle>
            <DialogDescription>
              {t('categoryQuickCreate.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="quick-cat-name">{t('categoryQuickCreate.nameFr')}</Label>
              <Input
                id="quick-cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('categoryQuickCreate.namePlaceholder')}
                autoFocus
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-cat-name-en">{t('categoryQuickCreate.nameEn')}</Label>
              <Input
                id="quick-cat-name-en"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder={t('categoryQuickCreate.nameEnPlaceholder')}
              />
            </div>

            {!hideIsAddon && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="quick-cat-addon">{t('categoryQuickCreate.addonLabel')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('categoryQuickCreate.addonHelp')}
                  </p>
                </div>
                <Switch
                  id="quick-cat-addon"
                  checked={isAddon}
                  onCheckedChange={setIsAddon}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isAdding}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button type="submit" disabled={isAdding || !name.trim() || !hotelId}>
              {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('categoryQuickCreate.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
