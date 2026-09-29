// Shim that loads ts-node and then runs the TypeScript worker
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    esModuleInterop: true,
  },
})
require('./load-worker.ts')
