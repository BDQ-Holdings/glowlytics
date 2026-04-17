const { ZodError } = require('zod');

const CODES = {
  UNAUTHORIZED: -32001,
  RATE_LIMITED: -32002,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
};

class UnauthorizedError extends Error {
  constructor(msg = 'Unauthorized') { super(msg); this.code = CODES.UNAUTHORIZED; }
}
class RateLimitError extends Error {
  constructor(msg = 'Rate limit exceeded') { super(msg); this.code = CODES.RATE_LIMITED; }
}

function classify(err) {
  if (err instanceof ZodError) return { code: CODES.INVALID_PARAMS, message: 'Invalid params' };
  if (err instanceof UnauthorizedError) return { code: CODES.UNAUTHORIZED, message: 'Unauthorized' };
  if (err instanceof RateLimitError) return { code: CODES.RATE_LIMITED, message: 'Rate limit exceeded' };
  return { code: CODES.INTERNAL, message: 'Internal error' };
}

module.exports = { CODES, UnauthorizedError, RateLimitError, classify };
