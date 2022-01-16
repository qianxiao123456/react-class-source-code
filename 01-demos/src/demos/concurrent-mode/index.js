import React, { ConcurrentMode } from 'react'
// flushSync  可以提高优先级
import { flushSync } from 'react-dom';

import './index.css'
/** ConcurrentMode
 * 让react的整体渲染过程进行一个优先级的排比，进行任务调度。
 *  例子； 1: 如果执行react更新（dom或者元素更新，setState），占用了非常长的js执行进程，导致浏览器执行动画渲染没有时间做，动画比较卡顿 
 *        2: 或者input输入响应比较卡
 * ConcurrentMode组件里面包含的元素，优先级比较低 
 */
class Parent extends React.Component {
  state = {
    async: true,
    num: 1,
    length: 2000,
  }

  componentDidMount() {
    this.interval = setInterval(() => {
      this.updateNum()
    }, 200)
  }

  componentWillUnmount() {
    // 别忘了清除interval
    if (this.interval) {
      clearInterval(this.interval)
    }
  }

  updateNum() {
    const newNum = this.state.num === 3 ? 0 : this.state.num + 1
    if (this.state.async) {
      this.setState({
        num: newNum,
      })
    } else {
      flushSync(() => {
        this.setState({
          num: newNum,
        })
      })
    }
  }

  render() {
    const children = []

    const { length, num, async } = this.state

    for (let i = 0; i < length; i++) {
      children.push(
        <div className="item" key={i}>
          {num}
        </div>,
      )
    }

    return (
      <div className="main">
        async:{' '}
        <input
          type="checkbox"
          checked={async}
          onChange={() => flushSync(() => this.setState({ async: !async }))}
        />
        <div className="wrapper">{children}</div>
      </div>
    )
  }
}

// class Child extends React.Component {
//   state = {
//     num: 1
//   }

//   render () {
//     return (
//       <div>

//       </div>
//     )
//   }
// }

export default () => (
  <ConcurrentMode>
    <Parent />
  </ConcurrentMode>
)
