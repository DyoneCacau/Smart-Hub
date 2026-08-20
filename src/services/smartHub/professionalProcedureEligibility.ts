/**
 * Elegibilidade profissional ↔ procedimento (espelho da regra do booking).
 * Pura / testável — usada no frontend e documentada para a Edge Function.
 */

export type CatalogProfessional = { id: string; name: string };

export type CatalogProcedureInput = {
  id: string;
  name: string;
  duration_minutes: number;
};

export type CatalogProfessionalInput = {
  id: string;
  name: string;
  performs_all_procedures: boolean;
};

export type ProfessionalProcedureLink = {
  professional_id: string;
  procedure_id: string;
};

export function isProfessionalEligibleForProcedure(
  professional: { performs_all_procedures?: boolean | null },
  procedureId: string,
  linkedProcedureIds: Iterable<string>
): boolean {
  if (professional.performs_all_procedures !== false) {
    return true;
  }
  const set =
    linkedProcedureIds instanceof Set
      ? linkedProcedureIds
      : new Set(linkedProcedureIds);
  return set.has(procedureId);
}

/**
 * Monta catálogo público: cada procedimento só com profissionais elegíveis.
 * Não inclui campos internos (telefone, CRO, clínica, etc.).
 */
export function buildBookingCatalogProcedures(
  procedures: CatalogProcedureInput[],
  professionals: CatalogProfessionalInput[],
  links: ProfessionalProcedureLink[]
): Array<CatalogProcedureInput & { professionals: CatalogProfessional[] }> {
  const linksByProfessional = new Map<string, Set<string>>();
  for (const link of links) {
    const set = linksByProfessional.get(link.professional_id) || new Set<string>();
    set.add(link.procedure_id);
    linksByProfessional.set(link.professional_id, set);
  }

  return procedures.map((proc) => {
    const eligible = professionals
      .filter((prof) =>
        isProfessionalEligibleForProcedure(
          prof,
          proc.id,
          linksByProfessional.get(prof.id) || new Set()
        )
      )
      .map((prof) => ({ id: prof.id, name: prof.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return {
      id: proc.id,
      name: proc.name,
      duration_minutes: proc.duration_minutes,
      professionals: eligible,
    };
  });
}
