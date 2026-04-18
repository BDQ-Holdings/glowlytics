// Manual mock for uuid (ESM-only in v13+, not compatible with Jest CJS transform)
let counter = 0;
module.exports = {
  v4: () => `mock-uuid-${++counter}`,
};
