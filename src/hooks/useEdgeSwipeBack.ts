import { useEffect, useRef } from 'react'

import {
  clampDragX,
  isSwipeBackStart,
  resolveLock,
  shouldCommit,
  velocityX,
  VELOCITY_WINDOW_MS,
  type GestureSample,
} from '../lib/edgeSwipeBack'

const SETTLE_MS = 220
const COMMIT_MIN_MS = 120
const COMMIT_MAX_MS = 280
const SETTLE_EASING = 'cubic-bezier(0.25, 0.8, 0.25, 1)'
const COMMIT_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)'

interface Options {
  containerRef: React.RefObject<HTMLElement | null>
  onBack: () => void
  disabled?: boolean
  reduced?: boolean
}

interface ActiveGesture {
  id: number
  source: 'touch' | 'pointer'
  startX: number
  startY: number
  lock: 'none' | 'horizontal'
  samples: GestureSample[]
}

function currentTranslateX(element: HTMLElement): number {
  const transform = window.getComputedStyle(element).transform
  if (!transform || transform === 'none') return 0
  try {
    return new DOMMatrixReadOnly(transform).m41
  } catch {
    return 0
  }
}

/**
 * Native-feeling left-edge back interaction.
 *
 * Touch events are used for fingers because Android WebView can cancel a pointer
 * stream as soon as its scroll recognizer wakes up. During the drag, transforms
 * are written once per animation frame directly to the compositor layer, so a
 * long article does not re-render for every movement.
 */
export function useEdgeSwipeBack({
  containerRef,
  onBack,
  disabled = false,
  reduced = false,
}: Options): void {
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    const element = containerRef.current
    if (!element || disabled) return

    const previousTouchAction = element.style.touchAction
    const previousOverscrollX = element.style.overscrollBehaviorX
    element.style.touchAction = 'pan-y pinch-zoom'
    element.style.overscrollBehaviorX = 'none'

    let active: ActiveGesture | null = null
    let dragX = 0
    let pendingX = 0
    let frame = 0
    let completionTimer = 0
    let transitionEnd: ((event: TransitionEvent) => void) | null = null
    let committing = false

    const width = () => element.clientWidth || window.innerWidth || 320

    const setActiveVisual = (value: boolean) => {
      if (value) {
        element.dataset.swipeBackActive = 'true'
        element.style.willChange = 'transform'
      } else {
        delete element.dataset.swipeBackActive
        element.style.willChange = ''
      }
    }

    const render = (value: number) => {
      dragX = value
      element.style.transform = value ? `translate3d(${value}px, 0, 0)` : 'translate3d(0, 0, 0)'
    }

    const flushFrame = () => {
      frame = 0
      render(pendingX)
    }

    const scheduleRender = (value: number) => {
      pendingX = value
      dragX = value
      if (!frame) frame = window.requestAnimationFrame(flushFrame)
    }

    const cancelFrame = () => {
      if (!frame) return
      window.cancelAnimationFrame(frame)
      frame = 0
    }

    const cancelCompletion = () => {
      if (completionTimer) window.clearTimeout(completionTimer)
      completionTimer = 0
      if (transitionEnd) element.removeEventListener('transitionend', transitionEnd)
      transitionEnd = null
    }

    const clearVisual = () => {
      cancelFrame()
      cancelCompletion()
      dragX = 0
      pendingX = 0
      element.style.transition = ''
      element.style.transform = ''
      setActiveVisual(false)
    }

    const releaseCapture = (pointerId: number) => {
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
    }

    const resetPointer = () => {
      const pointerId = active?.source === 'pointer' ? active.id : undefined
      active = null
      if (pointerId !== undefined) releaseCapture(pointerId)
    }

    const animateTo = (
      target: number,
      duration: number,
      easing: string,
      complete: () => void,
    ) => {
      cancelFrame()
      cancelCompletion()
      render(dragX)
      element.style.transition = 'none'
      // One release-time layout read guarantees that the following transform transitions.
      void element.offsetWidth

      if (duration === 0) {
        render(target)
        complete()
        return
      }

      let completed = false
      const finish = () => {
        if (completed) return
        completed = true
        cancelCompletion()
        complete()
      }

      transitionEnd = (event) => {
        if (event.target === element && event.propertyName === 'transform') finish()
      }
      element.addEventListener('transitionend', transitionEnd)
      completionTimer = window.setTimeout(finish, duration + 50)
      element.style.transition = `transform ${duration}ms ${easing}`
      render(target)
    }

    const settle = () => {
      resetPointer()
      if (dragX <= 0 || reduced) {
        clearVisual()
        return
      }
      animateTo(0, SETTLE_MS, SETTLE_EASING, clearVisual)
    }

    const commit = (releaseVelocity: number) => {
      resetPointer()
      committing = true
      const panelWidth = width()
      const remaining = Math.max(0, panelWidth - dragX)
      const velocity = Math.max(0.9, releaseVelocity)
      const duration = reduced || remaining <= panelWidth * 0.02
        ? 0
        : Math.round(
            Math.min(
              COMMIT_MAX_MS,
              Math.max(COMMIT_MIN_MS, Math.min(remaining / velocity, (remaining / panelWidth) * 320)),
            ),
          )

      animateTo(panelWidth, duration, COMMIT_EASING, () => {
        committing = false
        // Keep the committed reader off-screen until React unmounts it. Clearing
        // the transform here briefly paints the article again before onBack's
        // state update is committed, which looks like a full-page flash.
        onBackRef.current()
      })
    }

    const addSample = (sample: GestureSample) => {
      if (!active) return
      active.samples.push(sample)
      const cutoff = sample.t - VELOCITY_WINDOW_MS
      while (active.samples.length > 2 && active.samples[1].t < cutoff) {
        active.samples.shift()
      }
    }

    const begin = (
      source: ActiveGesture['source'],
      id: number,
      clientX: number,
      clientY: number,
      timeStamp: number,
      target: EventTarget | null,
    ) => {
      // Ignore new touches until a settle/commit animation has fully finished.
      // In particular, a left swipe must never catch and reverse the reader.
      if (committing || active || completionTimer) return false
      if (
        target instanceof Element &&
        target.closest('pre, [data-reader-horizontal-scroll], [data-video-gestures]')
      ) {
        return false
      }
      const visualX = currentTranslateX(element)
      if (visualX > 0) return false
      const rect = element.getBoundingClientRect()
      const layoutLeft = rect.left - visualX
      if (
        visualX <= 0 &&
        !isSwipeBackStart(clientX, clientY, {
          left: layoutLeft,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        })
      ) {
        return false
      }

      cancelCompletion()
      element.style.transition = 'none'
      render(Math.max(0, visualX))
      active = {
        id,
        source,
        startX: clientX,
        startY: clientY,
        lock: 'none',
        samples: [{ x: clientX, t: timeStamp }],
      }
      return true
    }

    const move = (
      source: ActiveGesture['source'],
      id: number,
      clientX: number,
      clientY: number,
      samples: readonly GestureSample[],
      preventDefault: () => void,
    ) => {
      if (!active || active.source !== source || id !== active.id || committing) return

      const dx = clientX - active.startX
      const dy = clientY - active.startY
      if (active.lock === 'none') {
        const lock = resolveLock(dx, dy)
        if (lock === 'none') return
        if (lock === 'vertical' || dx <= 0) {
          resetPointer()
          return
        }
        active.lock = 'horizontal'
        setActiveVisual(true)
      }

      preventDefault()
      samples.forEach(addSample)
      scheduleRender(clampDragX(dx, width()))
    }

    const end = (
      source: ActiveGesture['source'],
      id: number,
      clientX: number,
      timeStamp: number,
    ) => {
      if (!active || active.source !== source || id !== active.id) return
      if (active.lock !== 'horizontal') {
        resetPointer()
        return
      }

      addSample({ x: clientX, t: timeStamp })
      cancelFrame()
      const offset = clampDragX(clientX - active.startX, width())
      render(offset)
      const releaseVelocity = velocityX(active.samples)
      if (shouldCommit(offset, releaseVelocity, width())) commit(releaseVelocity)
      else settle()
    }

    const findTouch = (touches: TouchList, identifier: number) => {
      for (let index = 0; index < touches.length; index += 1) {
        const touch = touches.item(index)
        if (touch?.identifier === identifier) return touch
      }
      return null
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return
      const touch = event.touches.item(0)
      if (!touch) return
      begin(
        'touch',
        touch.identifier,
        touch.clientX,
        touch.clientY,
        event.timeStamp,
        event.target,
      )
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!active || active.source !== 'touch') return
      const touch = findTouch(event.touches, active.id)
      if (!touch) return
      move(
        'touch',
        touch.identifier,
        touch.clientX,
        touch.clientY,
        [{ x: touch.clientX, t: event.timeStamp }],
        () => {
          if (event.cancelable) event.preventDefault()
        },
      )
    }

    const onTouchEnd = (event: TouchEvent) => {
      if (!active || active.source !== 'touch') return
      const touch = findTouch(event.changedTouches, active.id)
      if (touch) end('touch', touch.identifier, touch.clientX, event.timeStamp)
    }

    const onTouchCancel = (event: TouchEvent) => {
      if (!active || active.source !== 'touch') return
      if (findTouch(event.changedTouches, active.id)) settle()
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.pointerType !== 'pen') return
      if (
        begin(
          'pointer',
          event.pointerId,
          event.clientX,
          event.clientY,
          event.timeStamp,
          event.target,
        )
      ) {
        element.setPointerCapture(event.pointerId)
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      const coalesced = event.getCoalescedEvents?.() ?? []
      const points = coalesced.length > 0 ? coalesced : [event]
      move(
        'pointer',
        event.pointerId,
        event.clientX,
        event.clientY,
        points.map((point) => ({ x: point.clientX, t: point.timeStamp })),
        () => {
          if (event.cancelable) event.preventDefault()
        },
      )
    }

    const onPointerUp = (event: PointerEvent) => {
      end('pointer', event.pointerId, event.clientX, event.timeStamp)
    }

    const onPointerCancel = (event: PointerEvent) => {
      if (active?.source === 'pointer' && event.pointerId === active.id) settle()
    }

    element.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchCancel)
    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerCancel)

    return () => {
      element.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchCancel)
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerCancel)
      active = null
      committing = false
      clearVisual()
      element.style.touchAction = previousTouchAction
      element.style.overscrollBehaviorX = previousOverscrollX
    }
  }, [containerRef, disabled, reduced])
}
