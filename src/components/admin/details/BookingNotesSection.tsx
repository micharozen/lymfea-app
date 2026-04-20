import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Send, Loader2, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "@/hooks/use-toast";

interface BookingNotesSectionProps {
  bookingId: string;
}

export function BookingNotesSection({ bookingId }: BookingNotesSectionProps) {
  const [content, setContent] = useState("");
  const { userId } = useUser();
  const queryClient = useQueryClient();

  const { data: notes = [] } = useQuery({
    queryKey: ["booking-notes", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_notes")
        .select("id, content, author_name, user_id, created_at")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const addNote = useMutation({
    mutationFn: async (noteContent: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const { error } = await supabase.from("booking_notes").insert({
        booking_id: bookingId,
        user_id: user.id,
        author_name: user.email ?? "Inconnu",
        content: noteContent,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["booking-notes", bookingId] });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible d'ajouter la note", variant: "destructive" });
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from("booking_notes").delete().eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-notes", bookingId] });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de supprimer la note", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    addNote.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full gap-3">
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground flex-1 flex items-center justify-center">
          Aucune note interne
        </p>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto">
          {notes.map((note, index) => (
            <div key={note.id} className={`rounded-lg p-3 ${index % 2 === 0 ? "bg-muted" : "bg-gold-100"}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium">{note.author_name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(note.created_at), { locale: fr, addSuffix: true })}
                  </span>
                  {note.user_id === userId && (
                    <button
                      onClick={() => deleteNote.mutate(note.id)}
                      className="text-muted-foreground/50 hover:text-destructive transition-colors ml-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap">{note.content}</p>
            </div>
          ))}
        </div>
      )}

      {userId && (
        <div className="shrink-0 pt-2 pb-1 border-t space-y-1">
          <div className="flex gap-2 items-end">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ajouter une note…"
              rows={2}
              className="resize-none border-muted-foreground/30 focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSubmit}
              disabled={!content.trim() || addNote.isPending}
            >
              {addNote.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Entrée pour envoyer · Shift+Entrée pour un retour à la ligne</p>
        </div>
      )}
    </div>
  );
}
