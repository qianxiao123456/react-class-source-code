'use strict';

var React = require('react');
var ReactDOM = require('react-dom');
var VectorWidget = require('./VectorWidget');
/**
 * 每次调用ReactDOM.render就会产生一个root节点
 * 拥有独立的updateQueue和FiberTree
 */
ReactDOM.render(<VectorWidget />, document.getElementById('container'));
