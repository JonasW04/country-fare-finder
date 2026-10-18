/** Removes credential values from any text before it can reach logs, notes or error messages. */
export function maskSecrets(text: string, secrets: string[]): string {
  return secrets.reduce((acc, s) => (s ? acc.split(s).join("***") : acc), text);
}
