import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { Pencil } from "lucide-react";

/**
 * Habillage commun des valeurs éditables : au repos elles se lisent comme du
 * texte, au survol un fond et un liseré pointillé apparaissent — sans quoi rien
 * n'indique qu'un champ se modifie d'un clic.
 */
const EDITABLE =
  "group relative -mx-2 w-full rounded-md border border-dashed border-transparent px-2 py-1 text-left " +
  "transition-colors hover:border-border hover:bg-muted cursor-text";

/** Crayon discret, révélé au survol. */
function EditHint() {
  return (
    <Pencil
      className="text-muted-foreground pointer-events-none absolute top-1.5 right-1.5 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100"
      aria-hidden
    />
  );
}

/**
 * Édition inline, à la Jira : la valeur se lit comme du texte, un clic la rend
 * éditable, et elle s'enregistre en sortant du champ.
 *
 * Les gestes les plus fréquents sur une tâche sont des micro-modifications
 * (changer un statut, se l'assigner, corriger une date). Les faire passer par
 * une bascule globale du formulaire coûterait deux clics à chaque fois.
 */

interface InlineTextProps {
  value: string | null;
  onSave: (value: string | null) => void;
  placeholder: string;
  multiline?: boolean;
  className?: string;
  /** Rendu de la valeur en lecture ; par défaut le texte brut. */
  renderValue?: (value: string) => ReactNode;
}

export function InlineText({
  value,
  onSave,
  placeholder,
  multiline,
  className,
  renderValue,
}: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next === (value ?? "").trim()) return;
    onSave(next || null);
  };

  if (editing) {
    const shared = {
      ref: inputRef,
      value: draft,
      onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
      onBlur: commit,
      placeholder,
    };
    return multiline ? (
      <Textarea
        {...shared}
        rows={4}
        // Échap annule ; Cmd/Ctrl+Entrée valide sans quitter le champ à la souris.
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
        }}
      />
    ) : (
      <Input
        {...shared}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
          if (e.key === "Enter") commit();
        }}
      />
    );
  }

  const empty = !value?.trim();
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(EDITABLE, "pr-6", empty && "text-muted-foreground italic", className)}
    >
      {empty ? placeholder : renderValue ? renderValue(value!) : value}
      <EditHint />
    </button>
  );
}

interface InlineSelectProps {
  value: string | null;
  options: SelectFieldOption[];
  onSave: (value: string | null) => void;
  placeholder: string;
  /** Rendu de la valeur en lecture (badge, avatar…). */
  renderValue?: (option: SelectFieldOption | undefined) => ReactNode;
  /** Autorise le retour à « non renseigné ». */
  clearable?: boolean;
}

export function InlineSelect({
  value,
  options,
  onSave,
  placeholder,
  renderValue,
  clearable = true,
}: InlineSelectProps) {
  const { t } = useTranslation("admin");
  const [editing, setEditing] = useState(false);

  if (editing) {
    const withClear: SelectFieldOption[] = clearable
      ? [{ value: "__none__", label: t("tasks.fields.clearValue") }, ...options]
      : options;
    return (
      <SelectField
        defaultOpen
        options={withClear}
        value={value ?? undefined}
        onChange={(next) => {
          setEditing(false);
          const resolved = next === "__none__" ? null : next;
          if (resolved !== (value ?? null)) onSave(resolved);
        }}
        placeholder={placeholder}
        className="h-8"
      />
    );
  }

  const selected = options.find((option) => option.value === value);
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        EDITABLE,
        "flex min-w-0 items-center gap-1.5 pr-5",
        !selected && "text-muted-foreground italic",
      )}
    >
      {renderValue ? renderValue(selected) : (selected?.label ?? placeholder)}
      <EditHint />
    </button>
  );
}

interface InlineDateProps {
  value: string | null;
  onSave: (value: string | null) => void;
  placeholder: string;
  /** Rendu de la date en lecture (couleur d'échéance dépassée, par exemple). */
  renderValue?: (value: string) => ReactNode;
}

export function InlineDate({ value, onSave, placeholder, renderValue }: InlineDateProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Input
        type="date"
        autoFocus
        defaultValue={value ?? ""}
        className="h-8"
        onBlur={(e) => {
          setEditing(false);
          const next = e.target.value || null;
          if (next !== value) onSave(next);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(EDITABLE, "pr-6", !value && "text-muted-foreground italic")}
    >
      {value ? (renderValue ? renderValue(value) : value) : placeholder}
      <EditHint />
    </button>
  );
}
