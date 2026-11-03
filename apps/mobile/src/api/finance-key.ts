import * as SecureStore from 'expo-secure-store';

const key = 'arca_personal_finance_access_v1';
export const readFinanceKey = () => SecureStore.getItemAsync(key);
export const writeFinanceKey = (value: string) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
export const deleteFinanceKey = () => SecureStore.deleteItemAsync(key);
