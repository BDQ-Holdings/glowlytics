const { logToolCall } = require('../../mcp/logger');

describe('logToolCall', () => {
  let logSpy;
  let warnSpy;
  let errSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('writes a JSON line at info level for ok status', () => {
    logToolCall({ userId: 'u1', tool: 'get_latest_scan', durationMs: 42, status: 'ok' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const arg = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(arg);
    expect(parsed).toMatchObject({
      kind: 'mcp.tool',
      userId: 'u1',
      tool: 'get_latest_scan',
      durationMs: 42,
      status: 'ok',
    });
    expect(parsed.ts).toEqual(expect.any(String));
  });

  it('uses warn for client errors (-32001/-32002/-32602)', () => {
    for (const code of [-32001, -32002, -32602]) {
      logToolCall({ userId: 'u1', tool: 't', durationMs: 1, status: 'error', code });
    }
    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('uses error for internal errors (-32603)', () => {
    logToolCall({ userId: 'u1', tool: 't', durationMs: 1, status: 'error', code: -32603 });
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not include sensitive fields like Authorization or token', () => {
    logToolCall({ userId: 'u1', tool: 't', durationMs: 1, status: 'ok', extras: { authorization: 'secret', token: 'jwt' } });
    const arg = logSpy.mock.calls[0][0];
    expect(arg.toLowerCase()).not.toContain('secret');
    expect(arg.toLowerCase()).not.toContain('jwt');
  });
});
