const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle .onnx model files as assets
config.resolver.assetExts.push('onnx');

module.exports = config;
