// Manual mock for jwks-rsa (depends on jose which is ESM-only)
// In tests, CLERK_ISSUER_URL is not set, so the client is never created.
// This mock just provides the function signature so app.js can import it.
module.exports = function jwksClient(options) {
  return {
    getSigningKey: jest.fn((kid, callback) => {
      callback(new Error('Mock: no signing key'));
    }),
  };
};
