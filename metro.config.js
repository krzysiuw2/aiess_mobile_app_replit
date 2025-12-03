const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for Rive (.riv) files
config.resolver.assetExts.push('riv');

module.exports = config;
