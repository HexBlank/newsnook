/**
 * 撤销手势识别阶段临时创建的合成层。
 *
 * Android WebView 在原生滚动已经接管后，如果滚动节点或其祖先仍保留一个
 * `translate3d(0, 0, 0)`，偶尔会把后续触摸留在失效的合成滚动层中。
 */
export function clearGestureCompositorStyles(element: HTMLElement): void {
  element.style.transform = ''
  element.style.transition = ''
  element.style.willChange = ''
}
