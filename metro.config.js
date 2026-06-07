// Metro config wired for Sentry source map generation on Expo.
// getSentryExpoConfig wraps Expo's default Metro config with the Sentry
// serializer so JS source maps are produced and uploaded during native builds.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

module.exports = config;
