const childProcess = require('child_process')
const Log = require('./lib/logger')('index')

let workers = []
let file = {
  0: './src/snkrsCn.js',
  1: './src/snkrsJp.js',
  2: './src/snkrsUk.js',
  3: './src/snkrsUs.js',
  4: './src/juiceStore.js',
  5: './src/kith.js',
  6: './src/bdgastore.js',
  // 7: './src/yeezysupply.js'
}

Object.keys(file).forEach(key => {
  workers.push(childProcess.fork(file[key]))
})

for (let i = 0; i < workers.length; ++i) {
  // 工作进程退出后重启
  workers[i].on(
    'exit',
    (i => {
      return () => {
        Log.info('Worker-' + workers[i] + ' exited')
        workers[i] = childProcess.fork(file[i])
        Log.info('Create worker-' + workers[i].pid)
      }
    })(i)
  )
}
