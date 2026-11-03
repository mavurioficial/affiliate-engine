/**
 * Select an account usable by link resolvers.
 * Existing Flow connections use "connected"; some legacy clients use "active".
 * Disabled, pending, or disconnected accounts must never be selected.
 */
export function selectUsableAffiliateAccount(accounts) {
  if (!Array.isArray(accounts)) return null;
  return accounts.find(a => a?.status === "active") ||
    accounts.find(a => a?.status === "connected") ||
    null;
}
