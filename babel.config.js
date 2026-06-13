module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 54) auto-configures the react-native-worklets /
    // reanimated plugin. Do NOT add it manually — that double-transforms.
    presets: ['babel-preset-expo'],
  };
};
