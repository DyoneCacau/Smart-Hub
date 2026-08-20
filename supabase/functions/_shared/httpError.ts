/** Erro HTTP tipado, compartilhado pelas Edge Functions de integrações. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message)
  }
}
