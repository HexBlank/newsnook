import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'
import { clearGestureCompositorStyles } from '../src/lib/gestureStyles'

const { document } = parseHTML('<div id="surface"></div>')
const surface = document.querySelector<HTMLElement>('#surface')
assert.ok(surface)

surface.style.transform = 'translate3d(0, 0, 0)'
surface.style.transition = 'transform 220ms ease'
surface.style.willChange = 'transform'

clearGestureCompositorStyles(surface)

assert.equal(surface.style.transform, '')
assert.equal(surface.style.transition, '')
assert.equal(surface.style.willChange, '')

console.log('gesture-styles: ok')
