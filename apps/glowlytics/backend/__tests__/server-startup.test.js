process.env.NODE_ENV = 'test';

const mockPoolEnd = jest.fn().mockResolvedValue(undefined);
const mockPoolInstance = { end: mockPoolEnd, on: jest.fn() };
const mockPoolConstructor = jest.fn(() => mockPoolInstance);

jest.mock('pg', () => ({ Pool: mockPoolConstructor }));

const mockInitSchema = jest.fn();
jest.mock('../db-init', () => ({ initSchema: mockInitSchema }));

const mockApp = {
  listen: jest.fn(),
  _retryPendingAccountCreatedDeliveries: jest.fn(),
};
jest.mock('../app', () => mockApp);

const mockSignalModels = { initModels: jest.fn() };
jest.mock('../signal-models', () => mockSignalModels);

jest.mock('../db-ssl', () => ({ poolSsl: jest.fn(() => false) }));
jest.mock('../pg-resilience', () => ({ attachPoolErrorHandler: jest.fn() }));

const { startServer } = require('../server');

describe('server startup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://example.test/glowlytics';
    process.env.GLOWLYTICS_CUTOVER_AT = '2026-07-22T12:00:00.000Z';
    mockInitSchema.mockResolvedValue(undefined);
    mockPoolEnd.mockResolvedValue(undefined);
    mockApp.listen.mockReturnValue({ close: jest.fn() });
    mockApp._retryPendingAccountCreatedDeliveries.mockResolvedValue(undefined);
    mockSignalModels.initModels.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete process.env.DATABASE_URL;
    delete process.env.GLOWLYTICS_CUTOVER_AT;
  });

  test('schema failure prevents the listener from accepting traffic', async () => {
    mockInitSchema.mockRejectedValueOnce(new Error('migration failed'));

    await expect(startServer()).rejects.toThrow('migration failed');

    expect(mockApp.listen).not.toHaveBeenCalled();
  });

  test('missing cutover configuration prevents the listener from accepting traffic', async () => {
    mockInitSchema.mockResolvedValueOnce(undefined);
    delete process.env.GLOWLYTICS_CUTOVER_AT;

    await expect(startServer()).rejects.toThrow('GLOWLYTICS_CUTOVER_AT missing or invalid');

    expect(mockApp.listen).not.toHaveBeenCalled();
  });

  test('successful startup initializes schema before listen and starts bounded account retry', async () => {
    process.env.GLOWLYTICS_CUTOVER_AT = '2026-07-22T12:00:00.000Z';
    mockInitSchema.mockResolvedValueOnce(undefined);
    mockApp.listen.mockReturnValue({ close: jest.fn() });
    mockApp._retryPendingAccountCreatedDeliveries.mockResolvedValueOnce(undefined);

    await startServer();

    expect(mockInitSchema.mock.invocationCallOrder[0]).toBeLessThan(mockApp.listen.mock.invocationCallOrder[0]);
    expect(mockApp._retryPendingAccountCreatedDeliveries).toHaveBeenCalledWith({ limit: 100 });
  });

  test('server close clears the account retry interval', async () => {
    const originalClose = jest.fn();
    const server = { close: originalClose };
    mockApp.listen.mockReturnValue(server);
    mockApp._retryPendingAccountCreatedDeliveries.mockResolvedValue(undefined);

    const returned = await startServer();
    expect(returned).toBe(server);
    expect(mockApp._retryPendingAccountCreatedDeliveries).toHaveBeenCalledTimes(1);

    server.close();
    jest.advanceTimersByTime(60_000);

    expect(originalClose).toHaveBeenCalledTimes(1);
    expect(mockApp._retryPendingAccountCreatedDeliveries).toHaveBeenCalledTimes(1);
  });
});
