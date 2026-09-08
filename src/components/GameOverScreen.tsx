import type { Outcome } from '../lib/game'

interface GameOverScreenProps {
  outcome: Outcome
  ending: string
  turns: number
  itemsFound: string[]
  location: string
  onPlayAgain: () => void
  onNewAdventure: () => void
}

export function GameOverScreen({
  outcome,
  ending,
  turns,
  itemsFound,
  location,
  onPlayAgain,
  onNewAdventure,
}: GameOverScreenProps) {
  const win = outcome === 'win'

  return (
    <div className="over-overlay" role="dialog" aria-modal="true" aria-label={win ? 'Victory' : 'Game over'}>
      <div className="over-card">
        <p className="over-eyebrow">{win ? 'Quest complete' : 'Your story ends here'}</p>
        <h2 className={`over-title ${win ? 'over-win' : 'over-lose'}`}>
          {win ? 'YOU WIN ✦' : 'GAME OVER ☠'}
        </h2>

        <p className="over-ending">{ending}</p>

        <dl className="over-stats">
          <div className="over-stat">
            <dt>Turns taken</dt>
            <dd>{turns}</dd>
          </div>
          <div className="over-stat">
            <dt>Items found</dt>
            <dd>{itemsFound.length === 0 ? 'none' : itemsFound.join(', ')}</dd>
          </div>
          <div className="over-stat">
            <dt>Fell at</dt>
            <dd>{location}</dd>
          </div>
        </dl>

        <div className="over-actions">
          <button className="over-btn over-btn-primary" onClick={onPlayAgain}>
            Play again
          </button>
          <button className="over-btn" onClick={onNewAdventure}>
            New adventure
          </button>
        </div>
      </div>
    </div>
  )
}
