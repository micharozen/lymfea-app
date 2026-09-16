import { describe, expect, it } from "vitest";
import { buildPersonSearchFilter } from "@shared/db";

describe("buildPersonSearchFilter", () => {
  it("cherche sur chaque colonne pour un seul mot", () => {
    const filter = buildPersonSearchFilter("jean", "first_name", "last_name", ["phone", "email"]);
    expect(filter).toBe(
      "first_name.ilike.%jean%,last_name.ilike.%jean%,phone.ilike.%jean%,email.ilike.%jean%",
    );
  });

  it("gère « Prénom Nom » en testant les deux ordres", () => {
    const filter = buildPersonSearchFilter("Jean Dupont", "first_name", "last_name");
    expect(filter).toContain("and(first_name.ilike.%Jean%,last_name.ilike.%Dupont%)");
    expect(filter).toContain("and(first_name.ilike.%Dupont%,last_name.ilike.%Jean%)");
  });

  it("trouve aussi « Nom Prénom »", () => {
    const filter = buildPersonSearchFilter("Dupont Jean", "first_name", "last_name");
    expect(filter).toContain("and(first_name.ilike.%Jean%,last_name.ilike.%Dupont%)");
  });

  it("rattache les noms composés au nom de famille", () => {
    const filter = buildPersonSearchFilter("Jean De La Fontaine", "first_name", "last_name");
    expect(filter).toContain("and(first_name.ilike.%Jean%,last_name.ilike.%De La Fontaine%)");
  });

  it("neutralise les caractères qui casseraient le filtre PostgREST", () => {
    const filter = buildPersonSearchFilter("Dupont, Jean", "first_name", "last_name");
    expect(filter).not.toContain("Dupont,");
    expect(filter).toContain("and(first_name.ilike.%Dupont%,last_name.ilike.%Jean%)");
  });

  it("ignore une saisie trop courte", () => {
    expect(buildPersonSearchFilter("j", "first_name", "last_name")).toBeNull();
    expect(buildPersonSearchFilter("  ", "first_name", "last_name")).toBeNull();
  });
});
