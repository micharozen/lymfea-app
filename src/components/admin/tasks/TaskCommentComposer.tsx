import { useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useOrgAdmins, type AssignableAdmin } from "@/hooks/tasks/useOrgAdmins";
import { applyMention, findActiveMention, mentionLabel } from "./mentions";

interface Props {
  /** Corps initial — non vide en édition. */
  initialValue?: string;
  submitLabel: string;
  placeholder?: string;
  autoFocus?: boolean;
  pending?: boolean;
  onSubmit: (content: string) => void;
  /** Absent sur le composer principal, qui ne s'annule pas. */
  onCancel?: () => void;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Saisie d'un commentaire, avec autocomplétion des mentions.
 *
 * Le même composant sert la saisie principale, la réponse et l'édition : seuls
 * le libellé du bouton et la présence d'« Annuler » changent.
 *
 * Envoi au Cmd/Ctrl+Entrée, contrairement aux notes de réservation où le
 * simple Entrée suffit : un commentaire de tâche tient souvent sur plusieurs
 * lignes.
 */
export function TaskCommentComposer({
  initialValue = "",
  submitLabel,
  placeholder,
  autoFocus,
  pending,
  onSubmit,
  onCancel,
}: Props) {
  const { t } = useTranslation("admin");
  const { data: admins = [] } = useOrgAdmins();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initialValue);
  const [mention, setMention] = useState<{ query: string; start: number; end: number } | null>(
    null,
  );
  const [highlighted, setHighlighted] = useState(0);

  const suggestions = mention
    ? admins
        .filter((admin) =>
          `${mentionLabel(admin)} ${admin.email}`
            .toLowerCase()
            .includes(mention.query.toLowerCase()),
        )
        .slice(0, 6)
    : [];
  const open = mention !== null && suggestions.length > 0;

  const syncMention = (nextValue: string, cursor: number) => {
    setMention(findActiveMention(nextValue, cursor));
    setHighlighted(0);
  };

  const pick = (admin: AssignableAdmin) => {
    if (!mention) return;
    const next = applyMention(value, mention, admin);
    setValue(next.value);
    setMention(null);
    // Le curseur doit repartir après le jeton : React réécrit la valeur au
    // rendu suivant, on le repositionne donc une fois le DOM à jour.
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(next.cursor, next.cursor);
    });
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || pending) return;
    onSubmit(trimmed);
    setValue("");
    setMention(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlighted((index) => (index + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted((index) => (index - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(suggestions[highlighted]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          autoFocus={autoFocus}
          rows={2}
          placeholder={placeholder ?? t("tasks.comments.placeholder")}
          className="resize-none text-sm"
          onChange={(event) => {
            setValue(event.target.value);
            syncMention(event.target.value, event.target.selectionStart ?? 0);
          }}
          onKeyUp={(event) => {
            const node = event.currentTarget;
            syncMention(node.value, node.selectionStart ?? 0);
          }}
          onClick={(event) => {
            const node = event.currentTarget;
            syncMention(node.value, node.selectionStart ?? 0);
          }}
          onBlur={() => setMention(null)}
          onKeyDown={handleKeyDown}
        />

        {open && (
          // Liste ancrée sous le champ plutôt qu'en Popover : le Popover vole
          // le focus du textarea, ce qui interrompt la frappe de la mention.
          <ul className="bg-popover absolute top-full left-0 z-50 mt-1 w-64 overflow-hidden rounded-md border shadow-md">
            {suggestions.map((admin, index) => (
              <li key={admin.user_id}>
                <button
                  type="button"
                  // mousedown précède blur : sans cela, le champ perd le focus
                  // et la liste se ferme avant que le clic n'aboutisse.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(admin);
                  }}
                  onMouseEnter={() => setHighlighted(index)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm",
                    index === highlighted && "bg-accent",
                  )}
                >
                  <Avatar className="h-5 w-5">
                    {admin.profile_image && (
                      <AvatarImage src={admin.profile_image} alt={mentionLabel(admin)} />
                    )}
                    <AvatarFallback className="text-[9px]">
                      {initials(mentionLabel(admin))}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{mentionLabel(admin)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-[10px]">{t("tasks.comments.hint")}</p>
        <div className="flex items-center gap-1.5">
          {onCancel && (
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              {t("tasks.comments.cancel")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={!value.trim() || pending}
          >
            {pending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
