import React, { Suspense, lazy } from 'react'
/**
 * Suspense 
 * 渲染过程中有异步操作，等异步操作完成后再显示新的内容
 * 需要等到内部所有组件异步渲染完fallback才会消失 
 */
const LazyComp = lazy(() => import('./lazy.js'))

let data = ''
let promise = ''
function requestData() {
  if (data) return data
  if (promise) throw promise // 这里线throw一个promise， promise resolve之前，都会显示fallback的内容 
  promise = new Promise(resolve => {
    setTimeout(() => {
      data = 'Data resolved'
      resolve()
    }, 2000)
  })
  throw promise
}

function SuspenseComp() {
  const data = requestData()

  return <p>{data}</p>
}

export default () => (
  <Suspense fallback="loading data">
    {/* （不推荐使用，throw promise这种的） */}
    <SuspenseComp /> 
      {/* （推荐使用 */}
    <LazyComp />
  </Suspense>
)
