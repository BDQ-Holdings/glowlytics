module.exports = {
  queryCategorySamples: jest.fn(),
  queryQuantitySamples: jest.fn(),
  CategoryValueSleepAnalysis: { inBed: 0, asleepUnspecified: 1, awake: 2, asleepCore: 3, asleepDeep: 4, asleepREM: 5 },
  CategoryValueMenstrualFlow: { unspecified: 1, light: 2, medium: 3, heavy: 4, none: 5 },
  isHealthDataAvailableAsync: jest.fn().mockResolvedValue(true),
  requestAuthorization: jest.fn().mockResolvedValue(true),
};
