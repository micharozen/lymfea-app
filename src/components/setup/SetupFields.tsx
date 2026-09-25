import { cloneElement, isValidElement, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, FileUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { venueSetupApi } from "@/lib/venueSetup/api";
import { MAX_UPLOAD_BYTES, UPLOAD_KINDS, type UploadKind } from "@shared/venueSetup/spec";

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  const { t } = useTranslation("setup");
  // Errors are zod message keys (errors.*) of the `setup` namespace.
  const errorText = (message: string) => t(message, { defaultValue: message });
  const autoId = useId();
  // Links the label to a direct <Input>/<Textarea> child (accessibility, click-to-focus).
  const isTextControl = isValidElement(children) && (children.type === Input || children.type === Textarea);
  const controlId = htmlFor ?? (isTextControl ? ((children.props as { id?: string }).id ?? autoId) : undefined);
  const control = isTextControl && !(children.props as { id?: string }).id
    ? cloneElement(children as ReactElement<{ id?: string }>, { id: controlId })
    : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={controlId} className="text-sm font-normal">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {control}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{errorText(error)}</p>}
    </div>
  );
}

export function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="pt-2">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
    </div>
  );
}

interface SwitchRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

export function SwitchRow({ label, hint, checked, onChange }: SwitchRowProps) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-lg border p-3 cursor-pointer">
      <div>
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

interface ChoiceCardsProps<T extends string> {
  value: T | undefined;
  onChange: (value: T) => void;
  options: { value: T; label: string; hint?: string }[];
  columns?: 2 | 3 | 4;
}

export function ChoiceCards<T extends string>({ value, onChange, options, columns = 2 }: ChoiceCardsProps<T>) {
  return (
    <div
      className={cn(
        "grid gap-2 grid-cols-1",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-3",
        columns === 4 && "sm:grid-cols-4",
      )}
      role="radiogroup"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "text-left rounded-lg border p-3 transition-colors",
              selected ? "border-foreground bg-muted/60" : "hover:bg-muted/30",
            )}
          >
            <span className="flex items-center justify-between gap-2 text-sm">
              {o.label}
              {selected && <Check className="h-4 w-4 flex-shrink-0" />}
            </span>
            {o.hint && <span className="block text-xs text-muted-foreground mt-0.5">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface ToggleChipsProps<T extends string | number> {
  value: T[];
  onChange: (value: T[]) => void;
  options: { value: T; label: string }[];
}

export function ToggleChips<T extends string | number>({ value, onChange, options }: ToggleChipsProps<T>) {
  const toggle = (v: T) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const selected = value.includes(o.value);
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(o.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              selected ? "bg-foreground text-background border-foreground" : "hover:bg-muted/40",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Days of week as stored in DB: 0 = Sunday … 6 = Saturday. Displayed Monday first. */
export function DaysPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { t } = useTranslation("setup");
  const days = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: t(`days.${d}`) }));
  return <ToggleChips value={value} onChange={(v) => onChange([...v].sort())} options={days} />;
}

interface FileUploadFieldProps {
  token: string;
  kind: UploadKind;
  path: string | null | undefined;
  previewUrl?: string;
  onChange: (path: string | null) => void;
  label: string;
  hint?: string;
}

export function FileUploadField({ token, kind, path, previewUrl, onChange, label, hint }: FileUploadFieldProps) {
  const { t } = useTranslation("setup");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [localName, setLocalName] = useState<string | null>(null);
  const isImage = kind !== "font";
  const accept = (UPLOAD_KINDS[kind] as readonly string[]).join(",") + (isImage ? "" : ",.woff,.woff2,.ttf,.otf");

  const handleFile = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(t("upload.tooLarge"));
      return;
    }
    setUploading(true);
    try {
      const newPath = await venueSetupApi.upload(token, kind, file);
      setLocalPreview(isImage ? URL.createObjectURL(file) : null);
      setLocalName(file.name);
      onChange(newPath);
    } catch {
      toast.error(t("upload.failed"));
    } finally {
      setUploading(false);
    }
  };

  const shownPreview = localPreview ?? (path ? previewUrl : undefined);

  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-3">
        {isImage && (
          <div className="h-16 w-16 rounded-md border bg-muted/40 overflow-hidden flex items-center justify-center flex-shrink-0">
            {shownPreview ? (
              <img src={shownPreview} alt="" className="h-full w-full object-contain" />
            ) : (
              <FileUp className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            {path ? t("upload.replace") : t("upload.choose")}
          </Button>
          {path && !isImage && (
            <span className="text-xs text-muted-foreground truncate">{localName ?? t("upload.fileSent")}</span>
          )}
          {path && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t("upload.remove")}
              onClick={() => {
                setLocalPreview(null);
                setLocalName(null);
                onChange(null);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
      </div>
    </Field>
  );
}
