module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  // Exclude shared fixture/helper files under __tests__/ that are imported
  // by actual test files but don't contain tests themselves.
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/fixtures/', '/backend/'],
};
