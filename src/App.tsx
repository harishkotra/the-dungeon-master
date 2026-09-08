import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { streamChat, type ChatMessage } from './lib/chatClient'
import {
  freshState,
  GENRES,
  hintRequest,
  splitDMReply,
  systemPrompt,
  trimForApi,
  type Difficulty,
  type GameState,
  type GenreId,
  type Outcome,
} from './lib/game'
import { GameOverScreen } from './components/GameOverScreen'
import { Sidebar } from './components/Sidebar'
import { StartScreen } from './components/StartScreen'

type Screen = 'start' | 'playing'
type TurnKind = 'begin' | 'action' | 'hint'
interface Turn extends ChatMessage {
  kind?: TurnKind
}

const SAVE_KEY = 'dm.save.v1'

interface SaveData {
  v: 1
  genre: GenreId
  difficulty: Difficulty
  messages: Turn[]
  state: GameState
  turn: number
  outcome: Outcome | null
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('start')
  const [genre, setGenre] = useState<GenreId>('fantasy')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [messages, setMessages] = useState<Turn[]>([])
  const [state, setState] = useState<GameState>(freshState())
  const [turn, setTurn] = useState(0)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [itemsSeen, setItemsSeen] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Resume a saved game on load.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return
      const save = JSON.parse(raw) as SaveData
      if (save?.v !== 1 || !Array.isArray(save.messages)) return
      setGenre(save.genre)
      setDifficulty(save.difficulty)
      setMessages(save.messages)
      setState(save.state)
      setTurn(save.turn)
      setOutcome(save.outcome ?? null)
      setScreen('playing')
    } catch {
      /* corrupted save — start fresh */
    }
  }, [])

  // Persist the game after every change.
  useEffect(() => {
    if (screen === 'start') return
    try {
      const save: SaveData = { v: 1, genre, difficulty, messages, state, turn, outcome }
      localStorage.setItem(SAVE_KEY, JSON.stringify(save))
    } catch {
      /* storage unavailable — game just stays in memory */
    }
  }, [screen, genre, difficulty, messages, state, turn, outcome])

  // Keep the newest entry in view.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages])

  const patchLast = (content: string) =>
    setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m)))

  /** Run one DM turn: stream the reply, then parse out the STATE line. */
  const runDMTurn = useCallback(
    async (
      g: GenreId,
      d: Difficulty,
      baseState: GameState,
      baseMessages: Turn[],
      userTurn: Turn,
      nextTurn: number,
    ) => {
      setBusy(true)
      setError(null)

      const withUser: Turn[] = [...baseMessages, userTurn, { role: 'assistant', content: '' }]
      setMessages(withUser)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const full = await streamChat({
          messages: [
            { role: 'system', content: systemPrompt(g, d, baseState) },
            ...trimForApi(withUser.slice(0, -1)),
          ],
          signal: controller.signal,
          onDelta: patchLast,
        })

        const { narration, nextState, outcome: detected } = splitDMReply(full)
        patchLast(narration)

        if (nextState) {
          setState(nextState)
          setItemsSeen((prev) => {
            const merged = new Set([...prev, ...nextState.inventory])
            return [...merged]
          })
        }
        if (detected) setOutcome(detected)
        setTurn(nextTurn + 1)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          // Roll back this turn so the player can retry their action.
          setMessages(baseMessages)
          setError('The connection to the Dungeon Master was lost. Try again.')
        }
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [],
  )

  const startGame = useCallback(
    (g: GenreId, d: Difficulty) => {
      setGenre(g)
      setDifficulty(d)
      setState(freshState())
      setTurn(0)
      setOutcome(null)
      setItemsSeen([])
      setError(null)
      setScreen('playing')
      void runDMTurn(g, d, freshState(), [], {
        role: 'user',
        kind: 'begin',
        content: 'Begin the adventure. Set the scene and tell me who I am.',
      }, 0)
    },
    [runDMTurn],
  )

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    void runDMTurn(genre, difficulty, state, messages, { role: 'user', kind: 'action', content: text }, turn)
  }, [input, busy, genre, difficulty, state, messages, turn, runDMTurn])

  const sendHint = useCallback(() => {
    if (busy) return
    void runDMTurn(genre, difficulty, state, messages, { ...hintRequest(), kind: 'hint' }, turn)
  }, [busy, genre, difficulty, state, messages, turn, runDMTurn])

  const restart = useCallback(() => {
    abortRef.current?.abort()
    try {
      localStorage.removeItem(SAVE_KEY)
    } catch { /* ignore */ }
    setScreen('start')
    setMessages([])
    setState(freshState())
    setTurn(0)
    setOutcome(null)
    setItemsSeen([])
    setError(null)
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      send()
    }
  }

  if (screen === 'start') {
    return <StartScreen genre={genre} difficulty={difficulty} onGenreChange={setGenre} onDifficultyChange={setDifficulty} onStart={() => startGame(genre, difficulty)} busy={busy} />
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const thinking = busy && lastAssistant?.content === ''

  const accent = GENRES.find((g) => g.id === genre)?.accent ?? '#c9a962'

  return (
    <div className="app" style={{ '--accent': accent } as CSSProperties}>
      <header className="topbar">
        <div className="topbar-left">
          <span className="dm-badge">DM</span>
          <span className="topbar-title">The Dungeon Master</span>
        </div>
        <div className="topbar-meta">
          <span className="genre-chip">{genre}</span>
          <span className="diff-chip">{difficulty}</span>
          <button className="restart" onClick={restart}>⟲ Restart</button>
        </div>
      </header>

      <div className="game-body">
        <Sidebar state={state} turn={turn} />

        <div className="story">
          <div className="history" ref={listRef}>
            {messages.map((m, i) => {
              if (m.role === 'user') {
                if (m.kind === 'begin') {
                  return <p key={i} className="begin-marker">— the adventure begins —</p>
                }
                if (m.kind === 'hint') {
                  return <p key={i} className="hint-marker">✦ you ask for a hint</p>
                }
                return (
                  <p key={i} className="action-chip">
                    <span className="action-label">you</span> {m.content}
                  </p>
                )
              }
              return (
                <div key={i} className="dm-turn">
                  {m.content ? <p>{m.content}</p> : null}
                  {thinking && i === messages.length - 1 && (
                    <p className="thinking">
                      The DM deliberates<span className="dots"><span>.</span><span>.</span><span>.</span></span>
                    </p>
                  )}
                  {busy && i === messages.length - 1 && m.content && <span className="caret" />}
                </div>
              )
            })}
          </div>

          {error && (
            <div className="error" role="alert">
              {error}{' '}
              <button className="error-retry" onClick={() => setError(null)}>dismiss</button>
            </div>
          )}

          <footer className="composer">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="What do you do?"
              aria-label="Your action"
              disabled={busy || outcome !== null}
            />
            <button className="hint" onClick={sendHint} disabled={busy || outcome !== null}>
              💡 Hint
            </button>
            <button className="send" onClick={send} disabled={busy || !input.trim() || outcome !== null}>
              Send ⏎
            </button>
          </footer>
        </div>
      </div>

      {outcome && (
        <GameOverScreen
          outcome={outcome}
          ending={lastAssistant?.content ?? ''}
          turns={turn}
          itemsFound={itemsSeen}
          location={state.location}
          onPlayAgain={() => startGame(genre, difficulty)}
          onNewAdventure={restart}
        />
      )}
    </div>
  )
}
