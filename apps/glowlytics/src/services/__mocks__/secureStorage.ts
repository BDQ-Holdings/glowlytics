// Test passthrough for secureStorage: keeps the persisted blob as plaintext JSON
// so store-logic tests can assert on stored content without exercising AES /
// native keychain. The real AES implementation is covered by
// services/__tests__/secureStorage.test.ts (via jest.requireActual).
export async function encryptJson(value: unknown): Promise<string> {
  return JSON.stringify(value);
}

export async function decryptJson(payload: string): Promise<unknown> {
  return JSON.parse(payload);
}
