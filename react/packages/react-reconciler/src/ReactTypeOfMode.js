/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

export type TypeOfMode = number;

/**
 * 二进制定义
 * 原因： 二进制与或可以判断某一个mode上是否有某个属性
 * var a = 0b000;
 * var b = 0b001;
 * var c = 0b010;
 * var d = 0b100;
 * var mode = a;（默认是NoContext）
 * 判断mode 是否有b属性：mode & b = 0 (代表没有b属性)
 * 给mode添加b属性： mode = mode | b  = 1
 * 给mode添加c属性： mode = mode | c  = 2
 */
export const NoContext = 0b000;
export const ConcurrentMode = 0b001;
export const StrictMode = 0b010;
export const ProfileMode = 0b100;
