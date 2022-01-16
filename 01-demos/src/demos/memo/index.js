import React, { memo } from 'react'
/**
 *  类组件的pureComponent可以让props没有发生变化的时候，不重新渲染
 *  函数组件：memo功能同上
 */
export default memo(
  function TestMemo() {
    return <span>123</span>
  },
  () => false,
)
