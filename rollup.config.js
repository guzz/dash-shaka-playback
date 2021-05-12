import { createBabelInputPluginFactory } from '@rollup/plugin-babel'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import html from 'rollup-plugin-html'
import postcss from 'rollup-plugin-postcss'
import serve from 'rollup-plugin-serve'
import filesize from 'rollup-plugin-filesize'
import size from 'rollup-plugin-sizes'
import visualize from 'rollup-plugin-visualizer'
import { terser } from 'rollup-plugin-terser'
import pkg from './package.json'
import babelConfig from './babel.config.json'

const babelPluginForUMDBundle = createBabelInputPluginFactory()
const babelPluginForESMBundle = createBabelInputPluginFactory()
const babelPluginOptions = { ...babelConfig, exclude: 'node_modules/**', babelHelpers: 'bundled' }

const plugins = [
  html(),
  postcss(),
  size(),
  filesize(),
  !!process.env.DEV && serve({ contentBase: ['dist', 'public'], host: '0.0.0.0', port: '8080' }),
  !!process.env.ANALYZE_BUNDLE && visualize({ open: true }),
]

const mainBundle = {
  input: 'src/clappr-dash-shaka-playback.js',
  external: ['@guzzj/clappr-core'],
  output: [
    {
      name: 'DashShakaPlayback',
      file: pkg.main,
      format: 'umd',
      globals: {
        '@guzzj/clappr-core': 'Clappr'
      },
    },
    !!process.env.MINIMIZE && {
      name: 'DashShakaPlayback',
      file: 'dist/clappr-dash-shaka-playback.min.js',
      format: 'umd',
      globals: {
        '@guzzj/clappr-core': 'Clappr'
      },
      plugins: terser(),
    },
  ],
  plugins: [babelPluginForUMDBundle(babelPluginOptions), resolve(), commonjs(), ...plugins],
}

const esmBundle = {
  input: 'src/clappr-dash-shaka-playback.js',
  external: ['@guzzj/clappr-core', /@babel\/runtime/],
  output: {
    name: 'DashShakaPlayback',
    file: pkg.module,
    format: 'esm',
    globals: {
      '@guzzj/clappr-core': 'Clappr'
    },
  },
  plugins: [
    babelPluginForESMBundle({
      ...babelPluginOptions,
      plugins: ['@babel/plugin-transform-runtime'],
      babelHelpers: 'runtime',
    }),
    ...plugins,
  ],
}

export default [mainBundle, esmBundle]
