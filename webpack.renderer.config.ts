import type { Configuration } from 'webpack';
import { rules } from './webpack.rules';
import path from 'path';
import webpack from 'webpack';

rules.push({
  test: /\.css$/,
  use: [
    'style-loader',
    'css-loader',
    {
      loader: 'postcss-loader',
      options: {
        postcssOptions: {
          plugins: [
            require('tailwindcss'),
            require('autoprefixer'),
          ],
        },
      },
    },
  ],
});

export const rendererConfig: Configuration = {
  target: 'web',
  module: {
    rules,
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    alias: {
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      'path': 'path-browserify',
    },
    fallback: {
      'path': require.resolve('path-browserify'),
      'fs': false,
      'os': false,
      'crypto': false,
      'assert': false,
      'util': false,
      'stream': false,
      'buffer': require.resolve('buffer/'),
    },
    fullySpecified: false,
  },
  plugins: [
    // Inject globals BEFORE any other code runs
    new webpack.BannerPlugin({
      banner: 'globalThis.__dirname = "/"; globalThis.__filename = "/index.js";',
      raw: true,
      entryOnly: false,
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.platform': JSON.stringify(process.platform),
      'process.version': JSON.stringify(process.version),
      // Also define them via DefinePlugin for module scope
      'typeof __dirname': JSON.stringify('string'),
      'typeof __filename': JSON.stringify('string'),
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser.js',
      Buffer: ['buffer', 'Buffer'],
      __dirname: [require.resolve('./webpack-dirname-polyfill.js'), 'default'],
      __filename: [require.resolve('./webpack-filename-polyfill.js'), 'default'],
    }),
  ],
};
