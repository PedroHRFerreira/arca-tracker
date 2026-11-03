// Web preview keeps the personal session token only for this tab session. Native uses SecureStore.
const key = 'arca_personal_finance_access_v1';
export async function readFinanceKey(): Promise<string | null> { return typeof window === 'undefined' ? null : window.sessionStorage.getItem(key); }
export async function writeFinanceKey(value: string): Promise<void> { window.sessionStorage.setItem(key, value); }
export async function deleteFinanceKey(): Promise<void> { if (typeof window !== 'undefined') window.sessionStorage.removeItem(key); }
