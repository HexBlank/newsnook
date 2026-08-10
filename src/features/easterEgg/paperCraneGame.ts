export type CraneGameState = 'START' | 'PLAYING' | 'GAMEOVER'

export type CraneGameApi = {
  destroy: () => void
  start: () => void
  restart: () => void
  getScore: () => number
}

type Hosts = {
  canvas: HTMLCanvasElement
  root: HTMLElement
  onState: (state: CraneGameState) => void
  onScore: (score: number) => void
}

type BambooDetail = {
  y: number
  slant: number
  hasLeaf: boolean
  leafLeft: boolean
}

type Bamboo = {
  x: number
  topHeight: number
  bottomY: number
  bottomHeight: number
  w: number
  passed: boolean
  topDetails: BambooDetail[]
  bottomDetails: BambooDetail[]
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
}

type Splash = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  size: number
}

/** 纸鹤行：canvas 游戏引擎，事件绑在 root 上以免污染全局。 */
export function mountPaperCraneGame({ canvas, root, onState, onScore }: Hosts): CraneGameApi {
  const raw = canvas.getContext('2d')
  if (!raw) {
    return {
      destroy: () => undefined,
      start: () => undefined,
      restart: () => undefined,
      getScore: () => 0,
    }
  }
  const ctx = raw

  let width = 0
  let height = 0
  let frames = 0
  let score = 0
  let gameState: CraneGameState = 'START'
  let raf = 0
  let disposed = false
  let inkSplashes: Splash[] = []

  const crane = {
    x: 0,
    y: 0,
    vy: 0,
    width: 30,
    height: 20,
    gravity: 0.25,
    jump: -6,
    rotation: 0,
    reset() {
      this.x = width * 0.3
      this.y = height / 2
      this.vy = 0
      this.rotation = 0
    },
    flap() {
      this.vy = this.jump
    },
    update() {
      this.vy += this.gravity
      this.y += this.vy
      this.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, this.vy * 0.1))
      if (this.y >= height - this.height / 2 || this.y <= this.height / 2) {
        setGameOver()
      }
    },
    draw() {
      ctx.save()
      ctx.translate(this.x, this.y)
      ctx.rotate(this.rotation)

      ctx.fillStyle = 'rgba(163, 67, 67, 0.9)'
      ctx.strokeStyle = 'rgba(120, 40, 40, 0.8)'
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'

      ctx.beginPath()
      ctx.moveTo(15, 0)
      ctx.lineTo(5, -5)
      ctx.lineTo(-5, 2)
      ctx.lineTo(-15, -10)
      ctx.lineTo(-10, 5)
      ctx.lineTo(0, 10)
      ctx.lineTo(15, 0)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = 'rgba(180, 80, 80, 0.9)'
      ctx.beginPath()
      ctx.moveTo(-5, 2)
      ctx.lineTo(5, -15)
      ctx.lineTo(2, 5)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = '#2c2a26'
      ctx.beginPath()
      ctx.arc(8, -2, 1, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()
    },
  }

  const bamboos = {
    items: [] as Bamboo[],
    gap: 160,
    dx: 2.5,
    reset() {
      this.items = []
      this.gap = Math.max(140, height * 0.25)
    },
    add() {
      const minHeight = 50
      const maxHeight = height - this.gap - minHeight
      const h = Math.floor(Math.random() * (maxHeight - minHeight + 1) + minHeight)
      const w = 40 + Math.random() * 20
      const bottomY = h + this.gap
      const bottomHeight = height - bottomY

      const topDetails: BambooDetail[] = []
      for (let ny = 20; ny < h; ny += 50 + Math.random() * 20) {
        topDetails.push({
          y: ny,
          slant: Math.random() * 4 - 2,
          hasLeaf: Math.random() > 0.5,
          leafLeft: Math.random() > 0.5,
        })
      }

      const bottomDetails: BambooDetail[] = []
      for (let ny = bottomY; ny < bottomY + bottomHeight - 20; ny += 50 + Math.random() * 20) {
        bottomDetails.push({
          y: ny,
          slant: Math.random() * 4 - 2,
          hasLeaf: Math.random() > 0.5,
          leafLeft: Math.random() > 0.5,
        })
      }

      this.items.push({
        x: width,
        topHeight: h,
        bottomY,
        bottomHeight,
        w,
        passed: false,
        topDetails,
        bottomDetails,
      })
    },
    update() {
      if (frames % 120 === 0) this.add()

      for (let i = 0; i < this.items.length; i++) {
        const b = this.items[i]!
        b.x -= this.dx

        const cx = crane.x
        const cy = crane.y
        const r = 10

        if (cx + r > b.x && cx - r < b.x + b.w) {
          if (cy - r < b.topHeight || cy + r > b.bottomY) {
            setGameOver()
          }
        }

        if (b.x + b.w < cx && !b.passed) {
          score += 1
          onScore(score)
          b.passed = true
          createInkSplash(cx, cy)
        }

        if (b.x + b.w < 0) {
          this.items.shift()
          i -= 1
        }
      }
    },
    draw() {
      ctx.globalCompositeOperation = 'multiply'

      for (const b of this.items) {
        ctx.fillStyle = 'rgba(70, 75, 70, 0.4)'
        ctx.fillRect(b.x, 0, b.w, b.topHeight)
        this.drawBambooDetails(b.x, b.w, b.topDetails)
        ctx.fillRect(b.x, b.bottomY, b.w, b.bottomHeight)
        this.drawBambooDetails(b.x, b.w, b.bottomDetails)
      }

      ctx.globalCompositeOperation = 'source-over'
    },
    drawBambooDetails(x: number, w: number, details: BambooDetail[]) {
      for (const detail of details) {
        const ny = detail.y
        ctx.beginPath()
        ctx.moveTo(x - 2, ny)
        ctx.lineTo(x + w + 2, ny + detail.slant)
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(30, 35, 30, 0.6)'
        ctx.stroke()

        if (detail.hasLeaf) {
          ctx.beginPath()
          const lx = detail.leafLeft ? x : x + w
          const dir = detail.leafLeft ? -1 : 1
          ctx.moveTo(lx, ny)
          ctx.quadraticCurveTo(lx + 20 * dir, ny - 10, lx + 30 * dir, ny + 10)
          ctx.quadraticCurveTo(lx + 10 * dir, ny + 5, lx, ny)
          ctx.fillStyle = 'rgba(50, 55, 50, 0.5)'
          ctx.fill()
        }
      }
    },
  }

  const particles = {
    items: [] as Particle[],
    init() {
      this.items = []
      for (let i = 0; i < 30; i++) {
        this.items.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: -0.5 - Math.random(),
          vy: 0.2 + Math.random() * 0.5,
          size: Math.random() * 2 + 0.5,
          alpha: Math.random() * 0.5 + 0.1,
        })
      }
    },
    updateAndDraw() {
      ctx.fillStyle = 'rgba(60, 50, 40, 0.5)'
      for (const p of this.items) {
        p.x += p.vx
        p.y += p.vy
        p.x += Math.sin(frames * 0.02 + p.y) * 0.5
        if (p.x < 0) p.x = width
        if (p.y > height) p.y = 0
        ctx.globalAlpha = p.alpha
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },
  }

  function createInkSplash(x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      inkSplashes.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1,
        size: Math.random() * 4 + 2,
      })
    }
  }

  function updateDrawSplashes() {
    ctx.fillStyle = 'rgba(163, 67, 67, 0.6)'
    for (let i = inkSplashes.length - 1; i >= 0; i--) {
      const s = inkSplashes[i]!
      s.x += s.vx
      s.y += s.vy
      s.life -= 0.02
      s.size += 0.1
      if (s.life <= 0) {
        inkSplashes.splice(i, 1)
        continue
      }
      ctx.globalAlpha = Math.max(0, s.life)
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  function resize() {
    const rect = root.getBoundingClientRect()
    width = Math.max(1, Math.floor(rect.width))
    height = Math.max(1, Math.floor(rect.height))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    bamboos.gap = Math.max(140, height * 0.25)
    // 略降移动端横向速度，手感更稳
    bamboos.dx = width < 480 ? 2.1 : 2.5
    if (gameState === 'START') {
      crane.x = width * 0.3
      crane.y = height / 2
    }
  }

  function setState(next: CraneGameState) {
    gameState = next
    onState(next)
  }

  function setGameOver() {
    if (gameState !== 'PLAYING') return
    setState('GAMEOVER')
    frames = 0
  }

  function start() {
    setState('PLAYING')
    crane.flap()
  }

  function resetGame() {
    score = 0
    onScore(0)
    frames = 0
    crane.reset()
    bamboos.reset()
    inkSplashes = []
  }

  function restart() {
    resetGame()
    start()
  }

  function handleInput(event: Event) {
    const target = event.target as HTMLElement | null
    if (target?.closest('[data-crane-ui]')) return

    if (event.type === 'touchstart' || (event instanceof KeyboardEvent && event.code === 'Space')) {
      event.preventDefault()
    }

    if (gameState === 'PLAYING') {
      crane.flap()
    } else if (gameState === 'START') {
      start()
    } else if (gameState === 'GAMEOVER' && frames > 30) {
      restart()
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.code === 'Space') handleInput(event)
  }

  function drawBackground() {
    ctx.clearRect(0, 0, width, height)
    const grad = ctx.createLinearGradient(0, 0, 0, height)
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.1)')
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.05)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)
  }

  function loop() {
    if (disposed) return
    drawBackground()
    particles.updateAndDraw()

    if (gameState === 'START') {
      crane.y = height / 2 + Math.sin(Date.now() / 300) * 10
      crane.draw()
    } else if (gameState === 'PLAYING') {
      bamboos.update()
      bamboos.draw()
      crane.update()
      crane.draw()
      updateDrawSplashes()
      frames += 1
    } else if (gameState === 'GAMEOVER') {
      bamboos.draw()
      crane.y += 4
      if (crane.y < height + 50) crane.draw()
      updateDrawSplashes()
      frames += 1
    }

    raf = requestAnimationFrame(loop)
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null
  ro?.observe(root)
  window.addEventListener('resize', resize)
  root.addEventListener('mousedown', handleInput)
  root.addEventListener('touchstart', handleInput, { passive: false })
  window.addEventListener('keydown', onKeyDown)

  resize()
  particles.init()
  resetGame()
  onState('START')
  onScore(0)
  raf = requestAnimationFrame(loop)

  return {
    destroy() {
      disposed = true
      cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener('resize', resize)
      root.removeEventListener('mousedown', handleInput)
      root.removeEventListener('touchstart', handleInput)
      window.removeEventListener('keydown', onKeyDown)
    },
    start,
    restart,
    getScore: () => score,
  }
}
