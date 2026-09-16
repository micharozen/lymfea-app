import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDateLocale } from "@/lib/dateLocale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useUser } from "@/contexts/UserContext";
import { useOrgAdmins, type AssignableAdmin } from "@/hooks/tasks/useOrgAdmins";
import {
  useTaskComments,
  useTaskCommentMutations,
  type TaskComment,
} from "@/hooks/tasks/useTaskComments";
import { TaskCommentComposer } from "./TaskCommentComposer";
import { mentionLabel, parseMentions, type MentionTarget } from "./mentions";

interface Props {
  taskId: string;
  taskTitle: string;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Un commentaire est « modifié » dès que l'écart dépasse la seconde d'écriture. */
function isEdited(comment: TaskComment): boolean {
  return new Date(comment.updated_at).getTime() - new Date(comment.created_at).getTime() > 1000;
}

/**
 * Corps du message : les noms de collègues reconnus ressortent en surbrillance.
 * Un nom qui ne correspond plus à personne s'affiche tel quel, sans casser la
 * lecture.
 */
function CommentBody({ content, team }: { content: string; team: MentionTarget[] }) {
  return (
    <p className="text-sm whitespace-pre-wrap">
      {parseMentions(content, team).map((segment, index) =>
        segment.type === "mention" ? (
          <span
            key={index}
            className="bg-gold-100 text-gold-800 rounded px-1 py-0.5 font-medium"
          >
            @{segment.value}
          </span>
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
    </p>
  );
}

interface ItemProps {
  comment: TaskComment;
  author: AssignableAdmin | undefined;
  /** Collègues dont le nom doit ressortir dans le corps du message. */
  team: MentionTarget[];
  isOwn: boolean;
  isReply: boolean;
  editing: boolean;
  pending: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (content: string) => void;
  onReply: () => void;
  onDelete: () => void;
}

function TaskCommentItem({
  comment,
  author,
  team,
  isOwn,
  isReply,
  editing,
  pending,
  onEdit,
  onCancelEdit,
  onSubmitEdit,
  onReply,
  onDelete,
}: ItemProps) {
  const { t } = useTranslation("admin");
  const dateLocale = useDateLocale();
  const authorName = author ? mentionLabel(author) : t("tasks.comments.unknownAuthor");

  return (
    <div className="group/comment flex gap-2">
      <Avatar className={cn("mt-0.5 shrink-0", isReply ? "h-5 w-5" : "h-6 w-6")}>
        {author?.profile_image && <AvatarImage src={author.profile_image} alt={authorName} />}
        <AvatarFallback className="text-[9px]">{initials(authorName)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{authorName}</span>
          <span className="text-muted-foreground text-[11px]">
            {formatDistanceToNow(new Date(comment.created_at), {
              locale: dateLocale,
              addSuffix: true,
            })}
          </span>
          {isEdited(comment) && (
            <span className="text-muted-foreground text-[11px] italic">
              {t("tasks.comments.edited")}
            </span>
          )}
        </div>

        {editing ? (
          <div className="mt-1">
            <TaskCommentComposer
              initialValue={comment.content}
              submitLabel={t("tasks.comments.save")}
              autoFocus
              pending={pending}
              onSubmit={onSubmitEdit}
              onCancel={onCancelEdit}
            />
          </div>
        ) : (
          <>
            <CommentBody content={comment.content} team={team} />
            <div className="mt-0.5 flex gap-2 opacity-0 transition-opacity group-hover/comment:opacity-100 focus-within:opacity-100">
              {!isReply && (
                <button
                  type="button"
                  onClick={onReply}
                  className="text-muted-foreground hover:text-foreground text-[11px]"
                >
                  {t("tasks.comments.reply")}
                </button>
              )}
              {isOwn && (
                <>
                  <button
                    type="button"
                    onClick={onEdit}
                    className="text-muted-foreground hover:text-foreground text-[11px]"
                  >
                    {t("tasks.comments.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    className="text-muted-foreground hover:text-destructive text-[11px]"
                  >
                    {t("tasks.comments.delete")}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Fil de discussion d'une tâche : commentaires racines et réponses directes.
 *
 * La base ne renvoie qu'une liste plate — le regroupement se fait ici, ce qui
 * évite une seconde requête par racine.
 */
export function TaskComments({ taskId, taskTitle }: Props) {
  const { t } = useTranslation(["admin", "common"]);
  const { userId } = useUser();
  const { data: admins = [] } = useOrgAdmins();
  const { data: comments = [], isLoading } = useTaskComments(taskId);
  const authorName = useMemo(() => {
    const me = admins.find((admin) => admin.user_id === userId);
    return me ? mentionLabel(me) : t("tasks.comments.unknownAuthor");
  }, [admins, userId, t]);
  const { create, update, remove } = useTaskCommentMutations({
    taskId,
    taskTitle,
    authorName,
  });

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TaskComment | null>(null);

  const authorsById = useMemo(
    () => new Map(admins.map((admin) => [admin.user_id, admin])),
    [admins],
  );

  const threads = useMemo(() => {
    const roots = comments.filter((comment) => comment.parent_comment_id === null);
    const repliesByRoot = new Map<string, TaskComment[]>();
    for (const comment of comments) {
      if (!comment.parent_comment_id) continue;
      const bucket = repliesByRoot.get(comment.parent_comment_id) ?? [];
      bucket.push(comment);
      repliesByRoot.set(comment.parent_comment_id, bucket);
    }
    return roots.map((root) => ({ root, replies: repliesByRoot.get(root.id) ?? [] }));
  }, [comments]);

  const submitNew = (content: string, parentCommentId: string | null) => {
    create.mutate(
      { content, parentCommentId },
      {
        onSuccess: () => setReplyingTo(null),
        onError: (error) =>
          toast.error(t("tasks.comments.addError"), { description: error.message }),
      },
    );
  };

  const submitEdit = (id: string, content: string) => {
    update.mutate(
      { id, content },
      {
        onSuccess: () => setEditingId(null),
        onError: (error) =>
          toast.error(t("tasks.comments.updateError"), { description: error.message }),
      },
    );
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    remove.mutate(pendingDelete.id, {
      onError: (error) =>
        toast.error(t("tasks.comments.deleteError"), { description: error.message }),
    });
    setPendingDelete(null);
  };

  const itemProps = (comment: TaskComment, isReply: boolean) => ({
    comment,
    author: authorsById.get(comment.author_user_id ?? ""),
    team: admins,
    isOwn: Boolean(userId) && comment.author_user_id === userId,
    isReply,
    editing: editingId === comment.id,
    pending: update.isPending,
    onEdit: () => {
      setEditingId(comment.id);
      setReplyingTo(null);
    },
    onCancelEdit: () => setEditingId(null),
    onSubmitEdit: (content: string) => submitEdit(comment.id, content),
    onReply: () => {
      setReplyingTo(comment.id);
      setEditingId(null);
    },
    onDelete: () => setPendingDelete(comment),
  });

  return (
    <div className="space-y-3">
      {isLoading ? (
        <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
      ) : threads.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("tasks.comments.empty")}</p>
      ) : (
        <div className="space-y-4">
          {threads.map(({ root, replies }) => (
            <div key={root.id} className="space-y-2">
              <TaskCommentItem {...itemProps(root, false)} />

              {replies.length > 0 && (
                <div className="space-y-2 border-l pl-3 ml-3">
                  {replies.map((reply) => (
                    <TaskCommentItem key={reply.id} {...itemProps(reply, true)} />
                  ))}
                </div>
              )}

              {replyingTo === root.id && (
                <div className="ml-3 border-l pl-3">
                  <TaskCommentComposer
                    submitLabel={t("tasks.comments.reply")}
                    placeholder={t("tasks.comments.replyPlaceholder")}
                    autoFocus
                    pending={create.isPending}
                    onSubmit={(content) => submitNew(content, root.id)}
                    onCancel={() => setReplyingTo(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <TaskCommentComposer
        submitLabel={t("tasks.comments.submit")}
        pending={create.isPending}
        onSubmit={(content) => submitNew(content, null)}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-normal">
              {t("tasks.comments.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.parent_comment_id === null
                ? t("tasks.comments.deleteRootConfirm")
                : t("tasks.comments.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:buttons.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t("tasks.comments.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
