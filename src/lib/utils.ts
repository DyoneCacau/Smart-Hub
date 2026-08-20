import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata endereço completo da clínica (rua, número, bairro, cidade, estado, CEP) */
export function formatClinicAddress(clinic: {
  address?: string | null;
  address_number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}): string {
  const parts: string[] = [];
  if (clinic.address) parts.push(clinic.address);
  if ((clinic as any).address_number) parts.push(`nº ${(clinic as any).address_number}`);
  const linha1 = parts.join(', ');
  const parts2: string[] = [];
  if ((clinic as any).neighborhood) parts2.push((clinic as any).neighborhood);
  if (clinic.city) parts2.push(clinic.city);
  if (clinic.state) parts2.push(clinic.state);
  if (clinic.zip_code) parts2.push(`CEP ${clinic.zip_code}`);
  const linha2 = parts2.join(' - ');
  const full = [linha1, linha2].filter(Boolean).join(' - ');
  return full || clinic.address || '';
}

/** Nome da clínica para exibição: "Nome" ou "Nome (Unidade X)" quando unit_name ou neighborhood existe */
export function getClinicDisplayName(clinic: { name?: string | null; unit_name?: string | null; neighborhood?: string | null }): string {
  const name = clinic?.name || '';
  const unit = (clinic as any)?.unit_name?.trim() || (clinic as any)?.neighborhood?.trim();
  if (unit) return `${name} (${unit})`;
  return name;
}

/** Componente React para nome com unidade em estilo discreto - retorna o texto formatado para uso em span */
export function formatClinicNameWithUnit(clinic: { name?: string | null; unit_name?: string | null }): { main: string; unit: string | null } {
  const name = clinic?.name || '';
  const unit = (clinic as any)?.unit_name?.trim() || null;
  return { main: name, unit };
}
