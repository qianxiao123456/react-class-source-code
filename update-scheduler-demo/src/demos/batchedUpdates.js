import React from 'react'
import { unstable_batchedUpdates as batchedUpdates } from 'react-dom'

/**
 * batchedUpdates 批量更新
 */
/**
 * setState本身的方法调用是同步的，但是并不标志着state会立即更新，需要更新当前执行环境的上下文判断
 * 如果处于批量更新的环境下，state不会立马更新（参考batchedUpdates源码）
 * 如果不处于批量更新的环境下，可能是立马更新的
 */
export default class BatchedDemo extends React.Component {
  state = {
    number: 0,
  }

  handleClick = () => {
    //3个例子，都会调用requestWork
    /** 
     * 主动`batchedUpdates`
     * 会打印1，2，3（每次都会更新，导致应用性能下降），
     * 这里的执行上下文环境为window，isBatchingUpdates为false
    */
    // setTimeout(() => {
    //   this.countNumber()
    // }, 0)

    /* 
    * setTimeout中没有`batchedUpdates`
    * 会打印3个0
    * batchedUpdates 将isBatchingUpdates设置为true
    */
    setTimeout(() => {
      batchedUpdates(() => this.countNumber())
    }, 0)

    /**
     * 如果直接调用countNumber会打印3个0
     * isBatchingUpdates为true,会调用batchedUpdates$1
     */
    // this.countNumber()
  }

  countNumber() {
    const num = this.state.number
    this.setState({
      number: num + 1,
    })
    console.log(this.state.number)
    this.setState({
      number: num + 2,
    })
    console.log(this.state.number)
    this.setState({
      number: num + 3,
    })
    console.log(this.state.number)
  }

  render() {
    return <button onClick={this.handleClick}>Num: {this.state.number}</button>
  }
}
