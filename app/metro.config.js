const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Privy SDK requires disabling package exports for certain packages
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['browser', 'require', 'import'];

module.exports = config;
