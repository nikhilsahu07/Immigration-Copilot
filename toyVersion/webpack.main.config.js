const path = require('path');

module.exports = {
  entry: './src/main.js',
  target: 'electron-main',
  module: {
    rules: require('./webpack.rules'),
  },
  resolve: {
    extensions: ['.js', '.jsx', '.json'],
  },
  // NO externals - bundle everything including playwright-core
  node: {
    __dirname: false,
    __filename: false,
  },
};
