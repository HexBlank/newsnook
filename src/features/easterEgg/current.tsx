import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

import {
  mountPaperCraneGame,
  type CraneGameApi,
  type CraneGameState,
} from './paperCraneGame'

const WASHI_NOISE =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E\")"

/** 本版彩蛋：纸鹤行（整页自绘；换版时删除本文件与 paperCraneGame.ts） */
export function CurrentEasterEgg({ onClose }: { onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const apiRef = useRef<CraneGameApi | null>(null)
  const [gameState, setGameState] = useState<CraneGameState>('START')
  const [score, setScore] = useState(0)

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return

    const api = mountPaperCraneGame({
      canvas,
      root,
      onState: setGameState,
      onScore: setScore,
    })
    apiRef.current = api
    return () => {
      api.destroy()
      apiRef.current = null
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className="relative -mt-[var(--sat)] -mb-[var(--sab)] flex min-h-0 flex-1 flex-col overflow-hidden pt-[var(--sat)] pb-[var(--sab)] text-[#2c2a26] touch-none select-none"
      style={{
        backgroundColor: '#e8e4d9',
        backgroundImage: WASHI_NOISE,
        fontFamily: "var(--font-display), 'Noto Serif SC', 'Songti SC', serif",
      }}
    >
      <div className="relative mx-auto h-full w-full max-w-[800px] flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

        {gameState === 'PLAYING' && (
          <div
            className="pointer-events-none absolute top-[max(1.25rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 text-[clamp(1.5rem,6vw,2rem)] font-light tracking-[0.12em] text-[#8c3b3b]/80"
            aria-live="polite"
          >
            {score}
          </div>
        )}

        {gameState === 'START' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
            <h1 className="text-[clamp(2rem,9vw,3rem)] font-light tracking-[0.45em] text-[#2c2a26] drop-shadow-sm">
              纸鹤行
            </h1>
            <p className="mt-3 text-[clamp(0.95rem,3.5vw,1.2rem)] tracking-[0.2em] text-[#5a574f]">
              万物静观皆自得
            </p>
            <button
              type="button"
              data-crane-ui
              onClick={() => apiRef.current?.start()}
              className="crane-btn mt-10"
            >
              起飞
            </button>
            <p className="mt-8 max-w-[16rem] text-[11px] leading-relaxed tracking-[0.14em] text-[#5a574f]/80 md:hidden">
              轻触屏幕振翅 · 穿越竹隙
            </p>
            <p className="mt-8 hidden max-w-[18rem] text-[12px] leading-relaxed tracking-[0.14em] text-[#5a574f]/80 md:block">
              点击或空格振翅 · 越过竹节计分
            </p>
          </div>
        )}

        {gameState === 'GAMEOVER' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
            <h1 className="text-[clamp(1.75rem,8vw,2.75rem)] font-light tracking-[0.4em] text-[#2c2a26]">
              形如朝露
            </h1>
            <p className="mt-3 text-[clamp(0.95rem,3.5vw,1.2rem)] tracking-[0.2em] text-[#5a574f]">
              越过 {score} 节竹
            </p>
            <button
              type="button"
              data-crane-ui
              onClick={() => apiRef.current?.restart()}
              className="crane-btn mt-10"
            >
              再试一次
            </button>
          </div>
        )}

        <div
          className="pointer-events-none absolute right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] border-2 border-[#8c3b3b] px-2 py-2.5 text-[clamp(0.85rem,3vw,1.15rem)] font-bold tracking-[0.2em] text-[#8c3b3b] opacity-60 [writing-mode:vertical-rl]"
          aria-hidden
        >
          有所闻
        </div>
      </div>

      <button
        type="button"
        data-crane-ui
        onClick={onClose}
        aria-label="关闭"
        className="absolute top-[max(0.75rem,calc(var(--sat)+0.35rem))] right-[max(0.75rem,1rem)] z-20 flex h-10 w-10 items-center justify-center rounded-full border border-[#5a574f]/35 bg-[#e8e4d9]/85 text-[#5a574f] backdrop-blur-sm hover:border-[#5a574f]/70 hover:text-[#2c2a26]"
      >
        <X size={16} strokeWidth={1.7} />
      </button>

      <style>{`
        .crane-btn {
          pointer-events: auto;
          padding: 12px 32px;
          font-size: clamp(1rem, 3.5vw, 1.2rem);
          background: transparent;
          border: 1px solid #5a574f;
          color: #2c2a26;
          letter-spacing: 0.2em;
          font-family: inherit;
          position: relative;
          overflow: hidden;
          transition: background 0.3s ease;
          min-height: 44px;
          min-width: 44px;
        }
        .crane-btn:hover,
        .crane-btn:active {
          background: rgba(44, 42, 38, 0.1);
        }
        .crane-btn::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 2px;
          background-color: #8c3b3b;
          transform: scaleX(0);
          transform-origin: right;
          transition: transform 0.4s ease;
        }
        @media (hover: hover) {
          .crane-btn:hover::after {
            transform: scaleX(1);
            transform-origin: left;
          }
        }
      `}</style>
    </div>
  )
}
