const CLIENT_ERROR_CODES = new Set([-32001, -32002, -32602]);

function levelFor({ status, code }) {
  if (status === 'ok') return 'info';
  if (typeof code === 'number' && CLIENT_ERROR_CODES.has(code)) return 'warn';
  return 'error';
}

function logToolCall({ userId, tool, durationMs, status, code, error }) {
  const entry = {
    kind: 'mcp.tool',
    ts: new Date().toISOString(),
    userId,
    tool,
    durationMs,
    status,
  };
  if (typeof code === 'number') entry.code = code;
  if (status === 'error' && error) entry.error = String(error.message || error);

  const line = JSON.stringify(entry);
  const level = levelFor({ status, code });
  if (level === 'info') console.log(line);
  else if (level === 'warn') console.warn(line);
  else console.error(line);
}

module.exports = { logToolCall };
