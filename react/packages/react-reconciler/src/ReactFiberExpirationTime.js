/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import MAX_SIGNED_31_BIT_INT from './maxSigned31BitInt';

export type ExpirationTime = number;

export const NoWork = 0;
export const Sync = 1;
export const Never = MAX_SIGNED_31_BIT_INT;

const UNIT_SIZE = 10;
const MAGIC_NUMBER_OFFSET = 2;

// 1 unit of expiration time represents 10ms.
export function  msToExpirationTime(ms: number): ExpirationTime {
  // ｜0 是取整的意思， 这里除10得意思是误差在10ms以内的两个expirationTime误差会被抹平
  return ((ms / UNIT_SIZE) | 0) + MAGIC_NUMBER_OFFSET;
}

export function expirationTimeToMs(expirationTime: ExpirationTime): number {
  return (expirationTime - MAGIC_NUMBER_OFFSET) * UNIT_SIZE;
}

function ceiling(num: number, precision: number): number {
  return (((num / precision) | 0) + 1) * precision;
}

/**
 * 这里最终的公式是： 
 * ((((currentTime - 2 + 5000 / 10) / 25) | 0) + 1) * 25
 * 代表如果差值在25以内，计算出的结果是一样的，差值大于25，计算的结果是不一样的
 *  5000: LOW_PRIORITY_EXPIRATION这个传入的参数
 *  25:  LOW_PRIORITY_BATCH_SIZE
 * 
 * 
 * 
 *  这里保证了： 如果短时间多次调用setState（异步任务）, 计算出来的expirationTime结果是一样，这样他们的优先级是一致的，
 *  就可以保证不会执行多次更新，提高了性能
 * 
 * 
 * 异步任务是可以被打断的，如果异步任务的expirationTime到了，但是任务还没有执行，就会强制执行任务（防止阻塞时间太长）
 *
 * 
 * 
 * expirationTime的不同种类
 *    Sync同步 （）
 *    异步模式（可以被中断, 低优先级大概是500ms的时候，interactive（高优先级）需要50ms）
 *    指定context
*/
function computeExpirationBucket(
  currentTime,
  expirationInMs,
  bucketSizeMs,
): ExpirationTime {
  return (
    MAGIC_NUMBER_OFFSET +
    ceiling(
      currentTime - MAGIC_NUMBER_OFFSET + expirationInMs / UNIT_SIZE,
      bucketSizeMs / UNIT_SIZE,
    )
  );
}

export const LOW_PRIORITY_EXPIRATION = 5000;
export const LOW_PRIORITY_BATCH_SIZE = 250;

export function computeAsyncExpiration(
  currentTime: ExpirationTime,
): ExpirationTime {
  return computeExpirationBucket(
    currentTime,
    LOW_PRIORITY_EXPIRATION,
    LOW_PRIORITY_BATCH_SIZE,
  );
}

// We intentionally set a higher expiration time for interactive updates in
// dev than in production.
//
// If the main thread is being blocked so long that you hit the expiration,
// it's a problem that could be solved with better scheduling.
//
// People will be more likely to notice this and fix it with the long
// expiration time in development.
//
// In production we opt for better UX at the risk of masking scheduling
// problems, by expiring fast.
export const HIGH_PRIORITY_EXPIRATION = __DEV__ ? 500 : 150;
export const HIGH_PRIORITY_BATCH_SIZE = 100;

export function computeInteractiveExpiration(currentTime: ExpirationTime) {
  return computeExpirationBucket(
    currentTime,
    HIGH_PRIORITY_EXPIRATION,
    HIGH_PRIORITY_BATCH_SIZE,
  );
}
