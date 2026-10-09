/** Este app não tem planos pagos: todos os módulos ficam liberados para a clínica. */
export function useSubscription() {
  return {
    hasFeature: (_feature: string) => true,
  };
}
