describe('mcpConfig', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.MCP_ENABLED;
    delete process.env.MCP_BASE_URL;
    delete process.env.CLERK_ISSUER_URL;
    delete process.env.MCP_BETA_USER_IDS;
  });

  it('disables MCP by default', () => {
    const { mcpConfig } = require('../../mcp/config');
    expect(mcpConfig().enabled).toBe(false);
  });

  it('enables MCP when MCP_ENABLED=true', () => {
    process.env.MCP_ENABLED = 'true';
    process.env.MCP_BASE_URL = 'https://api.glowlytics.ai';
    process.env.CLERK_ISSUER_URL = 'https://clerk.glowlytics.ai';
    const { mcpConfig } = require('../../mcp/config');
    const cfg = mcpConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.baseUrl).toBe('https://api.glowlytics.ai');
    expect(cfg.clerkIssuer).toBe('https://clerk.glowlytics.ai');
  });

  it('parses MCP_BETA_USER_IDS as a Set with whitespace tolerance', () => {
    process.env.MCP_ENABLED = 'true';
    process.env.MCP_BETA_USER_IDS = 'user_abc, user_def , user_ghi';
    const { mcpConfig } = require('../../mcp/config');
    const ids = mcpConfig().betaUserIds;
    expect(ids).toBeInstanceOf(Set);
    expect(ids.has('user_abc')).toBe(true);
    expect(ids.has('user_def')).toBe(true);
    expect(ids.has('user_ghi')).toBe(true);
    expect(ids.size).toBe(3);
  });

  it('returns empty Set when MCP_BETA_USER_IDS is unset', () => {
    process.env.MCP_ENABLED = 'true';
    const { mcpConfig } = require('../../mcp/config');
    expect(mcpConfig().betaUserIds.size).toBe(0);
  });
});
