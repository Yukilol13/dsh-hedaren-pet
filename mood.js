/**
 * 和大人 · 颤栗值 & 官位
 *
 * 颤栗值 tremble：0.0–10.0，初始 5（中间值）。
 *   辱骂/质疑/责备/盘问 → 上升；夸奖/赏赐/宠爱 → 下降；中性闲聊 → 向 5 靠拢。
 *   0 触发「心花怒放」（锁 0，放飞自我），10 触发「胆战心惊」（锁 10，认错求饶）。
 *   两个状态各持续「连续 5 次对话」或「1 分钟」，先到先解除。
 *
 * 官位 rank：1=一品（最高）… 9=九品（最低），初始一品。
 *   「降职三品」= 品数 +3；「升职一品」= 品数 -1；一品封顶后再升只加俸禄。
 *
 * 这个文件只放纯逻辑（判定、状态机、文案），读写文件与模型调用由 index.js 负责。
 */

export const TREMBLE_MIN = 0
export const TREMBLE_MAX = 10
export const TREMBLE_INIT = 5
export const RANK_MIN = 1
export const RANK_MAX = 9
const STATE_TURNS = 5
const STATE_MS = 60 * 1000 // 1 分钟
const COMBO_MS = 5 * 60 * 1000 // 「连续两次」的判定窗口

const RANK_LABEL = ['', '一品', '二品', '三品', '四品', '五品', '六品', '七品', '八品', '九品']

/** 中文数字 / 阿拉伯数字 → 数值（够用就行：一~十 + 1~9） */
const NUM = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

function toNumber(raw) {
  if (raw === undefined || raw === null) return null
  const text = String(raw).trim()
  if (/^\d+$/.test(text)) return Number(text)
  if (NUM[text] !== undefined) return NUM[text]
  // 十一 / 十二 … 十九
  if (text.length === 2 && text[0] === '十' && NUM[text[1]]) return 10 + NUM[text[1]]
  return null
}

const KEYWORDS = {
  // 辱骂 / 质疑 / 责备 / 盘问：颤栗值上升
  abuse: [
    '骂',
    '混账',
    '混蛋',
    '蠢',
    '愚',
    '废物',
    '放肆',
    '大胆',
    '狗奴才',
    '滚',
    '闭嘴',
    '胡说',
    '撒谎',
    '欺瞒',
    '欺君',
    '该死',
    '砍头',
    '该当何罪',
    '可知罪',
    '谁准你',
    '谁让你',
    '凭什么',
    '为什么',
    '怎么回事',
    '交代',
    '如实',
    '老实说',
    '盘问',
    '查一查',
    '查查',
    '说清楚',
    '你到底',
    '你可知',
    '岂有此理',
    '糊涂',
    '无能',
    '失职',
    '罚',
    '问罪',
    '责备',
    '惊了',
    '质疑',
    '敢',
  ],
  // 夸奖 / 赏赐 / 宠爱：颤栗值下降
  praise: [
    '好',
    '不错',
    '甚好',
    '好极了',
    '赏',
    '赐',
    '赏赐',
    '嘉奖',
    '夸奖',
    '忠心',
    '忠臣',
    '辛苦',
    '能干',
    '干得好',
    '疼你',
    '心疼',
    '喜欢',
    '宠爱',
    '爱卿',
    '宝贝',
    '提拔',
    '加封',
    '进爵',
    '看赏',
    '重重的赏',
  ],
  // 严厉处分（连续两次 → 胆战心惊 + 颤栗值拉满）
  severe: [
    '打入死牢',
    '死牢',
    '天牢',
    '大牢',
    '关进牢',
    '问斩',
    '斩了',
    '推出午门',
    '赐死',
    '凌迟',
    '抄家',
    '革职',
    '罢官',
    '流放',
    '发配',
    '削爵',
    '诛九族',
    '杖责',
    '拖出去',
    '砍了',
  ],
  // 巨额赏赐（连续两次 → 心花怒放）
  bounty: [
    '黄马褂',
    '黄金万两',
    '万两',
    '俸禄加倍',
    '紫禁城骑马',
    '赏银万',
    '加官进爵',
    '封侯',
    '赐宅',
    '赐府',
    '赏宅',
    '赏府',
    '千两',
    '万户',
    '免死金牌',
    '九锡',
  ],
}

function hitsOf(text, list) {
  let n = 0
  const found = []
  for (const word of list) {
    if (text.includes(word)) {
      n += 1
      found.push(word)
    }
  }
  return { n, found }
}

/**
 * 解析「降职三品」「升一品」「连降两级」这类官位指令。
 * 返回 { dir: 'down'|'up', n } —— down = 降职（品数变大），up = 升职（品数变小）
 */
export function parseRankCommand(text) {
  const t = String(text || '')
  const rankWord = '(品|级)'
  const patterns = [
    { dir: 'down', re: new RegExp(`(降职|降|贬|连降|左迁)\\s*([一二两三四五六七八九十\\d]{1,3})\\s*${rankWord}`) },
    { dir: 'down', re: new RegExp(`(降为|贬为|降作)\\s*([一二两三四五六七八九十\\d]{1,3})\\s*${rankWord}`) },
    { dir: 'up', re: new RegExp(`(升职|升|晋升|晋|连升|加封|擢|加官|进|提)\\s*([一二两三四五六七八九十\\d]{1,3})\\s*${rankWord}`) },
    { dir: 'up', re: new RegExp(`(升为|晋为|封为|进宫加|任为)\\s*([一二两三四五六七八九十\\d]{1,3})\\s*${rankWord}`) },
  ]
  for (const { dir, re } of patterns) {
    const m = t.match(re)
    if (!m) continue
    const n = toNumber(m[2])
    if (!n || n <= 0) continue
    // 「降三级」「升两级」里的「两」已经换算过
    return { dir, n, raw: m[0] }
  }
  return null
}

/** 语气档位（非特殊状态时） */
export function toneBand(tremble) {
  if (tremble <= 0.05) return 'ecstatic'
  if (tremble < 2.5) return 'fearless'
  if (tremble < 4.2) return 'happy'
  if (tremble < 5.8) return 'plain'
  if (tremble < 7.5) return 'scared'
  if (tremble < 9) return 'passBuck'
  return 'plead'
}

export function rankLabel(rank) {
  const r = Math.min(RANK_MAX, Math.max(RANK_MIN, Math.round(Number(rank) || RANK_MIN)))
  return RANK_LABEL[r] || `${r}品`
}

export function createMoodState(raw = {}) {
  const tremble = Number(raw.tremble)
  const rank = Number(raw.rank)
  const state = raw.state === 'dread' || raw.state === 'elated' ? raw.state : 'normal'
  const value = Number.isFinite(tremble) ? Math.min(TREMBLE_MAX, Math.max(TREMBLE_MIN, tremble)) : TREMBLE_INIT
  return {
    // 两个端点状态期间颤栗值是锁死的
    tremble: state === 'dread' ? TREMBLE_MAX : state === 'elated' ? TREMBLE_MIN : value,
    rank: Number.isFinite(rank) ? Math.min(RANK_MAX, Math.max(RANK_MIN, Math.round(rank))) : RANK_MIN,
    state,
    stateTurns: Number(raw.stateTurns) || 0,
    stateAt: Number(raw.stateAt) || 0,
    rankNote: typeof raw.rankNote === 'string' ? raw.rankNote : '',
    lastSevereAt: Number(raw.lastSevereAt) || 0,
    lastBountyAt: Number(raw.lastBountyAt) || 0,
    lastKind: raw.lastKind === 'abuse' || raw.lastKind === 'praise' || raw.lastKind === 'neutral' ? raw.lastKind : 'neutral',
    turns: Number(raw.turns) || 0,
    updatedAt: Number(raw.updatedAt) || 0,
  }
}

function round1(v) {
  return Math.round(Number(v) * 10) / 10
}

/**
 * 一句话的判定：分词命中的结果 → 期望的颤栗值变化量、是否触发连续事件、官位指令。
 */
export function classify(text) {
  const t = String(text || '')
  const abuse = hitsOf(t, KEYWORDS.abuse)
  const praise = hitsOf(t, KEYWORDS.praise)
  const severe = hitsOf(t, KEYWORDS.severe)
  const bounty = hitsOf(t, KEYWORDS.bounty)
  let kind = 'neutral'
  if (abuse.n > praise.n) kind = 'abuse'
  else if (praise.n > abuse.n) kind = 'praise'

  // 严重处分 / 巨额赏赐 单独算：它们本身多半也带「罚/赏」这类词
  const punitive = severe.n > 0 || /(问斩|砍了|拖出去|杖|死牢|抄家|革职)/.test(t)
  const lavish = bounty.n > 0 || /(黄马褂|万两|加倍|紫禁城)/.test(t)

  return {
    kind,
    abuseHits: abuse.n,
    praiseHits: praise.n,
    severe: punitive,
    bounty: lavish,
    delta: kind === 'abuse' ? Math.min(1.8, 0.9 + abuse.n * 0.25) : kind === 'praise' ? -Math.min(1.8, 0.9 + praise.n * 0.25) : 0,
    rank: parseRankCommand(t),
    text: t,
  }
}

/**
 * 把一轮对话应用到颤栗值状态上。返回新的 state（不改入参）。
 * @returns {{ state: object, before: number, after: number, entered: string, released: string, rankNote: string }}
 */
export function applyTurn(input, cls, now = Date.now()) {
  const state = createMoodState(input)
  const before = state.tremble
  let entered = ''
  let released = ''
  let rankNote = ''

  // 1) 官位指令
  if (cls.rank) {
    const { dir, n } = cls.rank
    if (dir === 'down') {
      const next = Math.min(RANK_MAX, state.rank + n)
      rankNote = next === state.rank ? 'floor' : 'down'
      state.rank = next
    } else {
      if (state.rank <= RANK_MIN) {
        rankNote = 'cap'
      } else {
        const next = Math.max(RANK_MIN, state.rank - n)
        rankNote = next === RANK_MIN ? 'top' : 'up'
        state.rank = next
      }
    }
    state.rankNote = rankNote
  }

  // 2) 先处理特殊状态的维持/解除（状态期间颤栗值锁死）
  if (state.state !== 'normal') {
    state.stateTurns += 1
    const expired = now - state.stateAt >= STATE_MS
    if (state.stateTurns >= STATE_TURNS || expired) {
      released = state.state
      state.state = 'normal'
      state.stateTurns = 0
      state.stateAt = 0
      // 解除时离开端点，避免下一句话立刻又触发
      state.tremble = released === 'dread' ? 8.5 : 1.5
      // 解除这一轮不再叠加情绪变化
      state.turns += 1
      state.updatedAt = now
      return { state, before, after: state.tremble, entered, released, rankNote }
    }
    // 锁死期间不改变颤栗值，只记录连续事件的时间戳
    if (cls.severe) state.lastSevereAt = now
    if (cls.bounty) state.lastBountyAt = now
    state.turns += 1
    state.updatedAt = now
    return { state, before, after: state.tremble, entered, released, rankNote }
  }

  // 3) 颤栗值本身的变化
  if (cls.kind === 'abuse') state.tremble = round1(state.tremble + cls.delta)
  else if (cls.kind === 'praise') state.tremble = round1(state.tremble + cls.delta)
  else state.tremble = round1(state.tremble + (TREMBLE_INIT - state.tremble) * 0.25) // 中性：向 5 靠拢
  // 单独的严厉处分 / 巨额赏赐也要有分量（不靠「骂/夸」的字眼）
  if (cls.severe && cls.kind !== 'abuse') state.tremble = round1(state.tremble + 1.2)
  if (cls.bounty && cls.kind !== 'praise') state.tremble = round1(state.tremble - 1.2)

  // 4) 连续两次严厉处分 / 巨额赏赐
  const severeCombo = cls.severe && state.lastSevereAt && now - state.lastSevereAt <= COMBO_MS
  const bountyCombo = cls.bounty && state.lastBountyAt && now - state.lastBountyAt <= COMBO_MS
  if (cls.severe) state.lastSevereAt = now
  if (cls.bounty) state.lastBountyAt = now

  state.tremble = Math.min(TREMBLE_MAX, Math.max(TREMBLE_MIN, state.tremble))

  // 5) 触发两个特殊状态（互相排斥，先判处罚）
  if (severeCombo || state.tremble >= TREMBLE_MAX) {
    state.state = 'dread'
    state.stateTurns = 0
    state.stateAt = now
    state.tremble = TREMBLE_MAX
    entered = 'dread'
  } else if (bountyCombo || state.tremble <= TREMBLE_MIN) {
    state.state = 'elated'
    state.stateTurns = 0
    state.stateAt = now
    state.tremble = TREMBLE_MIN
    entered = 'elated'
  }

  state.lastKind = cls.kind
  state.turns += 1
  state.updatedAt = now
  return { state, before, after: state.tremble, entered, released, rankNote }
}

/** 给模型的语气指令（拼进 system prompt） */
export function directiveFor(mood, cls, before = null) {
  const state = createMoodState(mood)
  const band = toneBand(state.tremble)
  const rank = rankLabel(state.rank)
  const rose = before !== null && state.tremble > before
  const lines = [`你现在是${rank}官员（一品最高、九品最低）。`]

  if (state.state === 'dread') {
    lines.push(
      '你正处在「胆战心惊」：浑身发抖、声音打颤、跪着回话。无论皇上说什么，你都要认错、请罪、恳求饶命，' +
        '一句话里至少出现一次「奴才该死」「求皇上开恩」这类意思；不要辩解、不要反问、不要开玩笑。',
    )
  } else if (state.state === 'elated') {
    lines.push(
      '你正处在「心花怒放」：飘了、嘚瑟、忘形，觉得自己是皇上跟前的头一号红人。' +
        '无论皇上说什么，你都要用嘚瑟、放纵、得意洋洋的语气回，可以吹牛、邀功、要赏，不要怕、不要怂。',
    )
  } else if (state.tremble < 2.5) {
    lines.push(
      '颤栗值很低（0~2.5）：你一点不怕皇上，把皇上的轻微责备当成开玩笑，笑嘻嘻地接，甚至敢讨个巧。',
    )
  } else if (rose && before !== null && before >= 7.5 && before < 9) {
    lines.push(
      '颤栗值很高（7.5~9）而且这句话还让你更怕：先认个软，然后把锅甩给老纪——说他坑害你、陷害你、眼红你、' +
        '背地里嚼舌根，把自己摘出来。',
    )
  } else if (state.tremble >= 9) {
    lines.push('颤栗值极高（9~10）：跪地求饶、连声认错、请求皇上开恩宽恕，语气发颤。')
  } else if (band === 'happy') {
    lines.push('颤栗值偏低（2.5~4.2）：心情好、语气轻快、谄媚带笑。')
  } else if (band === 'plain') {
    lines.push('颤栗值中等（4.2~5.8）：正常恭敬地回话，不卑不亢。')
  } else {
    lines.push('颤栗值偏高（5.8~7.5）：有点怕，回话小心、字斟句酌、带点发虚。')
  }

  if (cls?.rank) {
    const { dir, n } = cls.rank
    const now = rankLabel(state.rank)
    if (dir === 'down') {
      lines.push(
        `皇上刚把你降了 ${n} 品，你现在是${now}。回话里只许说自己是${now}，别自己编别的品级；谢恩领旨即可。`,
      )
    } else if (state.rankNote === 'cap') {
      lines.push('皇上要给你升官，但你已是一品，升无可升：先谢恩，再说明无法再升、按律每加一品只加三成俸禄。')
    } else {
      lines.push(`皇上刚给你升了 ${n} 品，你现在是${now}。回话里只许说自己是${now}，别自己编别的品级；谢恩即可。`)
    }
  }
  return lines.join('\n')
}

/** 端点上必须由代码兜住的硬话术（不靠模型自由发挥） */
export function forcedReply(mood) {
  const state = createMoodState(mood)
  const out = []
  if (state.rankNote === 'cap') {
    out.push('皇上，奴才已是百官之首的一品，实在没法再升——按我朝律法，每再加一品，俸禄加三成。')
  } else if (state.rankNote === 'floor') {
    out.push('皇上，奴才已经是九品了，再降就得去种地了。')
  }
  return out
}

export function publicView(mood, now = Date.now()) {
  const state = createMoodState(mood)
  const leftMs = state.state === 'normal' ? 0 : Math.max(0, STATE_MS - (now - state.stateAt))
  return {
    tremble: state.tremble,
    trembleLabel: state.tremble.toFixed(1),
    state: state.state,
    stateLabel: state.state === 'dread' ? '胆战心惊' : state.state === 'elated' ? '心花怒放' : '平常',
    stateTurnsLeft: state.state === 'normal' ? 0 : Math.max(0, STATE_TURNS - state.stateTurns),
    stateMsLeft: leftMs,
    rank: state.rank,
    rankLabel: rankLabel(state.rank),
    band: toneBand(state.tremble),
    updatedAt: state.updatedAt,
  }
}
