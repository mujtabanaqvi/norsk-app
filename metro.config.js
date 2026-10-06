const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude Next.js build artifacts and Drizzle SQL files from Metro crawling
config.resolver.blockList = [
  /\.next\/.*/,
  /drizzle\/.*/,
];

module.exports = config;
