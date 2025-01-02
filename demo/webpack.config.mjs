import path from 'path';
const __dirname = path.dirname(new URL(import.meta.url).pathname);

export default {
  entry: {
    background: './src/background.ts',
    content: './src/content.ts',
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  mode: 'production',
};
