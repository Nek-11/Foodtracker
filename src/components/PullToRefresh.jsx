import { useState, useRef, useCallback } from 'react'
import { Loader } from 'lucide-react'

const THRESHOLD = 60

export default function PullToRefresh({ onRefresh, children, className = '' }) {
  const [pulling, setPulling]     = useState(false)
  const [pullY, setPullY]         = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY   = useRef(0)
  const scrollEl = useRef(null)

  const handleTouchStart = useCallback(e => {
    if (scrollEl.current && scrollEl.current.scrollTop <= 0) {
      startY.current = e.touches[0].clientY
      setPulling(true)
    }
  }, [])

  const handleTouchMove = useCallback(e => {
    if (!pulling || refreshing) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 0 && scrollEl.current && scrollEl.current.scrollTop <= 0) {
      setPullY(Math.min(delta * 0.4, 100))
    } else {
      setPullY(0)
    }
  }, [pulling, refreshing])

  const handleTouchEnd = useCallback(async () => {
    if (pullY >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPullY(THRESHOLD * 0.6)
      try {
        await onRefresh?.()
      } finally {
        setRefreshing(false)
      }
    }
    setPullY(0)
    setPulling(false)
  }, [pullY, refreshing, onRefresh])

  return (
    <div
      ref={scrollEl}
      className={className}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all"
        style={{ height: pullY > 0 ? pullY : 0, opacity: pullY > 10 ? 1 : 0 }}
      >
        <Loader
          size={18}
          className={`text-pine-400 transition-transform ${
            refreshing ? 'animate-spin' : ''
          }`}
          style={{ transform: !refreshing ? `rotate(${pullY * 3}deg)` : undefined }}
        />
      </div>
      {children}
    </div>
  )
}
