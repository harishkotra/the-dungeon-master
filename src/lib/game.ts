/**
 * Game domain: genres, difficulties, the DM system prompt, and the
 * parser that extracts the machine-readable STATE line from each DM reply.
 */
import type { ChatMessage } from './chatClient'

export type GenreId = 'fantasy' | 'scifi' | 'horror' | 'pirate' | 'western'
export type Difficulty = 'easy' | 'normal' | 'hard'
export type Outcome = 'win' | 'lose'

export interface GenreDef {
  id: GenreId
  label: string
  emoji: string
  tagline: string
  /** One-line setting seed injected into the system prompt. */
  setting: string
  /** Concrete goal the DM can steer toward. */
  winCondition: string
  accent: string
}

export const GENRES: GenreDef[] = [
  {
    id: 'fantasy',
    label: 'Fantasy',
    emoji: '🐉',
    tagline: 'Dragons, dungeons, and old magic.',
    setting:
      'A mist-wrapped high-fantasy realm of dungeons, witches, and forgotten kings. The player is a wanderer with no memory of how they arrived.',
    winCondition:
      'recover the lost crown of the elder kings and escape the mountain with it',
    accent: '#a78bfa',
  },
  {
    id: 'scifi',
    label: 'Sci-Fi',
    emoji: '🛰️',
    tagline: 'A derelict station holds its breath.',
    setting:
      'Erebus-7, a derelict research station drifting in orbit around a dying star. Its crew is missing and its corridors hum with something alive.',
    winCondition: "restore the station's power and escape on the last shuttle",
    accent: '#38e1ff',
  },
  {
    id: 'horror',
    label: 'Horror',
    emoji: '🕯️',
    tagline: 'The house remembers what you did.',
    setting:
      "Blackreach House, a manor on the moors where the lights work but the doors don't. It is night. It is always night.",
    winCondition: 'survive until dawn and escape the house alive',
    accent: '#ff5a5a',
  },
  {
    id: 'pirate',
    label: 'Pirate',
    emoji: '⚓',
    tagline: 'Salt, gold, and no mercy.',
    setting:
      "The Windfall Isles, 1719. You wake on a beach with a broken ship, a borrowed compass, and a captain's debt on your head.",
    winCondition:
      'find the buried treasure of Captain Vane and escape the isles by ship',
    accent: '#3fd8c2',
  },
  {
    id: 'western',
    label: 'Western',
    emoji: '🤠',
    tagline: 'Justice at the end of a barrel.',
    setting:
      'The frontier town of Dry Blessing, 1885. Dust, whiskey, and a bounty worth dying for.',
    winCondition:
      'bring the outlaw Cassian Roe to justice — or take his gold and ride out alive',
    accent: '#e0a458',
  },
]

export const DIFFICULTIES: { id: Difficulty; label: string; detail: string }[] = [
  { id: 'easy', label: 'Easy', detail: 'gentle challenges, generous clues, HP loss is rare and small' },
  { id: 'normal', label: 'Normal', detail: 'moderate HP loss, fair clues' },
  { id: 'hard', label: 'Hard', detail: 'brutal HP loss, scarce clues, cunning hazards' },
]

export interface GameState {
  hp: number
  inventory: string[]
  location: string
  flags: Record<string, string | number | boolean>
}

export function freshState(): GameState {
  return { hp: 100, inventory: [], location: 'unknown', flags: {} }
}

/** Serialize flags as k:v pairs, e.g. "door_open:true, gold:3". */
function serializeFlags(flags: GameState['flags']): string {
  return Object.entries(flags)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ')
}

/** Build the system prompt for a DM turn, injecting genre, difficulty, and the live state block. */
export function systemPrompt(
  genre: GenreId,
  difficulty: Difficulty,
  state: GameState,
): string {
  const g = GENRES.find((x) => x.id === genre)!
  return [
    'You are the Dungeon Master of a text adventure game. Narrate the world in vivid second-person prose, 1-3 short paragraphs per turn. Always end your narration with an implicit prompt for the player\'s next action.',
    '',
    `SETTING: ${g.setting}`,
    `WIN CONDITION: ${g.winCondition}`,
    `GENRE: ${g.label.toLowerCase()}. DIFFICULTY: ${difficulty} (${DIFFICULTIES.find((x) => x.id === difficulty)!.detail}).`,
    '',
    'RULES:',
    '- Track and evolve the game state every turn. State format (always include on your turn, on its own line at the END of your reply):',
    '  STATE: HP=<int>, inventory=[comma-separated], location=<string>, flags={key:value}',
    '- HP starts at 100. Combat, traps, and hazards reduce it. Reaching 0 HP means the player dies — narrate a dramatic death and say "GAME OVER".',
    '- Reaching the win condition means the player wins — narrate the ending and say "YOU WIN".',
    '- Keep inventory changes consistent with the narrative.',
    '- Be creative and fair. Reward clever player actions. Never auto-win or auto-lose on a single turn. Allow multiple valid paths to the goal.',
    '- If the player does something impossible, narrate a reasonable consequence (they can\'t fly, but they might find a rope).',
    '- Keep the tone immersive and atmospheric, matching the genre.',
    '- Reply in plain text only. Never use markdown headers, bullet lists, or code blocks in narration.',
    '',
    `CURRENT STATE: HP=${state.hp}, inventory=[${state.inventory.join(', ')}], location=${state.location}, flags={${serializeFlags(state.flags)}}`,
  ].join('\n')
}

/** Parse a single STATE: line into a GameState, or null if it has no usable fields. */
export function parseStateLine(line: string): GameState | null {
  const hpMatch = line.match(/HP\s*=\s*(-?\d+)/i)
  const invMatch = line.match(/inventory\s*=\s*\[([^\]]*)\]/i)
  const locMatch = line.match(/location\s*=\s*([^,}\n]+)/i)
  const flagMatch = line.match(/flags\s*=\s*\{([^}]*)\}/i)
  if (!hpMatch && !invMatch && !locMatch) return null

  const inventory = invMatch
    ? invMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []

  const flags: GameState['flags'] = {}
  if (flagMatch) {
    for (const pair of flagMatch[1].split(',')) {
      const idx = pair.indexOf(':')
      if (idx === -1) continue
      const key = pair.slice(0, idx).trim()
      const value = pair.slice(idx + 1).trim()
      if (!key) continue
      const num = Number(value)
      flags[key] = value === '' ? '' : Number.isNaN(num) ? value : num
    }
  }

  const hp = hpMatch ? Math.max(0, Math.min(100, parseInt(hpMatch[1], 10))) : undefined
  const location = locMatch ? locMatch[1].trim() : undefined

  return {
    hp: hp ?? 100,
    inventory,
    location: location || 'unknown',
    flags,
  }
}

export interface SplitReply {
  narration: string
  nextState: GameState | null
  outcome: Outcome | null
}

/**
 * Split a raw DM reply into narration + parsed state + outcome.
 * The STATE line may appear anywhere; we take the LAST occurrence (the
 * most recent one), remove it, and detect GAME OVER / YOU WIN markers.
 */
export function splitDMReply(raw: string): SplitReply {
  const matches = [...raw.matchAll(/^[ \t*>]*STATE\s*:[^\n]*/gim)]
  let narration = raw
  let nextState: GameState | null = null

  if (matches.length > 0) {
    const last = matches[matches.length - 1]
    nextState = parseStateLine(last[0])
    narration = (raw.slice(0, last.index) + raw.slice(last.index + last[0].length)).trim()
  }

  let outcome: Outcome | null = null
  if (/\bYOU\s+WIN\b/i.test(narration)) outcome = 'win'
  else if (/\bGAME\s+OVER\b/i.test(narration)) outcome = 'lose'
  else if (nextState && nextState.hp <= 0) outcome = 'lose'

  return { narration, nextState, outcome }
}

/**
 * Trim history for the API call: keep the opening scene plus the most
 * recent ~20 messages, so long games don't blow up the context.
 */
export function trimForApi(messages: ChatMessage[], keep = 20): ChatMessage[] {
  if (messages.length <= keep) return messages
  return [messages[0], ...messages.slice(messages.length - keep + 1)]
}

/** Message shown to the DM when the player asks for a hint. */
export function hintRequest(): ChatMessage {
  return {
    role: 'user',
    content:
      '[The player asks for a hint. Give a one-sentence subtle nudge toward the current goal. Do not spoil the solution. Then include the STATE line as usual, unchanged.]',
  }
}
