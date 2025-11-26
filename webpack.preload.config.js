module.exports = {
  /**
   * This is the preload entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/preload.ts',
  target: 'electron-preload',
  // Put your normal webpack config below here
  module: {
    rules: require('./webpack.rules.js'),
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
};