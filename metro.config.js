const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Keep database files and backend credentials out of the mobile bundle.
    blockList: /[/\\](?:\.local|\.local-logs|backend|database)(?:[/\\]|$)/,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
