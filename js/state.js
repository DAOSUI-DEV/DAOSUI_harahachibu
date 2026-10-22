/* 画面の状態（いま見ている日付・タブ）と再描画 */
import { today } from './util.js';
export const state = { cur: today(), tab: 'today', calMonth: null, graphRange: 30, sugTab: 'konbini', sugMode: 'next' };
let renderFn = () => {};
export const setRender = fn => { renderFn = fn; };
export const rerender = () => renderFn();
