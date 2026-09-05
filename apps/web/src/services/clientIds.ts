/**
 * Cryptographically random client-generated ID, used only as a correlation
 * key (attemptId / operationId / resumeOperationId) so a retried request
 * reaches the backend's idempotency guard instead of duplicating an effect.
 * Never a credential and never persisted beyond the one logical operation
 * it identifies.
 */
export function generateClientId(): string {
  return crypto.randomUUID();
}
