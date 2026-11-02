const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes("wasm"))
  config.resolver.assetExts.push("wasm");
const enhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const handler = enhance ? enhance(middleware, server) : middleware;
  return (req, res, next) => {
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    return handler(req, res, next);
  };
};
module.exports = config;
