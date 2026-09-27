const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Keep database files, credentials and the old native projects out of Metro.
config.resolver.blockList = /[/\\](?:\.local|\.local-logs|backend|database|legacy-native)(?:[/\\]|$)/;
module.exports = config;
