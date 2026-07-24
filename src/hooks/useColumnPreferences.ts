import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Préférences d'affichage d'un tableau : quelles colonnes sont visibles et dans
 * quel ordre. Mémorisé en localStorage — c'est une préférence durable, au même
 * titre que `bookingsList.visibleFilters` (les *valeurs* de filtre, elles,
 * vivent en sessionStorage).
 *
 * Générique volontairement : n'importe quelle table admin peut le réutiliser
 * tant que ses colonnes exposent `key` + `defaultVisible`.
 */
export interface ColumnLike {
  key: string;
  defaultVisible: boolean;
  /** Poids relatif, normalisé sur les colonnes visibles au rendu. */
  width: number;
}

interface StoredPreferences {
  order: string[];
  hidden: string[];
  /** Poids redimensionnés par l'utilisateur, par clé. Absent = poids déclaré. */
  widths: Record<string, number>;
}

/** En deçà, une colonne devient illisible et sa poignée inatteignable. */
export const MIN_COLUMN_WIDTH = 3;

export interface ColumnPreferences<T extends ColumnLike> {
  /** Toutes les colonnes, dans l'ordre choisi (visibles et masquées). */
  orderedColumns: T[];
  /** Les colonnes visibles, dans l'ordre choisi. */
  visibleColumns: T[];
  visibleKeys: string[];
  toggle: (key: string) => void;
  reorder: (activeKey: string, overKey: string) => void;
  /** Fixe le poids d'une colonne (redimensionnement). */
  setWidth: (key: string, width: number) => void;
  /** Rend à une colonne son poids déclaré (double-clic sur la poignée). */
  resetWidth: (key: string) => void;
  reset: () => void;
  isDefault: boolean;
}

// ── Logique pure, testable sans React ni localStorage ──────────

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** Parse le contenu brut du stockage. Retourne null si inexploitable. */
export function parsePreferences(raw: string | null): StoredPreferences | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const order = Array.isArray(parsed.order) ? parsed.order.filter(isString) : [];
    const hidden = Array.isArray(parsed.hidden) ? parsed.hidden.filter(isString) : [];
    const widths: Record<string, number> = {};
    if (parsed.widths && typeof parsed.widths === "object" && !Array.isArray(parsed.widths)) {
      for (const [key, value] of Object.entries(parsed.widths)) {
        // Un poids nul ou négatif ferait disparaître la colonne sans recours.
        if (typeof value === "number" && Number.isFinite(value) && value >= MIN_COLUMN_WIDTH) {
          widths[key] = value;
        }
      }
    }
    return { order, hidden, widths };
  } catch {
    return null;
  }
}

export function defaultPreferences(columns: ColumnLike[]): StoredPreferences {
  return {
    order: columns.map((c) => c.key),
    hidden: columns.filter((c) => !c.defaultVisible).map((c) => c.key),
    widths: {},
  };
}

/** Substitue aux poids déclarés ceux que l'utilisateur a redimensionnés. */
export function applyWidths<T extends ColumnLike>(
  columns: T[],
  widths: Record<string, number>
): T[] {
  return columns.map((column) =>
    widths[column.key] === undefined ? column : { ...column, width: widths[column.key] }
  );
}

/**
 * Convertit un déplacement de souris en nouveau poids de colonne. Les poids
 * étant normalisés sur la largeur rendue, 1 px vaut `totalWidth / tableWidth`.
 */
export function computeResizedWidth(
  startWidth: number,
  deltaPx: number,
  tableWidthPx: number,
  totalWidth: number
): number {
  if (tableWidthPx <= 0 || totalWidth <= 0) return startWidth;
  const next = startWidth + deltaPx * (totalWidth / tableWidthPx);
  return Math.max(MIN_COLUMN_WIDTH, Math.round(next * 10) / 10);
}

/** Déplace `activeKey` à la position qu'occupe `overKey`. */
export function reorderKeys(keys: string[], activeKey: string, overKey: string): string[] {
  const from = keys.indexOf(activeKey);
  const to = keys.indexOf(overKey);
  if (from === -1 || to === -1 || from === to) return keys;
  const next = [...keys];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

/**
 * Applique l'ordre mémorisé aux colonnes déclarées dans le code : les clés
 * inconnues sont ignorées et les colonnes ajoutées depuis la dernière visite
 * sont ajoutées à la fin (masquées, sauf `defaultVisible`).
 */
export function applyOrder<T extends ColumnLike>(columns: T[], order: string[]): T[] {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const ordered: T[] = [];
  for (const key of order) {
    const column = byKey.get(key);
    if (column) {
      ordered.push(column);
      byKey.delete(key);
    }
  }
  for (const column of columns) {
    if (byKey.has(column.key)) ordered.push(column);
  }
  return ordered;
}

export function useColumnPreferences<T extends ColumnLike>(
  storageKey: string,
  columns: T[]
): ColumnPreferences<T> {
  const [prefs, setPrefs] = useState<StoredPreferences>(() => {
    try {
      return parsePreferences(localStorage.getItem(storageKey)) ?? defaultPreferences(columns);
    } catch {
      return defaultPreferences(columns);
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(prefs));
    } catch {
      // Quota plein ou stockage désactivé : la préférence ne survit pas au
      // rechargement, ce n'est pas une raison de casser la page.
    }
  }, [storageKey, prefs]);

  const orderedColumns = useMemo(
    () => applyWidths(applyOrder(columns, prefs.order), prefs.widths),
    [columns, prefs.order, prefs.widths]
  );

  const hiddenSet = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);

  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => !hiddenSet.has(column.key)),
    [orderedColumns, hiddenSet]
  );

  const toggle = useCallback((key: string) => {
    setPrefs((current) => ({
      ...current,
      hidden: current.hidden.includes(key)
        ? current.hidden.filter((k) => k !== key)
        : [...current.hidden, key],
    }));
  }, []);

  const reorder = useCallback(
    (activeKey: string, overKey: string) => {
      if (activeKey === overKey) return;
      setPrefs((current) => {
        // On repart de l'ordre effectif : `current.order` peut être incomplet
        // si des colonnes ont été ajoutées côté code depuis la dernière visite.
        const keys = applyOrder(columns, current.order).map((c) => c.key);
        return { ...current, order: reorderKeys(keys, activeKey, overKey) };
      });
    },
    [columns]
  );

  const setWidth = useCallback((key: string, width: number) => {
    setPrefs((current) => ({
      ...current,
      widths: { ...current.widths, [key]: Math.max(MIN_COLUMN_WIDTH, width) },
    }));
  }, []);

  const resetWidth = useCallback((key: string) => {
    setPrefs((current) => {
      if (current.widths[key] === undefined) return current;
      const { [key]: _removed, ...rest } = current.widths;
      return { ...current, widths: rest };
    });
  }, []);

  const reset = useCallback(() => {
    setPrefs(defaultPreferences(columns));
  }, [columns]);

  const isDefault = useMemo(() => {
    const { order: defaultOrder, hidden: defaultHidden } = defaultPreferences(columns);
    const sameOrder = orderedColumns.every((c, i) => c.key === defaultOrder[i]);
    const sameHidden =
      hiddenSet.size === defaultHidden.length && defaultHidden.every((k) => hiddenSet.has(k));
    return sameOrder && sameHidden && Object.keys(prefs.widths).length === 0;
  }, [columns, orderedColumns, hiddenSet, prefs.widths]);

  return {
    orderedColumns,
    visibleColumns,
    visibleKeys: visibleColumns.map((c) => c.key),
    toggle,
    reorder,
    setWidth,
    resetWidth,
    reset,
    isDefault,
  };
}
