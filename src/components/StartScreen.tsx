import type { CSSProperties } from 'react'
import { DIFFICULTIES, GENRES, type Difficulty, type GenreId } from '../lib/game'

interface StartScreenProps {
  genre: GenreId
  difficulty: Difficulty
  onGenreChange: (g: GenreId) => void
  onDifficultyChange: (d: Difficulty) => void
  onStart: () => void
  busy: boolean
}

export function StartScreen({
  genre,
  difficulty,
  onGenreChange,
  onDifficultyChange,
  onStart,
  busy,
}: StartScreenProps) {
  const accent = GENRES.find((g) => g.id === genre)?.accent ?? '#c9a962'

  return (
    <div className="app start" style={{ '--accent': accent } as CSSProperties}>
      <div className="start-inner">
        <p className="start-eyebrow">AN AI-POWERED TEXT ADVENTURE</p>
        <h1 className="start-title">The Dungeon Master</h1>

        <div className="ornament" aria-hidden="true">
          <span>❖</span>
        </div>

        <p className="start-sub">
          Every playthrough is its own story. Choose a world and step in —
          the Dungeon Master will narrate everything from there.
        </p>

        <div className="ornament" aria-hidden="true">
          <span>❖</span>
        </div>

        <h2 className="start-label">Choose your world</h2>
        <div className="genre-grid" role="radiogroup" aria-label="Genre">
          {GENRES.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={genre === g.id}
              className={`genre-card ${genre === g.id ? 'genre-card-active' : ''}`}
              onClick={() => onGenreChange(g.id)}
            >
              <span className="genre-emoji" aria-hidden="true">{g.emoji}</span>
              <span className="genre-name">{g.label}</span>
              <span className="genre-tag">{g.tagline}</span>
            </button>
          ))}
        </div>

        <h2 className="start-label">Difficulty</h2>
        <div className="diff-row" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={difficulty === d.id}
              className={`diff-btn ${difficulty === d.id ? 'diff-btn-active' : ''}`}
              onClick={() => onDifficultyChange(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="diff-detail">{DIFFICULTIES.find((d) => d.id === difficulty)?.detail}</p>

        <button className="begin" onClick={onStart} disabled={busy}>
          {busy ? 'Summoning the Dungeon Master…' : 'Begin the adventure'}
        </button>

        <footer className="credit">
          <p>
            Built by{' '}
            <a href="https://harishkotra.me" target="_blank" rel="noreferrer">
              Harish Kotra
            </a>
            {' · '}
            <a href="https://dailybuild.xyz" target="_blank" rel="noreferrer">
              Checkout my other builds
            </a>
          </p>
        </footer>
      </div>
    </div>
  )
}
