/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* eslint-disable no-var */

// TODO: Use symbols?
var ImmediatePriority = 1;
var UserBlockingPriority = 2;
var NormalPriority = 3;
var IdlePriority = 4;

// Max 31 bit integer. The max integer size in V8 for 32-bit systems.
// Math.pow(2, 30) - 1
// 0b111111111111111111111111111111
var maxSigned31BitInt = 1073741823;

// Times out immediately
var IMMEDIATE_PRIORITY_TIMEOUT = -1;
// Eventually times out
var USER_BLOCKING_PRIORITY = 250;
var NORMAL_PRIORITY_TIMEOUT = 5000;
// Never times out
var IDLE_PRIORITY = maxSigned31BitInt;

// Callbacks are stored as a circular, doubly linked list.
var firstCallbackNode = null;

var currentPriorityLevel = NormalPriority;
var currentEventStartTime = -1;
var currentExpirationTime = -1;

// This is set when a callback is being executed, to prevent re-entrancy.
var isExecutingCallback = false;
/**
 * 是否已经开始调度了，在ensureHostCallbackIsScheduled设置为true，在结束执行callback之后设置为false
 * boolean 判断是否进入了requestHostCallback，requestHostCallback会开启animationTick，进行每一个帧的任务调度。
 * 当调用到flushWork直到链表中的callback处理结束，设为false。 
 */
var isHostCallbackScheduled = false;

var hasNativePerformanceNow =
  typeof performance === 'object' && typeof performance.now === 'function';

var timeRemaining;
// hasNativePerformanceNow 默认是存在的
if (hasNativePerformanceNow) {
  timeRemaining = function() {
    if (
      firstCallbackNode !== null &&
      firstCallbackNode.expirationTime < currentExpirationTime
    ) {
      // A higher priority callback was scheduled. Yield so we can switch to
      // working on that.
      return 0;
    }
    // We assume that if we have a performance timer that the rAF callback
    // gets a performance timer value. Not sure if this is always true.
    var remaining = getFrameDeadline() - performance.now();
    return remaining > 0 ? remaining : 0;
  };
} else {
  timeRemaining = function() {
    // Fallback to Date.now()
    if (
      firstCallbackNode !== null &&
      firstCallbackNode.expirationTime < currentExpirationTime
    ) {
      return 0;
    }
    var remaining = getFrameDeadline() - Date.now();
    return remaining > 0 ? remaining : 0;
  };
}

var deadlineObject = {
  timeRemaining,
  didTimeout: false,
};
/**
 * 如果isHostCallbackScheduled为false，也就是还没开始调度，那么设为true，如果已经开始了，就直接取消，因为顺序可能变了。
 */
function ensureHostCallbackIsScheduled() {
  if (isExecutingCallback) {
    // isExecutingCallback:如果我们的callbackNode正在被调用
    // 如果已经在调用回调了，就 return，因为本来就会继续调用下去，isExecutingCallback在flushWork的时候会被修改为true
    return;
  }
  var expirationTime = firstCallbackNode.expirationTime;
  // isHostCallbackScheduled: callback有没有进入调度
  if (!isHostCallbackScheduled) {
    isHostCallbackScheduled = true;
  } else {
    cancelHostCallback();
  }
  /**
   * 这里我们没有立马执行flushWork，而是交给了requestHostCallback。因为我们并不想直接把任务链表中的任务立马执行掉，也不是一口气把链表中的所有任务全部都执行掉。
   * JS是单线程的，我们执行这些任务一直占据着主线程，会导致浏览器的其他任务一直等待，比如动画，就会出现卡顿，所以我们要选择合适的时期去执行它。所以我们交给requestHostCallback去处理这件事情，把flushWork交给了它。
   * 这里你可以暂时把flushWork简单的想成执行链表中的任务。
   */
  requestHostCallback(flushWork, expirationTime);
}

function flushFirstCallback() {
  var flushedNode = firstCallbackNode;

  var next = firstCallbackNode.next;
  // 这里是从链表中删除firstCallbackNode的处理
  if (firstCallbackNode === next) {
    // 这种情况，链表只有一个元素，直接清空
    // This is the last callback in the list
    firstCallbackNode = null;
    next = null;
  } else {
    // 这个操作就是从链表中删除掉firstCallbackNode
    var lastCallbackNode = firstCallbackNode.previous;
    firstCallbackNode = lastCallbackNode.next = next;
    next.previous = lastCallbackNode;
  }

  flushedNode.next = flushedNode.previous = null;

  // Now it's safe to call the callback.
  var callback = flushedNode.callback;
  var expirationTime = flushedNode.expirationTime;
  var priorityLevel = flushedNode.priorityLevel;
  var previousPriorityLevel = currentPriorityLevel;
  var previousExpirationTime = currentExpirationTime;
  currentPriorityLevel = priorityLevel;
  currentExpirationTime = expirationTime;
  var continuationCallback;
  try {
    continuationCallback = callback(deadlineObject);
  } finally {
    currentPriorityLevel = previousPriorityLevel;
    currentExpirationTime = previousExpirationTime;
  }

  // A callback may return a continuation. The continuation should be scheduled
  // with the same priority and expiration as the just-finished callback.
  if (typeof continuationCallback === 'function') {
    var continuationNode: CallbackNode = {
      callback: continuationCallback,
      priorityLevel,
      expirationTime,
      next: null,
      previous: null,
    };

    // Insert the new callback into the list, sorted by its expiration. This is
    // almost the same as the code in `scheduleCallback`, except the callback
    // is inserted into the list *before* callbacks of equal expiration instead
    // of after.
    if (firstCallbackNode === null) {
      // This is the first callback in the list.
      firstCallbackNode = continuationNode.next = continuationNode.previous = continuationNode;
    } else {
      var nextAfterContinuation = null;
      var node = firstCallbackNode;
      do {
        if (node.expirationTime >= expirationTime) {
          // This callback expires at or after the continuation. We will insert
          // the continuation *before* this callback.
          nextAfterContinuation = node;
          break;
        }
        node = node.next;
      } while (node !== firstCallbackNode);

      if (nextAfterContinuation === null) {
        // No equal or lower priority callback was found, which means the new
        // callback is the lowest priority callback in the list.
        nextAfterContinuation = firstCallbackNode;
      } else if (nextAfterContinuation === firstCallbackNode) {
        // The new callback is the highest priority callback in the list.
        firstCallbackNode = continuationNode;
        ensureHostCallbackIsScheduled();
      }

      var previous = nextAfterContinuation.previous;
      previous.next = nextAfterContinuation.previous = continuationNode;
      continuationNode.next = nextAfterContinuation;
      continuationNode.previous = previous;
    }
  }
}

function flushImmediateWork() {
  if (
    currentEventStartTime === -1 &&
    firstCallbackNode !== null &&
    firstCallbackNode.priorityLevel === ImmediatePriority
  ) {
    isExecutingCallback = true;
    deadlineObject.didTimeout = true;
    try {
      do {
        flushFirstCallback();
      } while (
        // Keep flushing until there are no more immediate callbacks
        firstCallbackNode !== null &&
        firstCallbackNode.priorityLevel === ImmediatePriority
      );
    } finally {
      isExecutingCallback = false;
      if (firstCallbackNode !== null) {
        // There's still work remaining. Request another callback.
        ensureHostCallbackIsScheduled();
      } else {
        // firstCallbackNode 为null的时候，isHostCallbackScheduled 才会赋值为false
        isHostCallbackScheduled = false;
      }
    }
  }
}

function flushWork(didTimeout) {
  // 先设置isExecutingCallback为true，代表正在调用callback
  isExecutingCallback = true;
  // 判断任务是否超时
  deadlineObject.didTimeout = didTimeout;
  try {
    // didTimeout 为true说明firstCallback的timeout已经过期了
    if (didTimeout) {
      while (firstCallbackNode !== null) {
        var currentTime = getCurrentTime();
          // 这个循环的意思是，遍历callbackNode链表，直到第一个没有过期的callback
          // 所以主要意义就是将所有过期的callback立刻执行完
        if (firstCallbackNode.expirationTime <= currentTime) {
          do {
            //flushFirstCallback 方法是真正调用callback的方法
            flushFirstCallback();
          } while (
            firstCallbackNode !== null &&
            firstCallbackNode.expirationTime <= currentTime
          );
          continue;
        }
        break;
      }
    } else {
      if (firstCallbackNode !== null) {
        do {
          flushFirstCallback();
        } while (

          // 比较frameDeadLine和currenttime
          firstCallbackNode !== null &&
          getFrameDeadline() - getCurrentTime() > 0
        );
      }
    }
  } finally {
    isExecutingCallback = false;
    if (firstCallbackNode !== null) {
      /**
       *  callback链表还没全部执行完，继续
       * ensureHostCallbackIsScheduled也是会启动下一帧，所以不是连续调用
       * 同时，isHostCallbackScheduled决定了ensureHostCallbackIsScheduled的行为，
       * 在此分支中isHostCallbackScheduled === true, 所以ensureHostCallbackIsScheduled会执行一个cancelHostCallback函数
       * cancelHostCallback设置scheduledHostCallback为null，可以令上一个animationTick停止
       */
      // 如果任务没有执行完，则再次调用ensureHostCallbackIsScheduled进入调度
      ensureHostCallbackIsScheduled();
    } else {
      /**
       * isHostCallbackScheduled这个变量只会在ensureHostCallbackIsScheduled中被设置为true
       * 这个变量的意义可能是代表，是否所有任务都被flush了？，因为只有firstCallbackNode === null的情况下才会设为false
       */
      isHostCallbackScheduled = false;
    }
    flushImmediateWork();
  }
}

function unstable_runWithPriority(priorityLevel, eventHandler) {
  switch (priorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
    case IdlePriority:
      break;
    default:
      priorityLevel = NormalPriority;
  }

  var previousPriorityLevel = currentPriorityLevel;
  var previousEventStartTime = currentEventStartTime;
  currentPriorityLevel = priorityLevel;
  currentEventStartTime = getCurrentTime();

  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
    currentEventStartTime = previousEventStartTime;

    // Before exiting, flush all the immediate work that was scheduled.
    flushImmediateWork();
  }
}

function unstable_wrapCallback(callback) {
  var parentPriorityLevel = currentPriorityLevel;
  return function() {
    // This is a fork of runWithPriority, inlined for performance.
    var previousPriorityLevel = currentPriorityLevel;
    var previousEventStartTime = currentEventStartTime;
    currentPriorityLevel = parentPriorityLevel;
    currentEventStartTime = getCurrentTime();

    try {
      return callback.apply(this, arguments);
    } finally {
      currentPriorityLevel = previousPriorityLevel;
      currentEventStartTime = previousEventStartTime;
      flushImmediateWork();
    }
  };
}
/**
 * 
 * callback是performAsyncWork
 * deprecated_options 即将废弃整个scheduler模块都在维护一个callback的环形链表，
 *  链表的头部是firstCallbackNode，当我们遇到一个判断firstCallbackNode === null，
 *  我们应该明白这是这判断这个链表是否为空。在后文中，这个链表的元素我称之为callbackNode, 链表称为callback链表
 *  unstable_scheduleCallback函数的内容概述就是生成callbackNode，并插入到callback链表之中
 * 1、创建一个任务节点newNode，按照优先级插入callback链表
 * 2、我们把任务按照过期时间排好顺序了，那么何时去执行任务呢？怎么去执行呢？答案是有两种情况，
 *    1是当添加第一个任务节点的时候开始启动任务执行，
 *    2是当新添加的任务取代之前的节点成为新的第一个节点的时候。因为1意味着任务从无到有，应该 立刻启动。2意味着来了新的优先级最高的任务，应该停止掉之前要执行的任务，重新从新的任务开始执行。上面两种情况就对应ensureHostCallbackIsScheduled方法执行的两种情况。
 */
function unstable_scheduleCallback(callback, deprecated_options) {
  var startTime =
    currentEventStartTime !== -1 ? currentEventStartTime : getCurrentTime();
  // startTime这里多数情况下是getCurrentTime-----Performance.now()
  // expirationTime意义是： 当前时间+任务预计完成时间
  var expirationTime;
  if (
    typeof deprecated_options === 'object' &&
    deprecated_options !== null &&
    typeof deprecated_options.timeout === 'number'
  ) {
     // 从requestWork调用到这里，目前只会走这个分支
     // 目前来看timeout越小，优先级越大
    expirationTime = startTime + deprecated_options.timeout;
  } else {
    switch (currentPriorityLevel) {
      case ImmediatePriority:
        expirationTime = startTime + IMMEDIATE_PRIORITY_TIMEOUT;
        break;
      case UserBlockingPriority:
        expirationTime = startTime + USER_BLOCKING_PRIORITY;
        break;
      case IdlePriority:
        expirationTime = startTime + IDLE_PRIORITY;
        break;
      case NormalPriority:
      default:
        expirationTime = startTime + NORMAL_PRIORITY_TIMEOUT;
    }
  }

  var newNode = {
    callback,
    priorityLevel: currentPriorityLevel,
    expirationTime,
    next: null,
    previous: null,
  };

  /** 
   * 对应callbackNode.png图片
   * firstCallbackNode 是一个双向循环链表的头部，这个链表在此模块（scheduler）模块维护
   * firstCallbackNode === null 说明链表为空
   */
  if (firstCallbackNode === null) {
    firstCallbackNode = newNode.next = newNode.previous = newNode;
    ensureHostCallbackIsScheduled();
  } else {
    var next = null;
    var node = firstCallbackNode;
    /**
     * 这个判断用于寻找expirationTime最大的任务并赋值给next（也就是优先级最低的任务）
     */
    do {
      if (node.expirationTime > expirationTime) {
        next = node;
        break; // 跳出循环
      }
      node = node.next;
    } while (node !== firstCallbackNode);
    // 这里环形链表的排序是这样的
    /*
    *           head
    *    next7         next1
    *  next6              next2
    *    next5         next3
    *           next4
    *
    * 其中head的expirationTime最小，next7最大，其余的next的expirationTime从小到大排序，
    * 当next === null,走分支1，newNode的expirationTime是最大的（链表每个element都小于newNode），所以需要将newNode插入head之前
    * 当next === firstCallbackNode，newNode的expirationTime是最小的，也就是newNode要插入head之前，成为新的head，
    * 所以分支2需要修改链表的head指针
    */

    if (next === null) {
      //当前callback 优先级最低，放在node链表最后一个
      next = firstCallbackNode;
    } else if (next === firstCallbackNode) {
       //当前callback 优先级最高，放在node链表第一个
      // The new callback has the earliest expiration in the entire list.
      firstCallbackNode = newNode;
      // 下面的方法会进入一个循环，循环调用list
      ensureHostCallbackIsScheduled();
    }

    var previous = next.previous;
    previous.next = next.previous = newNode;
    newNode.next = next;
    newNode.previous = previous;
  }

  return newNode;
}

function unstable_cancelCallback(callbackNode) {
  var next = callbackNode.next;
  if (next === null) {
    // Already cancelled.
    return;
  }

  if (next === callbackNode) {
    // This is the only scheduled callback. Clear the list.
    firstCallbackNode = null;
  } else {
    // Remove the callback from its position in the list.
    if (callbackNode === firstCallbackNode) {
      firstCallbackNode = next;
    }
    var previous = callbackNode.previous;
    previous.next = next;
    next.previous = previous;
  }

  callbackNode.next = callbackNode.previous = null;
}

function unstable_getCurrentPriorityLevel() {
  return currentPriorityLevel;
}

// The remaining code is essentially a polyfill for requestIdleCallback. It
// works by scheduling a requestAnimationFrame, storing the time for the start
// of the frame, then scheduling a postMessage which gets scheduled after paint.
// Within the postMessage handler do as much work as possible until time + frame
// rate. By separating the idle call into a separate event tick we ensure that
// layout, paint and other browser work is counted against the available time.
// The frame rate is dynamically adjusted.

// We capture a local reference to any global, in case it gets polyfilled after
// this module is initially evaluated. We want to be using a
// consistent implementation.
var localDate = Date;

// This initialization code may run even on server environments if a component
// just imports ReactDOM (e.g. for findDOMNode). Some environments might not
// have setTimeout or clearTimeout. However, we always expect them to be defined
// on the client. https://github.com/facebook/react/pull/13088
var localSetTimeout = typeof setTimeout === 'function' ? setTimeout : undefined;
var localClearTimeout =
  typeof clearTimeout === 'function' ? clearTimeout : undefined;

// We don't expect either of these to necessarily be defined, but we will error
// later if they are missing on the client.
var localRequestAnimationFrame =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : undefined;
var localCancelAnimationFrame =
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : undefined;

var getCurrentTime;

// requestAnimationFrame does not run when the tab is in the background. If
// we're backgrounded we prefer for that work to happen so that the page
// continues to load in the background. So we also schedule a 'setTimeout' as
// a fallback.
// TODO: Need a better heuristic for backgrounded work.
var ANIMATION_FRAME_TIMEOUT = 100;
var rAFID;
var rAFTimeoutID;
var requestAnimationFrameWithTimeout = function(callback) {
  // schedule rAF and also a setTimeout
  rAFID = localRequestAnimationFrame(function(timestamp) {
    // cancel the setTimeout
    localClearTimeout(rAFTimeoutID);
    callback(timestamp);
  });
  rAFTimeoutID = localSetTimeout(function() {
    // cancel the requestAnimationFrame
    // 这里是防止localRequestAnimationFrame太长时间不调用
    // 100ms后如果localRequestAnimationFrame没有调用，取消localRequestAnimationFrame
    localCancelAnimationFrame(rAFID);
    callback(getCurrentTime());
  }, ANIMATION_FRAME_TIMEOUT);
};

if (hasNativePerformanceNow) {
  var Performance = performance;
  getCurrentTime = function() {
    return Performance.now();
  };
} else {
  getCurrentTime = function() {
    return localDate.now();
  };
}

var requestHostCallback;
var cancelHostCallback;
var getFrameDeadline;

if (typeof window !== 'undefined' && window._schedMock) {
  // Dynamic injection, only for testing purposes.
  var impl = window._schedMock;
  requestHostCallback = impl[0];
  cancelHostCallback = impl[1];
  getFrameDeadline = impl[2];
} else if (
  // 当前不处于浏览器环境
  typeof window === 'undefined' ||
  typeof window.addEventListener !== 'function'
) {
  var _callback = null;
  var _currentTime = -1;
  var _flushCallback = function(didTimeout, ms) {
    if (_callback !== null) {
      var cb = _callback;
      _callback = null;
      try {
        _currentTime = ms;
        cb(didTimeout);
      } finally {
        _currentTime = -1;
      }
    }
  };
  requestHostCallback = function(cb, ms) {
    if (_currentTime !== -1) {
      // Protect against re-entrancy.
      setTimeout(requestHostCallback, 0, cb, ms);
    } else {
      _callback = cb;
      setTimeout(_flushCallback, ms, true, ms);
      setTimeout(_flushCallback, maxSigned31BitInt, false, maxSigned31BitInt);
    }
  };
  cancelHostCallback = function() {
    _callback = null;
  };
  getFrameDeadline = function() {
    return Infinity;
  };
  getCurrentTime = function() {
    return _currentTime === -1 ? 0 : _currentTime;
  };
} else {
  if (typeof console !== 'undefined') {
    // TODO: Remove fb.me link
    if (typeof localRequestAnimationFrame !== 'function') {
      console.error(
        "This browser doesn't support requestAnimationFrame. " +
          'Make sure that you load a ' +
          'polyfill in older browsers. https://fb.me/react-polyfills',
      );
    }
    if (typeof localCancelAnimationFrame !== 'function') {
      console.error(
        "This browser doesn't support cancelAnimationFrame. " +
          'Make sure that you load a ' +
          'polyfill in older browsers. https://fb.me/react-polyfills',
      );
    }
  }
  //在requestHostCallback设置，值一般为flushWork，代表下一个调度要做的事情
  var scheduledHostCallback = null;
  // 是否已经发送调用idleTick的消息，在animationTick中设置为true
  var isMessageEventScheduled = false;
  // 表示过期任务的时间，在idleTick中发现第一个任务的时间已经过期的时候设置
  var timeoutTime = -1;
  // 是否已经开始调用requestAnimationFrame
  var isAnimationFrameScheduled = false;
  // 是否正在执行callback
  var isFlushingHostCallback = false;

  // 记录当前帧的到期时间，他等于currentTime + activeFraeTime，也就是requestAnimationFrame回调传入的时间，加上一帧的时间。
  var frameDeadline = 0;
  // We start out assuming that we run at 30fps but then the heuristic tracking
  // will adjust this value to a faster fps if we get more frequent animation
  // frames.
  var previousFrameTime = 33;
  // 给一帧渲染用的时间，默认是 33，也就是 1 秒 30 帧
  var activeFrameTime = 33;

  getFrameDeadline = function() {
    return frameDeadline;
  };

  // We use the postMessage trick to defer idle work until after the repaint.
  var messageKey =
    '__reactIdleCallback$' +
    Math.random()
      .toString(36)
      .slice(2);
  var idleTick = function(event) {
    if (event.source !== window || event.data !== messageKey) {
      return;
    }

    isMessageEventScheduled = false;

    var prevScheduledCallback = scheduledHostCallback;
    var prevTimeoutTime = timeoutTime;
    scheduledHostCallback = null;
    timeoutTime = -1;

    var currentTime = getCurrentTime();

    var didTimeout = false;
    /** 
     * frameDeadline - currentTime <= 0 
     * 说明浏览器更新动画/用户反馈，已经消耗了33ms，一帧的时间已经被用完
     * react没有时间执行更新了
     * 
     * prevTimeoutTime <= currentTime 说明任务已经过期，强制更新
     */
    if (frameDeadline - currentTime <= 0) {
      if (prevTimeoutTime !== -1 && prevTimeoutTime <= currentTime) {
        // Exceeded the timeout. Invoke the callback even though there's no
        // time left.
         // didTimeout： 是否强制输出更新
        didTimeout = true;
      } else {
        // No timeout.
        if (!isAnimationFrameScheduled) {
          isAnimationFrameScheduled = true;
          requestAnimationFrameWithTimeout(animationTick);
        }
        // Exit without invoking the callback.
        scheduledHostCallback = prevScheduledCallback;
        timeoutTime = prevTimeoutTime;
        return;
      }
    }

    if (prevScheduledCallback !== null) {
      isFlushingHostCallback = true;
      try {
        prevScheduledCallback(didTimeout);
      } finally {
        isFlushingHostCallback = false;
      }
    }
  };
  window.addEventListener('message', idleTick, false);

  /**
   * 中间部分nextFrameTIme的判断是React检查帧数的计算，我们先忽略，关注整体。 
   * animationTick一开始直接scheduledHostCallback是否为null，否则就继续通过requestAnimationFrameWithTimeout调用animationTick自身，
   * 这是一个逐帧执行的递归。意思就是这个递归在浏览器在渲染下一帧的时候，才会调用再次调用animationTick。 也就是在animationTick的调用requestAnimationFrameWithTimeout(animationTick)之后，
   * 后面的代码依然有时间可以执行。
   */
  var animationTick = function(rafTime) {
    // scheduledHostCallback也就是callback
    if (scheduledHostCallback !== null) {
      // 这里是连续递归调用，直到scheduledHostCallback === null
      // scheduledHostCallback会在messageChannel的port1的回调中设为null
      // 因为requestAnimationFrameWithTimeout会加入event loop,所以这里不是普通递归，而是每一帧执行一次
      // 注意当下一帧执行了animationTick时，之前的animationTick已经计算出了nextFrameTime
      requestAnimationFrameWithTimeout(animationTick);
    } else {
      //这里说明没有方法需要调度
      isAnimationFrameScheduled = false;
      return;
    }
    /**
     * frameDeadline 第一次是0， 后面有赋值
     * activeFrameTime 33 保持浏览器30帧的情况下，每一帧的执行时间 
     * nextFrameTime就是此方法到下一帧之前可以执行多少时间
     */


    /**
     * rafTime 当前时间戳
     * activeFrameTime 每一帧的时间
     * nextFrameTime 下一帧预计剩余时间
     */
    var nextFrameTime = rafTime - frameDeadline + activeFrameTime;
     /**
      * nextFrameTime < activeFrameTime 说明 当前浏览器刷新频率高于30帧， 帧时间小于33ms 
      */
    if (
      nextFrameTime < activeFrameTime &&
      previousFrameTime < activeFrameTime
    ) {
       // nextFrameTime<8， 如果每一帧小于8ms,暂不支持
      if (nextFrameTime < 8) {
        // Defensive coding. We don't support higher frame rates than 120hz.
        // If the calculated frame time gets lower than 8, it is probably a bug.
        nextFrameTime = 8;
      }
      // activeFrameTime 更新 （代表一帧完整的时间）
      activeFrameTime =
        nextFrameTime < previousFrameTime ? previousFrameTime : nextFrameTime;
    } else {
      previousFrameTime = nextFrameTime;
    }
    frameDeadline = rafTime + activeFrameTime; //frameDeadline是当前时间加上一帧的时间
    if (!isMessageEventScheduled) {
      isMessageEventScheduled = true;
      /**
       * window.postMessage 是放在任务队列里，
       * 调用requestAnimationFrameWithTimeout，默认会先执行浏览器的动画， 然后才会执行任务队列的，
       * 执行两个任务（浏览器动画+js）的时间和为33
       */
      window.postMessage(messageKey, '*');
    }
  };
  /**
   * 开始进入调度，设置调度的内容，用scheduledHostCallback和timeoutTime这两个全局变量记录回调函数和对应的过期时间
   */
  requestHostCallback = function(callback, absoluteTimeout) {
    scheduledHostCallback = callback;
    timeoutTime = absoluteTimeout;
    if (isFlushingHostCallback || absoluteTimeout < 0) {
      // 如果已经超时，直接调用方法
      window.postMessage(messageKey, '*');
    } else if (!isAnimationFrameScheduled) {
      // isAnimationFrameScheduled 为false，说明还没有进入调度循环
     
      /**
       * 调用requestAnimationFrameWithTimeout，
       * 其实就是调用requestAnimationFrame在加上设置了一个100ms的定时器，防止requestAnimationFrame太久不触发。
       * 
       * isAnimationFrameScheduled  是否已经开始调用requestAnimationFrame
       */
      isAnimationFrameScheduled = true;
      requestAnimationFrameWithTimeout(animationTick);
    }
  };
   
  cancelHostCallback = function() {
    scheduledHostCallback = null;
    isMessageEventScheduled = false;
    timeoutTime = -1;
  };
}

export {
  ImmediatePriority as unstable_ImmediatePriority,
  UserBlockingPriority as unstable_UserBlockingPriority,
  NormalPriority as unstable_NormalPriority,
  IdlePriority as unstable_IdlePriority,
  unstable_runWithPriority,
  unstable_scheduleCallback,
  unstable_cancelCallback,
  unstable_wrapCallback,
  unstable_getCurrentPriorityLevel,
  getCurrentTime as unstable_now,
};
