/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactElement, Source} from 'shared/ReactElementType';
import type {ReactFragment, ReactPortal, RefObject} from 'shared/ReactTypes';
import type {WorkTag} from 'shared/ReactWorkTags';
import type {TypeOfMode} from './ReactTypeOfMode';
import type {SideEffectTag} from 'shared/ReactSideEffectTags';
import type {ExpirationTime} from './ReactFiberExpirationTime';
import type {UpdateQueue} from './ReactUpdateQueue';
import type {ContextDependency} from './ReactFiberNewContext';

import invariant from 'shared/invariant';
import warningWithoutStack from 'shared/warningWithoutStack';
import {enableProfilerTimer} from 'shared/ReactFeatureFlags';
import {NoEffect} from 'shared/ReactSideEffectTags';
import {
  IndeterminateComponent,
  ClassComponent,
  HostRoot,
  HostComponent,
  HostText,
  HostPortal,
  ForwardRef,
  Fragment,
  Mode,
  ContextProvider,
  ContextConsumer,
  Profiler,
  SuspenseComponent,
  FunctionComponent,
  MemoComponent,
  LazyComponent,
} from 'shared/ReactWorkTags';
import getComponentName from 'shared/getComponentName';

import {isDevToolsPresent} from './ReactFiberDevToolsHook';
import {NoWork} from './ReactFiberExpirationTime';
import {
  NoContext,
  ConcurrentMode,
  ProfileMode,
  StrictMode,
} from './ReactTypeOfMode';
import {
  REACT_FORWARD_REF_TYPE,
  REACT_FRAGMENT_TYPE,
  REACT_STRICT_MODE_TYPE,
  REACT_PROFILER_TYPE,
  REACT_PROVIDER_TYPE,
  REACT_CONTEXT_TYPE,
  REACT_CONCURRENT_MODE_TYPE,
  REACT_SUSPENSE_TYPE,
  REACT_MEMO_TYPE,
  REACT_LAZY_TYPE,
} from 'shared/ReactSymbols';

let hasBadMapPolyfill;

if (__DEV__) {
  hasBadMapPolyfill = false;
  try {
    const nonExtensibleObject = Object.preventExtensions({});
    const testMap = new Map([[nonExtensibleObject, null]]);
    const testSet = new Set([nonExtensibleObject]);
    // This is necessary for Rollup to not consider these unused.
    // https://github.com/rollup/rollup/issues/1771
    // TODO: we can remove these if Rollup fixes the bug.
    testMap.set(0, 0);
    testSet.add(0);
  } catch (e) {
    // TODO: Consider warning about bad polyfills
    hasBadMapPolyfill = true;
  }
}

// A Fiber is work on a Component that needs to be done or was done. There can
// be more than one per component.
export type Fiber = {|
  // These first fields are conceptually members of an Instance. This used to
  // be split into a separate type and intersected with the other Fiber fields,
  // but until Flow fixes its intersection bugs, we've merged them into a
  // single type.

  // An Instance is shared between all versions of a component. We can easily
  // break this out into a separate object to avoid copying so much to the
  // alternate versions of the tree. We put this on a single object for now to
  // minimize the number of objects created during the initial render.

  // Tag identifying the type of fiber.

  // 匹配不同的组件类型，class组件，function组件
  tag: WorkTag,

  // Unique identifier of this child.
  // ReactElement里面的key
  key: null | string,


  // ReactElement.type, 也就是我们调用"createElement的第一个参数
  elementType: any,

  // The resolved function/class/ associated with this fiber.
  // 用来记录lazy component之后，返回的是class组件/function组件
  type: any,

  // The local state associated with this fiber.

  // 节点的实际的实例，class组件实例，function没有实例（没有该属性）
  stateNode: any,

  return: Fiber | null,

  // 第一个孩子节点
  child: Fiber | null,
  // 兄弟节点
  sibling: Fiber | null,
  index: number,

  ref: null | (((handle: mixed) => void) & {_stringRef: ?string}) | RefObject,
  // setState 更新后，pendingProps是新的props，memoizedProps是旧的props
  pendingProps: any, 
  memoizedProps: any, 

  // 
  updateQueue: UpdateQueue<any> | null,

  // The state used to create the output

  // 旧的state
  memoizedState: any,

  firstContextDependency: ContextDependency<mixed> | null,

  // concurrentMode那几种
  mode: TypeOfMode,

  effectTag: SideEffectTag,

  nextEffect: Fiber | null,

  firstEffect: Fiber | null,
  lastEffect: Fiber | null,

  //  当前节点产生更新的过期时间
  expirationTime: ExpirationTime,

  // 字节点更新的过期时间
  childExpirationTime: ExpirationTime,


  // 在Fiber树更新的过程中，每个Fiber都会有一个跟其对应的Fiber
  // 我们称他为current(当前fiber)<=>workInprogress(即将要更新的Fiber)
  // 在渲染完成后，他们会交换位置workInprogress会变成current。
  alternate: Fiber | null,

  actualDuration?: number,

  actualStartTime?: number,

  selfBaseDuration?: number,

  treeBaseDuration?: number,

  _debugID?: number,
  _debugSource?: Source | null,
  _debugOwner?: Fiber | null,
  _debugIsCurrentlyTiming?: boolean,
|};

let debugCounter;

if (__DEV__) {
  debugCounter = 1;
}

function FiberNode(
  tag: WorkTag,
  pendingProps: mixed,
  key: null | string,
  mode: TypeOfMode,
) {
  // Instance
  this.tag = tag;
  this.key = key;
  this.elementType = null;
  this.type = null;
  this.stateNode = null;

  // Fiber
  this.return = null;
  this.child = null;
  this.sibling = null;
  this.index = 0;

  this.ref = null;

  this.pendingProps = pendingProps;
  this.memoizedProps = null;
  this.updateQueue = null;
  this.memoizedState = null;
  this.firstContextDependency = null;

  this.mode = mode;

  // Effects
  this.effectTag = NoEffect;
  this.nextEffect = null;

  this.firstEffect = null;
  this.lastEffect = null;

  this.expirationTime = NoWork;
  this.childExpirationTime = NoWork;

  this.alternate = null;

  if (enableProfilerTimer) {
    this.actualDuration = 0;
    this.actualStartTime = -1;
    this.selfBaseDuration = 0;
    this.treeBaseDuration = 0;
  }

  if (__DEV__) {
    this._debugID = debugCounter++;
    this._debugSource = null;
    this._debugOwner = null;
    this._debugIsCurrentlyTiming = false;
    if (!hasBadMapPolyfill && typeof Object.preventExtensions === 'function') {
      Object.preventExtensions(this);
    }
  }
}

// This is a constructor function, rather than a POJO constructor, still
// please ensure we do the following:
// 1) Nobody should add any instance methods on this. Instance methods can be
//    more difficult to predict when they get optimized and they are almost
//    never inlined properly in static compilers.
// 2) Nobody should rely on `instanceof Fiber` for type testing. We should
//    always know when it is a fiber.
// 3) We might want to experiment with using numeric keys since they are easier
//    to optimize in a non-JIT environment.
// 4) We can easily go from a constructor to a createFiber object literal if that
//    is faster.
// 5) It should be easy to port this to a C struct and keep a C implementation
//    compatible.
const createFiber = function(
  tag: WorkTag,
  pendingProps: mixed,
  key: null | string,
  mode: TypeOfMode,
): Fiber {
  // $FlowFixMe: the shapes are exact here but Flow doesn't like constructors
  return new FiberNode(tag, pendingProps, key, mode);
};

function shouldConstruct(Component: Function) {
  const prototype = Component.prototype;
  return !!(prototype && prototype.isReactComponent);
}

export function isSimpleFunctionComponent(type: any) {
  return (
    typeof type === 'function' &&
    !shouldConstruct(type) &&
    type.defaultProps === undefined
  );
}

export function resolveLazyComponentTag(Component: Function): WorkTag {
  if (typeof Component === 'function') {
    return shouldConstruct(Component) ? ClassComponent : FunctionComponent;
  } else if (Component !== undefined && Component !== null) {
    const $$typeof = Component.$$typeof;
    if ($$typeof === REACT_FORWARD_REF_TYPE) {
      return ForwardRef;
    }
    if ($$typeof === REACT_MEMO_TYPE) {
      return MemoComponent;
    }
  }
  return IndeterminateComponent;
}

// This is used to create an alternate fiber to do work on.
export function createWorkInProgress(
  current: Fiber,
  pendingProps: any,
  expirationTime: ExpirationTime,
): Fiber {
  let workInProgress = current.alternate;
  if (workInProgress === null) {
    // We use a double buffering pooling technique because we know that we'll
    // only ever need at most two versions of a tree. We pool the "other" unused
    // node that we're free to reuse. This is lazily created to avoid allocating
    // extra objects for things that are never updated. It also allow us to
    // reclaim the extra memory if needed.
    workInProgress = createFiber(
      current.tag,
      pendingProps,
      current.key,
      current.mode,
    );
    workInProgress.elementType = current.elementType;
    workInProgress.type = current.type;
    workInProgress.stateNode = current.stateNode;

    if (__DEV__) {
      // DEV-only fields
      workInProgress._debugID = current._debugID;
      workInProgress._debugSource = current._debugSource;
      workInProgress._debugOwner = current._debugOwner;
    }

    workInProgress.alternate = current;
    current.alternate = workInProgress;
  } else {
    workInProgress.pendingProps = pendingProps;

    // We already have an alternate.
    // Reset the effect tag.
    workInProgress.effectTag = NoEffect;

    // The effect list is no longer valid.
    workInProgress.nextEffect = null;
    workInProgress.firstEffect = null;
    workInProgress.lastEffect = null;

    if (enableProfilerTimer) {
      // We intentionally reset, rather than copy, actualDuration & actualStartTime.
      // This prevents time from endlessly accumulating in new commits.
      // This has the downside of resetting values for different priority renders,
      // But works for yielding (the common case) and should support resuming.
      workInProgress.actualDuration = 0;
      workInProgress.actualStartTime = -1;
    }
  }

  workInProgress.childExpirationTime = current.childExpirationTime;
  workInProgress.expirationTime = current.expirationTime;

  workInProgress.child = current.child;
  workInProgress.memoizedProps = current.memoizedProps;
  workInProgress.memoizedState = current.memoizedState;
  workInProgress.updateQueue = current.updateQueue;
  workInProgress.firstContextDependency = current.firstContextDependency;

  // These will be overridden during the parent's reconciliation
  workInProgress.sibling = current.sibling;
  workInProgress.index = current.index;
  workInProgress.ref = current.ref;

  if (enableProfilerTimer) {
    workInProgress.selfBaseDuration = current.selfBaseDuration;
    workInProgress.treeBaseDuration = current.treeBaseDuration;
  }

  return workInProgress;
}

export function createHostRootFiber(isConcurrent: boolean): Fiber {
  let mode = isConcurrent ? ConcurrentMode | StrictMode : NoContext;

  if (enableProfilerTimer && isDevToolsPresent) {
    // Always collect profile timings when DevTools are present.
    // This enables DevTools to start capturing timing at any point–
    // Without some nodes in the tree having empty base times.
    mode |= ProfileMode;
  }

  return createFiber(HostRoot, null, null, mode);
}

export function createFiberFromTypeAndProps(
  type: any, // React$ElementType
  key: null | string,
  pendingProps: any,
  owner: null | Fiber,
  mode: TypeOfMode,
  expirationTime: ExpirationTime,
): Fiber {
  let fiber;

  let fiberTag = IndeterminateComponent;
  // The resolved type is set if we know what the final type will be. I.e. it's not lazy.
  let resolvedType = type;
  if (typeof type === 'function') {
    if (shouldConstruct(type)) {
      fiberTag = ClassComponent;
    }
  } else if (typeof type === 'string') {
    fiberTag = HostComponent;
  } else {
    getTag: switch (type) {
      case REACT_FRAGMENT_TYPE:
        return createFiberFromFragment(
          pendingProps.children,
          mode,
          expirationTime,
          key,
        );
      case REACT_CONCURRENT_MODE_TYPE:
        return createFiberFromMode(
          pendingProps,
          mode | ConcurrentMode | StrictMode,
          expirationTime,
          key,
        );
      case REACT_STRICT_MODE_TYPE:
        return createFiberFromMode(
          pendingProps,
          mode | StrictMode,
          expirationTime,
          key,
        );
      case REACT_PROFILER_TYPE:
        return createFiberFromProfiler(pendingProps, mode, expirationTime, key);
      case REACT_SUSPENSE_TYPE:
        return createFiberFromSuspense(pendingProps, mode, expirationTime, key);
      default: {
        if (typeof type === 'object' && type !== null) {
          switch (type.$$typeof) {
            case REACT_PROVIDER_TYPE:
              fiberTag = ContextProvider;
              break getTag;
            case REACT_CONTEXT_TYPE:
              // This is a consumer
              fiberTag = ContextConsumer;
              break getTag;
            case REACT_FORWARD_REF_TYPE:
              fiberTag = ForwardRef;
              break getTag;
            case REACT_MEMO_TYPE:
              fiberTag = MemoComponent;
              break getTag;
            case REACT_LAZY_TYPE:
              fiberTag = LazyComponent;
              resolvedType = null;
              break getTag;
          }
        }
        let info = '';
        if (__DEV__) {
          if (
            type === undefined ||
            (typeof type === 'object' &&
              type !== null &&
              Object.keys(type).length === 0)
          ) {
            info +=
              ' You likely forgot to export your component from the file ' +
              "it's defined in, or you might have mixed up default and " +
              'named imports.';
          }
          const ownerName = owner ? getComponentName(owner.type) : null;
          if (ownerName) {
            info += '\n\nCheck the render method of `' + ownerName + '`.';
          }
        }
        invariant(
          false,
          'Element type is invalid: expected a string (for built-in ' +
            'components) or a class/function (for composite components) ' +
            'but got: %s.%s',
          type == null ? type : typeof type,
          info,
        );
      }
    }
  }

  fiber = createFiber(fiberTag, pendingProps, key, mode);
  fiber.elementType = type;
  fiber.type = resolvedType;
  fiber.expirationTime = expirationTime;

  return fiber;
}

export function createFiberFromElement(
  element: ReactElement,
  mode: TypeOfMode,
  expirationTime: ExpirationTime,
): Fiber {
  let owner = null;
  if (__DEV__) {
    owner = element._owner;
  }
  const type = element.type;
  const key = element.key;
  const pendingProps = element.props;
  const fiber = createFiberFromTypeAndProps(
    type,
    key,
    pendingProps,
    owner,
    mode,
    expirationTime,
  );
  if (__DEV__) {
    fiber._debugSource = element._source;
    fiber._debugOwner = element._owner;
  }
  return fiber;
}

export function createFiberFromFragment(
  elements: ReactFragment,
  mode: TypeOfMode,
  expirationTime: ExpirationTime,
  key: null | string,
): Fiber {
  const fiber = createFiber(Fragment, elements, key, mode);
  fiber.expirationTime = expirationTime;
  return fiber;
}

function createFiberFromProfiler(
  pendingProps: any,
  mode: TypeOfMode,
  expirationTime: ExpirationTime,
  key: null | string,
): Fiber {
  if (__DEV__) {
    if (
      typeof pendingProps.id !== 'string' ||
      typeof pendingProps.onRender !== 'function'
    ) {
      warningWithoutStack(
        false,
        'Profiler must specify an "id" string and "onRender" function as props',
      );
    }
  }

  const fiber = createFiber(Profiler, pendingProps, key, mode | ProfileMode);
  // TODO: The Profiler fiber shouldn't have a type. It has a tag.
  fiber.elementType = REACT_PROFILER_TYPE;
  fiber.type = REACT_PROFILER_TYPE;
  fiber.expirationTime = expirationTime;

  return fiber;
}

function createFiberFromMode(
  pendingProps: any,
  mode: TypeOfMode,
  expirationTime: ExpirationTime,
  key: null | string,
): Fiber {
  const fiber = createFiber(Mode, pendingProps, key, mode);

  // TODO: The Mode fiber shouldn't have a type. It has a tag.
  const type =
    (mode & ConcurrentMode) === NoContext
      ? REACT_STRICT_MODE_TYPE
      : REACT_CONCURRENT_MODE_TYPE;
  fiber.elementType = type;
  fiber.type = type;

  fiber.expirationTime = expirationTime;
  return fiber;
}

export function createFiberFromSuspense(
  pendingProps: any,
  mode: TypeOfMode,
  expirationTime: ExpirationTime,
  key: null | string,
) {
  const fiber = createFiber(SuspenseComponent, pendingProps, key, mode);

  // TODO: The SuspenseComponent fiber shouldn't have a type. It has a tag.
  const type = REACT_SUSPENSE_TYPE;
  fiber.elementType = type;
  fiber.type = type;

  fiber.expirationTime = expirationTime;
  return fiber;
}

export function createFiberFromText(
  content: string,
  mode: TypeOfMode,
  expirationTime: ExpirationTime,
): Fiber {
  const fiber = createFiber(HostText, content, null, mode);
  fiber.expirationTime = expirationTime;
  return fiber;
}

export function createFiberFromHostInstanceForDeletion(): Fiber {
  const fiber = createFiber(HostComponent, null, null, NoContext);
  // TODO: These should not need a type.
  fiber.elementType = 'DELETED';
  fiber.type = 'DELETED';
  return fiber;
}

export function createFiberFromPortal(
  portal: ReactPortal,
  mode: TypeOfMode,
  expirationTime: ExpirationTime,
): Fiber {
  const pendingProps = portal.children !== null ? portal.children : [];
  const fiber = createFiber(HostPortal, pendingProps, portal.key, mode);
  fiber.expirationTime = expirationTime;
  fiber.stateNode = {
    containerInfo: portal.containerInfo,
    pendingChildren: null, // Used by persistent updates
    implementation: portal.implementation,
  };
  return fiber;
}

// Used for stashing WIP properties to replay failed work in DEV.
export function assignFiberPropertiesInDEV(
  target: Fiber | null,
  source: Fiber,
): Fiber {
  if (target === null) {
    // This Fiber's initial properties will always be overwritten.
    // We only use a Fiber to ensure the same hidden class so DEV isn't slow.
    target = createFiber(IndeterminateComponent, null, null, NoContext);
  }

  // This is intentionally written as a list of all properties.
  // We tried to use Object.assign() instead but this is called in
  // the hottest path, and Object.assign() was too slow:
  // https://github.com/facebook/react/issues/12502
  // This code is DEV-only so size is not a concern.

  target.tag = source.tag;
  target.key = source.key;
  target.elementType = source.elementType;
  target.type = source.type;
  target.stateNode = source.stateNode;
  target.return = source.return;
  target.child = source.child;
  target.sibling = source.sibling;
  target.index = source.index;
  target.ref = source.ref;
  target.pendingProps = source.pendingProps;
  target.memoizedProps = source.memoizedProps;
  target.updateQueue = source.updateQueue;
  target.memoizedState = source.memoizedState;
  target.firstContextDependency = source.firstContextDependency;
  target.mode = source.mode;
  target.effectTag = source.effectTag;
  target.nextEffect = source.nextEffect;
  target.firstEffect = source.firstEffect;
  target.lastEffect = source.lastEffect;
  target.expirationTime = source.expirationTime;
  target.childExpirationTime = source.childExpirationTime;
  target.alternate = source.alternate;
  if (enableProfilerTimer) {
    target.actualDuration = source.actualDuration;
    target.actualStartTime = source.actualStartTime;
    target.selfBaseDuration = source.selfBaseDuration;
    target.treeBaseDuration = source.treeBaseDuration;
  }
  target._debugID = source._debugID;
  target._debugSource = source._debugSource;
  target._debugOwner = source._debugOwner;
  target._debugIsCurrentlyTiming = source._debugIsCurrentlyTiming;
  return target;
}
