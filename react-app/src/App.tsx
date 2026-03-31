import { useState, useRef, useEffect, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8770'

interface ChapterData {
  title: string
  content: string[]
  nextChapter: number | null
  prevChapter: number | null
  chapterNumber: number
}

const CHAPTER_LIST = [
  { number: 1886, title: 'Distant Howls' },
  { number: 1887, title: 'Midnight Meeting' },
  { number: 1888, title: 'Hidden Agenda' },
  { number: 1889, title: 'Ancient Blood' },
  { number: 1890, title: 'Rising Shadow' },
  { number: 1891, title: 'Crimson Pact' },
  { number: 1892, title: 'Next Target' },
]

function App() {
  const [chapter, setChapter] = useState<ChapterData | null>(null)
  const [currentParaIndex, setCurrentParaIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [speed, setSpeed] = useState('1')
  const [volume, setVolume] = useState(80)
  const [loading, setLoading] = useState(false)
  const [searchValue, setSearchValue] = useState('')

  const audioRef = useRef<HTMLAudioElement>(null)
  const nextAudioBlobRef = useRef<Blob | null>(null)
  const readerPanelRef = useRef<HTMLDivElement>(null)

  // Load chapter from API
  const loadChapter = useCallback(async (chapterNumber: number) => {
    setLoading(true)
    setIsPlaying(false)
    setIsPaused(false)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    nextAudioBlobRef.current = null

    try {
      const res = await fetch(`${API_BASE}/chapter?number=${chapterNumber}`)
      const data: ChapterData = await res.json()
      if ((data as any).error) throw new Error((data as any).error)
      setChapter(data)
      setCurrentParaIndex(0)
    } catch (err: any) {
      console.error('Failed to load chapter:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch TTS audio
  const fetchTTS = useCallback(async (text: string): Promise<Blob> => {
    const url = `${API_BASE}/tts?text=${encodeURIComponent(text)}&voice=onyx&speed=${speed}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('TTS failed')
    return await res.blob()
  }, [speed])

  // Prefetch next paragraph
  const prefetchNext = useCallback((paraIndex: number) => {
    if (chapter && paraIndex + 1 < chapter.content.length) {
      fetchTTS(chapter.content[paraIndex + 1])
        .then(blob => { nextAudioBlobRef.current = blob })
        .catch(() => { nextAudioBlobRef.current = null })
    }
  }, [chapter, fetchTTS])

  // Play current paragraph
  const playParagraph = useCallback(async (paraIndex: number) => {
    if (!chapter || paraIndex >= chapter.content.length) {
      setIsPlaying(false)
      setIsPaused(false)
      return
    }

    setIsPlaying(true)
    setIsPaused(false)
    setCurrentParaIndex(paraIndex)

    try {
      let blob: Blob
      if (nextAudioBlobRef.current && paraIndex > 0) {
        blob = nextAudioBlobRef.current
        nextAudioBlobRef.current = null
      } else {
        blob = await fetchTTS(chapter.content[paraIndex])
      }

      if (audioRef.current) {
        const url = URL.createObjectURL(blob)
        audioRef.current.src = url
        audioRef.current.volume = volume / 100
        await audioRef.current.play()
        prefetchNext(paraIndex)
      }
    } catch (err) {
      console.error('Playback error:', err)
      setIsPlaying(false)
    }
  }, [chapter, fetchTTS, volume, prefetchNext])

  // Audio ended handler
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onEnded = () => {
      if (!isPlaying) return
      const next = currentParaIndex + 1
      if (chapter && next < chapter.content.length) {
        playParagraph(next)
      } else {
        setIsPlaying(false)
        setIsPaused(false)
      }
    }
    audio.addEventListener('ended', onEnded)
    return () => audio.removeEventListener('ended', onEnded)
  }, [isPlaying, currentParaIndex, chapter, playParagraph])

  // Toggle play/pause
  const togglePlayPause = () => {
    if (isPlaying) {
      if (audioRef.current) {
        if (isPaused) {
          audioRef.current.play()
          setIsPaused(false)
        } else {
          audioRef.current.pause()
          setIsPaused(true)
        }
      }
    } else {
      playParagraph(currentParaIndex)
    }
  }

  // Skip paragraphs
  const skipPrev = () => {
    if (currentParaIndex > 0) {
      const newIdx = currentParaIndex - 1
      setCurrentParaIndex(newIdx)
      nextAudioBlobRef.current = null
      if (isPlaying) {
        audioRef.current?.pause()
        playParagraph(newIdx)
      }
    }
  }

  const skipNext = () => {
    if (chapter && currentParaIndex < chapter.content.length - 1) {
      const newIdx = currentParaIndex + 1
      setCurrentParaIndex(newIdx)
      nextAudioBlobRef.current = null
      if (isPlaying) {
        audioRef.current?.pause()
        playParagraph(newIdx)
      }
    }
  }

  // Jump to paragraph on click
  const jumpToParagraph = (index: number) => {
    setCurrentParaIndex(index)
    nextAudioBlobRef.current = null
    if (isPlaying) {
      audioRef.current?.pause()
      playParagraph(index)
    }
  }

  // Scroll active paragraph into view
  useEffect(() => {
    const activeP = document.querySelector('.chapter-text p.reading-active')
    if (activeP) {
      activeP.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentParaIndex])

  // Volume change
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100
  }, [volume])

  // Invalidate prefetch on speed change
  useEffect(() => {
    nextAudioBlobRef.current = null
  }, [speed])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlayPause()
          break
        case 'ArrowLeft':
          if (e.shiftKey && chapter?.prevChapter) loadChapter(chapter.prevChapter)
          else skipPrev()
          break
        case 'ArrowRight':
          if (e.shiftKey && chapter?.nextChapter) loadChapter(chapter.nextChapter)
          else skipNext()
          break
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  })

  // Search handler
  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const num = parseInt(searchValue)
      if (!isNaN(num) && num > 0) {
        loadChapter(num)
        setSearchValue('')
        ;(e.target as HTMLInputElement).blur()
      }
    }
  }

  // Progress bar click
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chapter) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    const targetIdx = Math.floor(pct * chapter.content.length)
    if (targetIdx >= 0 && targetIdx < chapter.content.length) {
      jumpToParagraph(targetIdx)
    }
  }

  const paragraphs = chapter?.content || []
  const progressPct = paragraphs.length > 0 ? ((currentParaIndex + 1) / paragraphs.length) * 100 : 0

  return (
    <>
      {/* Background Blobs */}
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      {/* App Layout */}
      <div className="app-layout">
        {/* Top Bar */}
        <header className="topbar">
          <div className="topbar-logo">
            <span className="vampire">Vampire</span> <span className="tales">Tales</span>
          </div>
          <div className="topbar-search">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Chapter search..."
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              onKeyDown={handleSearch}
            />
          </div>
        </header>

        {/* Sidebar */}
        <aside className="sidebar">
          <h2 className="sidebar-title">Chapters</h2>
          <ul className="chapter-list">
            {CHAPTER_LIST.map(ch => (
              <li
                key={ch.number}
                className={`chapter-item ${chapter?.chapterNumber === ch.number ? 'active' : ''}`}
                onClick={() => loadChapter(ch.number)}
              >
                Ch {ch.number}: {ch.title}
              </li>
            ))}
          </ul>
        </aside>

        {/* Reader Wrapper */}
        <div className="reader-wrapper">
          <div className="reader-panel" ref={readerPanelRef}>
            <h1 className="chapter-title">
              {loading ? 'Loading...' : chapter?.title || 'Chapter 1892: Next Target'}
            </h1>
            <div className="chapter-text">
              {loading ? (
                <div className="loading">Loading chapter</div>
              ) : paragraphs.length > 0 ? (
                paragraphs.map((text, i) => (
                  <p
                    key={i}
                    className={i === currentParaIndex ? 'reading-active' : ''}
                    onClick={() => jumpToParagraph(i)}
                  >
                    {text}
                  </p>
                ))
              ) : (
                <>
                  <p>Walking out of the cave after having just defeated the Demon tier beast, Agent 4 continued to walk into the direction where the two large energy readings were coming from.</p>
                  <p>Zero was getting somewhat impatient as he had a big smile on his face. His hands were twitching during the walk, if he could, he wanted to personally test Erin, and after seeing what she had done and sensing the energy inside her.</p>
                  <p className="reading-active">'I thought that the dhampirs' strength was mainly from their own personal aura. I knew that the dhampirs also learned Qi, but I never expected to find someone that has managed to cultivate their Qi to this level.' Zero thought, as he imagined what it would be like to use the Qi drain skill on her.</p>
                  <p>It would mean all of the power and all of the strength that Erin had would be added to Zero's strength. Then he could achieve what he needed to achieve, and if a certain individual was to back out of their deal, he would also be able to make them pay.</p>
                </>
              )}
            </div>
          </div>

          {/* Audio Player */}
          <div className="audio-player">
            <div className="player-info">
              <div className="novel-title">My Vampire System</div>
              <div className="chapter-progress">
                Chapter {chapter?.chapterNumber || 1892} — Paragraph {currentParaIndex + 1}/{paragraphs.length || 40}
              </div>
            </div>

            <div className="player-controls">
              <button className="player-btn skip-btn" onClick={skipPrev} title="Previous paragraph">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
              </button>
              <button className="player-btn play-btn" onClick={togglePlayPause} title="Play/Pause">
                {isPlaying && !isPaused ? (
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                )}
              </button>
              <button className="player-btn skip-btn" onClick={skipNext} title="Next paragraph">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
              </button>
            </div>

            <div className="player-settings">
              <div className="player-setting">
                <label>Speed</label>
                <select className="speed-select" value={speed} onChange={e => setSpeed(e.target.value)}>
                  <option value="0.5">0.5x</option>
                  <option value="0.75">0.75x</option>
                  <option value="1">1.0x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2.0x</option>
                </select>
              </div>
              <div className="player-setting">
                <label>Volume</label>
                <input
                  type="range"
                  className="volume-slider"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={e => setVolume(parseInt(e.target.value))}
                />
              </div>
            </div>

            <div className="progress-bar-wrapper" onClick={handleProgressClick}>
              <div className="progress-bar-fill" style={{ width: `${progressPct}%` }}></div>
            </div>
          </div>

          <audio ref={audioRef} preload="none" />
        </div>

        {/* Chapter Navigation */}
        <nav className="chapter-nav">
          <button
            className="nav-btn"
            disabled={!chapter?.prevChapter}
            onClick={() => chapter?.prevChapter && loadChapter(chapter.prevChapter)}
          >
            Previous Chapter
          </button>
          <span className="nav-chapter-num">Chapter Number ({chapter?.chapterNumber || 1892})</span>
          <button
            className="nav-btn"
            disabled={!chapter?.nextChapter}
            onClick={() => chapter?.nextChapter && loadChapter(chapter.nextChapter)}
          >
            Next Chapter
          </button>
        </nav>
      </div>
    </>
  )
}

export default App
