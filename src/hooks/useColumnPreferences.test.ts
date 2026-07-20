import { describe, expect, it } from "vitest";
import {
  MIN_COLUMN_WIDTH,
  applyOrder,
  applyWidths,
  computeResizedWidth,
  defaultPreferences,
  parsePreferences,
  reorderKeys,
} from "./useColumnPreferences";

const COLUMNS = [
  { key: "a", defaultVisible: true, width: 10 },
  { key: "b", defaultVisible: true, width: 20 },
  { key: "c", defaultVisible: false, width: 30 },
];

describe("defaultPreferences", () => {
  it("masque les colonnes non visibles par défaut", () => {
    expect(defaultPreferences(COLUMNS)).toEqual({
      order: ["a", "b", "c"],
      hidden: ["c"],
      widths: {},
    });
  });
});

describe("parsePreferences", () => {
  it("lit un contenu valide", () => {
    expect(parsePreferences('{"order":["b","a"],"hidden":["a"],"widths":{"b":42}}')).toEqual({
      order: ["b", "a"],
      hidden: ["a"],
      widths: { b: 42 },
    });
  });

  it("retourne null sur du JSON invalide ou absent", () => {
    expect(parsePreferences("{{ not json")).toBeNull();
    expect(parsePreferences(null)).toBeNull();
    expect(parsePreferences('"une chaîne"')).toBeNull();
  });

  it("écarte les entrées non-string d'un tableau par ailleurs valide", () => {
    expect(parsePreferences('{"order":["a",42,null],"hidden":"nope"}')).toEqual({
      order: ["a"],
      hidden: [],
      widths: {},
    });
  });

  // Une largeur nulle, négative ou NaN ferait disparaître la colonne sans recours.
  it("écarte les largeurs inexploitables", () => {
    const parsed = parsePreferences(
      '{"order":[],"hidden":[],"widths":{"a":0,"b":-5,"c":"12","d":8}}'
    );
    expect(parsed?.widths).toEqual({ d: 8 });
  });
});

describe("applyWidths", () => {
  it("substitue le poids redimensionné et laisse les autres intacts", () => {
    expect(applyWidths(COLUMNS, { b: 55 }).map((c) => c.width)).toEqual([10, 55, 30]);
  });

  it("ne mute pas les colonnes d'origine", () => {
    applyWidths(COLUMNS, { a: 99 });
    expect(COLUMNS[0].width).toBe(10);
  });
});

describe("computeResizedWidth", () => {
  // Table de 1000 px pour un poids total de 100 ⇒ 1 px vaut 0,1 de poids.
  it("convertit le déplacement en poids", () => {
    expect(computeResizedWidth(10, 100, 1000, 100)).toBe(20);
    expect(computeResizedWidth(10, -50, 1000, 100)).toBe(5);
  });

  it("plafonne à la largeur minimale", () => {
    expect(computeResizedWidth(10, -500, 1000, 100)).toBe(MIN_COLUMN_WIDTH);
  });

  // Avant le premier rendu la table peut mesurer 0 : ne pas diviser par zéro.
  it("est un no-op si la table n'est pas encore mesurée", () => {
    expect(computeResizedWidth(10, 100, 0, 100)).toBe(10);
  });
});

describe("applyOrder", () => {
  it("respecte l'ordre mémorisé", () => {
    expect(applyOrder(COLUMNS, ["c", "b", "a"]).map((c) => c.key)).toEqual(["c", "b", "a"]);
  });

  // Régression : une clé retirée du code ne doit pas réapparaître, et une
  // colonne ajoutée depuis la dernière visite doit atterrir à la fin.
  it("ignore les clés inconnues et complète avec les nouvelles colonnes", () => {
    expect(applyOrder(COLUMNS, ["obsolete", "b"]).map((c) => c.key)).toEqual(["b", "a", "c"]);
  });

  it("retombe sur l'ordre déclaré quand rien n'est mémorisé", () => {
    expect(applyOrder(COLUMNS, []).map((c) => c.key)).toEqual(["a", "b", "c"]);
  });

  it("ne duplique pas une clé présente deux fois dans l'ordre stocké", () => {
    expect(applyOrder(COLUMNS, ["b", "b", "a"]).map((c) => c.key)).toEqual(["b", "a", "c"]);
  });
});

describe("reorderKeys", () => {
  it("déplace vers le haut", () => {
    expect(reorderKeys(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("déplace vers le bas", () => {
    expect(reorderKeys(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  });

  it("est un no-op si la cible est inconnue ou identique", () => {
    expect(reorderKeys(["a", "b"], "a", "a")).toEqual(["a", "b"]);
    expect(reorderKeys(["a", "b"], "a", "zzz")).toEqual(["a", "b"]);
  });
});
