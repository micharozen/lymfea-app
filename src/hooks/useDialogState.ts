import { useState, useCallback } from "react";

interface UseDialogStateReturn<T = string> {
  // Add dialog
  isAddOpen: boolean;
  openAdd: () => void;
  closeAdd: () => void;

  // Edit dialog
  editId: T | null;
  openEdit: (id: T) => void;
  closeEdit: () => void;
  isEditOpen: boolean;

  // Delete confirmation
  deleteId: T | null;
  openDelete: (id: T) => void;
  closeDelete: () => void;
  isDeleteOpen: boolean;
}

export function useDialogState<T = string>(): UseDialogStateReturn<T> {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editId, setEditId] = useState<T | null>(null);
  const [deleteId, setDeleteId] = useState<T | null>(null);

  const openAdd = useCallback(() => setIsAddOpen(true), []);
  const closeAdd = useCallback(() => setIsAddOpen(false), []);

  const openEdit = useCallback((id: T) => setEditId(id), []);
  const closeEdit = useCallback(() => setEditId(null), []);

  const openDelete = useCallback((id: T) => setDeleteId(id), []);
  const closeDelete = useCallback(() => setDeleteId(null), []);

  return {
    isAddOpen,
    openAdd,
    closeAdd,
    editId,
    openEdit,
    closeEdit,
    isEditOpen: editId !== null,
    deleteId,
    openDelete,
    closeDelete,
    isDeleteOpen: deleteId !== null,
  };
}
