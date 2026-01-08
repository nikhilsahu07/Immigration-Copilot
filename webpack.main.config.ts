import type { Configuration } from 'webpack';
import { rules } from './webpack.rules';
import path from 'path';

export const mainConfig: Configuration = {
  entry: './src/main/index.ts',
  module: {
    rules,
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  externals: {
    'playwright-core': 'commonjs playwright-core',
    'bcrypt': 'commonjs bcrypt',
  },
  // FIX: Enable __dirname and __filename
  node: {
    __dirname: false,
    __filename: false,
  },
};
