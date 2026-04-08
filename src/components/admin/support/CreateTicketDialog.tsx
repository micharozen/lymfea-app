import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { ScreenshotPicker } from "@/components/ScreenshotPicker";

interface CreateTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateTicketDialogProps) {
  const { t } = useTranslation("admin");
  const [submitting, setSubmitting] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("question");
  const [priority, setPriority] = useState("medium");
  const [screenshotUrls, setScreenshotUrls] = useState<string[]>([]);

  const resetForm = () => {
    setSubject("");
    setDescription("");
    setCategory("question");
    setPriority("medium");
    setScreenshotUrls([]);
  };

  const handleCreate = async () => {
    if (!subject.trim() || !description.trim()) {
      toast.error(t("support.toast.fieldsRequired"));
      return;
    }

    setSubmitting(true);
    const { error } = await invokeEdgeFunction("create-support-ticket", {
      body: {
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        screenshot_urls: screenshotUrls,
      },
    });

    if (error) {
      toast.error(t("support.toast.createError"));
      setSubmitting(false);
      return;
    }

    toast.success(t("support.toast.created"));
    onOpenChange(false);
    resetForm();
    setSubmitting(false);
    onCreated();
  };

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-gold-600" />
            {t("support.createDialog.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t("support.subject")}</Label>
            <Input
              placeholder={t("support.createDialog.subjectPlaceholder")}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("support.description_label")}</Label>
            <Textarea
              placeholder={t("support.createDialog.descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("support.screenshots")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("support.screenshotsDesc")}
            </p>
            <ScreenshotPicker
              urls={screenshotUrls}
              onUrlsChange={setScreenshotUrls}
              maxFiles={3}
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("support.category")}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="question">{t("support.categories.question")}</SelectItem>
                  <SelectItem value="billing">{t("support.categories.billing")}</SelectItem>
                  <SelectItem value="booking">{t("support.categories.booking")}</SelectItem>
                  <SelectItem value="problem">{t("support.categories.problem")}</SelectItem>
                  <SelectItem value="other">{t("support.categories.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("support.priority")}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("support.priorities.low")}</SelectItem>
                  <SelectItem value="medium">{t("support.priorities.medium")}</SelectItem>
                  <SelectItem value="high">{t("support.priorities.high")}</SelectItem>
                  <SelectItem value="urgent">{t("support.priorities.urgent")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("support.createDialog.cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? t("support.createDialog.submitting") : t("support.createDialog.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
