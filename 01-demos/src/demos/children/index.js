import React from 'react'

function ChildrenDemo(props) {
  console.log(props.children)
  /**
   * 1代表第一个span节点
   * 2代表第二个span节点
   * React.Children会将数组展开为一维数组，结果为[1,1,1,2,2,2]
   */
  console.log(React.Children.map(props.children, c => [c, [c, c]]));
  return props.children
}

export default () => (
  <ChildrenDemo>
    <span>1</span>
    <span>2</span>
  </ChildrenDemo>
)
