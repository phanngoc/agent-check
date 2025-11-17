import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/tracker.ts',
  output: [
    {
      file: 'dist/tracker.js',
      format: 'iife',
      name: 'UserTracker',
      sourcemap: true,
    },
    {
      file: 'dist/tracker.min.js',
      format: 'iife',
      name: 'UserTracker',
      sourcemap: true,
      plugins: [terser()],
    },
  ],
  plugins: [
    resolve({
      browser: true,
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
    }),
  ],
};
