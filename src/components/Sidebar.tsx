import type { GameState } from '../lib/game'

interface SidebarProps {
  state: GameState
  turn: number
}

export function Sidebar({ state, turn }: SidebarProps) {
  const hp = Math.max(0, Math.min(100, state.hp))
  const hpClass = hp > 60 ? 'hp-hi' : hp > 30 ? 'hp-mid' : 'hp-lo'

  return (
    <aside className="sidebar">
      <div className="panel">
        <h2 className="panel-title">Condition</h2>

        <div className="hp-row">
          <span className="stat-label">HP</span>
          <span className="stat-value">{hp}</span>
        </div>
        <div className="hp-bar" role="img" aria-label={`Health ${hp} of 100`}>
          <div className={`hp-fill ${hpClass}`} style={{ width: `${hp}%` }} />
        </div>

        <div className="stat-row">
          <span className="stat-label">Location</span>
          <span className="stat-value stat-loc">{state.location}</span>
        </div>

        <div className="stat-row">
          <span className="stat-label">Turn</span>
          <span className="stat-value">{turn}</span>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Inventory</h2>
        {state.inventory.length === 0 ? (
          <p className="inv-empty">Nothing but the clothes you stand in.</p>
        ) : (
          <ul className="inv-list">
            {state.inventory.map((item, i) => (
              <li key={`${item}-${i}`} className="inv-item">
                <span className="inv-bullet">✦</span> {item}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h2 className="panel-title">Flags</h2>
        {Object.keys(state.flags).length === 0 ? (
          <p className="inv-empty">No quest details yet.</p>
        ) : (
          <ul className="flag-list">
            {Object.entries(state.flags).map(([k, v]) => (
              <li key={k} className="flag-item">
                <span className="flag-key">{k}</span>
                <span className="flag-val">{String(v)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
