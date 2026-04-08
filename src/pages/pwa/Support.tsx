import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LifeBuoy, Tag, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import PwaHeader from "@/components/pwa/Header";
import { ScreenshotPicker } from "@/components/ScreenshotPicker";

export default function PwaSupport() {
  const { t } = useTranslation("pwa");
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("question");
  const [priority, setPriority] = useState("medium");
  const [screenshotUrls, setScreenshotUrls] = useState<string[]>([]);

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim()) {
      toast.error(t("support.fieldsRequired"));
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

    setSubmitting(false);

    if (error) {
      toast.error(t("support.createError"));
      return;
    }

    toast.success(t("support.created"));
    navigate("/pwa/profile");
  };

  return (
    <div className="flex flex-1 flex-col bg-background">
      <PwaHeader
        title={t("support.title")}
        showBack
        backPath="/pwa/profile"
      />

      <div className="flex-1 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),24px)]">
        <div className="space-y-4 max-w-lg mx-auto">
          {/* Subject & Description */}
          <Card className="border-l-4 border-l-gold-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <LifeBuoy className="h-4 w-4 text-gold-600" />
                {t("support.detailsTitle")}
              </CardTitle>
              <CardDescription>{t("support.detailsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("support.subject")}</Label>
                <Input
                  placeholder={t("support.subjectPlaceholder")}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("support.description")}</Label>
                <Textarea
                  placeholder={t("support.descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                />
              </div>
            </CardContent>
          </Card>

          {/* Screenshots */}
          <Card className="border-l-4 border-l-gold-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ImagePlus className="h-4 w-4 text-gold-600" />
                {t("support.screenshotsTitle")}
              </CardTitle>
              <CardDescription>{t("support.screenshotsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ScreenshotPicker
                urls={screenshotUrls}
                onUrlsChange={setScreenshotUrls}
                maxFiles={3}
                disabled={submitting}
              />
            </CardContent>
          </Card>

          {/* Category & Priority */}
          <Card className="border-l-4 border-l-gold-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Tag className="h-4 w-4 text-gold-600" />
                {t("support.classificationTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? t("support.submitting") : t("support.submit")}
          </Button>
        </div>
      </div>
    </div>
  );
}
