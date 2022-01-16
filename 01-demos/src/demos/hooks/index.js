/**
 * 必须要react和react-dom 16.7以上
 */

/**
 * function  component
 * 没有this对象 : 不能有this.state; 不能有生命周期方法 
 */
import React, { useState, useEffect } from 'react'

export default () => {
  const [name, setName] = useState('jokcy')

  useEffect(() => {
    /**
     * 如果没有第二个参数“[]”每次事件有更新的时候，都会先执行unbind，然后执行update
     * 如果有第二个参数“[]”， 下面的代码就想当于componentWillMonut和componentWillOnMount
     */
    console.log('component update')

    return () => {
      console.log('unbind') 
    }
  }, [])

  return (
    <>
      <p>My Name is: {name}</p>
      <input type="text" value={name} onChange={e => setName(e.target.value)} />
    </>
  )
}
