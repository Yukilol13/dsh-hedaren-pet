const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Tray,
  Menu,
  nativeImage,
} = require('electron')
const fs = require('node:fs')
const { execFile } = require('node:child_process')
const path = require('node:path')
const os = require('node:os')

const capture = require('./capture')
const winprobe = require('./winprobe')

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const STATE_DIR = path.join(DSH_HOME, 'heshen-pet')
const STATE_FILE = path.join(STATE_DIR, 'desktop-state.json')
const LOG_FILE = path.join(STATE_DIR, 'desktop-app.log')

const BUBBLE_W = 300
const BUBBLE_H = 132
const JAIL_THRESHOLD_FILE = () => path.join(STATE_DIR, 'jail-threshold.json')

/** 亏空阈值（元）的默认值：没设置过时按 10 元算 */
const DEFAULT_JAIL_THRESHOLD = 10

/** 读亏空阈值（元）。没有就返回默认值 10 */
function readJailThreshold() {
  try {
    const raw = JSON.parse(fs.readFileSync(JAIL_THRESHOLD_FILE(), 'utf8'))
    const v = Number(raw?.value)
    return Number.isFinite(v) && v >= 0.01 && v <= 10000 ? Math.round(v * 100) / 100 : DEFAULT_JAIL_THRESHOLD
  } catch {
    return DEFAULT_JAIL_THRESHOLD
  }
}

function writeJailThreshold(value) {
  try {
    const file = JAIL_THRESHOLD_FILE()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ value: Math.round(value * 100) / 100, updatedAt: Date.now() }, null, 2), 'utf8')
    return true
  } catch (error) {
    log(`jail threshold write failed ${error?.message}`)
    return false
  }
}

const MENU_W = 236
const CHAT_W = 330
const CHAT_H = 360

const DEFAULT_STATE = {
  version: 1,
  visible: true,
  say: null,
  anim: { id: 0, name: '待机-呼吸', loop: true },
  x: null,
  y: null,
  throwSettleMs: 50,
}

const THROW_SETTLE_MIN = 50
const THROW_SETTLE_MAX = 500

function clampSettle(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return THROW_SETTLE_MIN
  return Math.max(THROW_SETTLE_MIN, Math.min(THROW_SETTLE_MAX, n))
}

const GRAVITY = 1400
const RESTITUTION = 0.78
const FLOOR_FRICTION = 2.5
const MAX_SPEED = 3600

let win = null
let bubbleWin = null
let menuWin = null
let chatWin = null
let tray = null
let saveTimer = null
let throwTimer = null
let visibilityTimer = null
let sayTimer = null
let menuWatchdog = null
let bubbleContentH = BUBBLE_H
let fishTarget = null // state.dshpet：大肥鱼此刻的屏幕框（DIP）
let captureLock = false // 一次碰撞只判定一次，等动画播完再解锁
let fishPresent = true // 槽位里此刻有没有大肥鱼（像素检测）
let fishHelper = null // dsh-pet 的桌面宠物窗口（宠物其实画在这个窗口里）
let fishHelpers = [] // 每只桌宠一个同标题窗口，全都记下来
let fishDetectRect = null // 扫像素扫出来的大肥鱼实框（屏幕 DIP）
let fishDetectAt = 0
let fishDetecting = false
let fishEverSeen = false // 这一次运行里见过大肥鱼没有：从没见过 = 可能客户端根本没渲染
const FISH_FRESH_MS = 8000 // 像素扫描的新鲜期：比轮询间隔（5 秒）宽一点
let fishWindowCount = 0 // 上一次扫描看到的窗口数：0 = 探测本身失败，不能据此断言她不在
let fishSlots = [] // 这一轮扫到的所有碰撞框（桌面窗口里的她 + 网页/DSH 窗口里的她）
let fishGateOpen = false // 捕鱼门禁：插件装着+启用+她显示着，才做探测
let fishGateReason = 'unknown' // 门禁原因（no-plugin / fish-hidden / ok…）
let flightFacing = '' // 最近一次飞行朝向：'left' | 'right' | ''
let menuOpenAt = 0
let menuOutsideTicks = 0
let lastVisibility = null
let lastSayId = -1
let currentMetrics = { width: 200, height: 259, left: 80, top: 101, scale: 1 }

function log(...args) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${args.join(' ')}\n`)
  } catch {}
}

function readState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_STATE, ...parsed, anim: { ...DEFAULT_STATE.anim, ...(parsed.anim || {}) } }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

function writeState(next) {
  const current = readState()
  const merged = {
    ...current,
    ...next,
    anim: next && next.anim ? { ...current.anim, ...next.anim } : current.anim,
    say: next && Object.prototype.hasOwnProperty.call(next, 'say') ? next.say : current.say,
    updatedAt: Date.now(),
  }
  fs.mkdirSync(STATE_DIR, { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2), 'utf8')
  return merged
}

function petBounds() {
  if (!win) return null
  const b = win.getBounds()
  return b
}

/** 让气泡、聊天的位置跟着和大人走。 */
function syncSatellites() {
  const pet = petBounds()
  if (!pet) return
  if (bubbleWin && !bubbleWin.isDestroyed()) {
    const area = screen.getDisplayMatching(pet).workArea
    const h = Math.max(48, Math.min(BUBBLE_H, Math.round(bubbleContentH)))
    const x = Math.round(pet.x + pet.width / 2 - BUBBLE_W / 2)
    // 气泡窗口高度=内容高度，底部贴着角色窗口上沿（+2 让箭头压住帽顶）
    const y = Math.round(pet.y - h + 2)
    bubbleWin.setBounds({
      x: Math.min(Math.max(area.x + 4, x), area.x + area.width - BUBBLE_W - 4),
      y: Math.min(Math.max(area.y + 4, y), area.y + area.height - h - 4),
      width: BUBBLE_W,
      height: h,
    })
  }
}

function showBubbleWindow() {
  if (!bubbleWin || bubbleWin.isDestroyed()) return
  syncSatellites()
  if (!bubbleWin.isVisible()) bubbleWin.showInactive()
  bubbleWin.moveTop()
}

function hideBubbleWindow() {
  if (bubbleWin && !bubbleWin.isDestroyed() && bubbleWin.isVisible()) bubbleWin.hide()
}

function openChat() {
  if (!chatWin || chatWin.isDestroyed()) return
  const pet = petBounds()
  if (pet) {
    const area = screen.getDisplayMatching(pet).workArea
    const x = Math.round(pet.x + pet.width / 2 - CHAT_W / 2)
    const y = Math.round(pet.y - CHAT_H - 12)
    chatWin.setBounds({
      x: Math.min(Math.max(area.x + 6, x), area.x + area.width - CHAT_W - 6),
      y: Math.min(Math.max(area.y + 6, y), area.y + area.height - CHAT_H - 6),
      width: CHAT_W,
      height: CHAT_H,
    })
  }
  chatWin.show()
  chatWin.focus()
}

function closeChat() {
  if (chatWin && !chatWin.isDestroyed()) chatWin.hide()
}

function openMenu(x, y) {
  if (!menuWin || menuWin.isDestroyed()) return
  const area = screen.getDisplayNearestPoint({ x, y }).workArea
  const height = Math.min(420, area.height - 20)
  const px = Math.min(Math.max(area.x + 6, Math.round(x)), area.x + area.width - MENU_W - 6)
  const py = Math.min(Math.max(area.y + 6, Math.round(y)), area.y + area.height - height - 6)
  menuWin.setBounds({ x: px, y: py, width: MENU_W, height })
  menuWin.show()
  menuWin.setAlwaysOnTop(true, 'screen-saver')
  menuWin.moveTop()
  menuWin.focus()
  menuOpenAt = Date.now()
  startMenuWatchdog()
  menuWin.webContents.send('menu:opened')
}

/** 菜单是独立置顶窗，主窗口不可聚焦时不会触发 blur；用光标位置判断「点外面」。 */
function startMenuWatchdog() {
  stopMenuWatchdog()
  menuOutsideTicks = 0
  menuWatchdog = setInterval(() => {
    if (!menuWin || menuWin.isDestroyed() || !menuWin.isVisible()) {
      stopMenuWatchdog()
      return
    }
    const b = menuWin.getBounds()
    const p = screen.getCursorScreenPoint()
    const inside =
      p.x >= b.x - 6 && p.x <= b.x + b.width + 6 && p.y >= b.y - 6 && p.y <= b.y + b.height + 6
    if (inside) {
      menuOutsideTicks = 0
      return
    }
    menuOutsideTicks += 1
    // 连续两次都在外面（≈240ms）才关，避免刚弹出时光标抖动误判
    if (menuOutsideTicks >= 2 && Date.now() - menuOpenAt > 150) {
      if (process.env.HESHEN_KEEP_MENU === '1') return
      hideMenu()
    }
  }, 120)
  menuWatchdog.unref?.()
}

function stopMenuWatchdog() {
  if (menuWatchdog) {
    clearInterval(menuWatchdog)
    menuWatchdog = null
  }
}

function hideMenu() {
  stopMenuWatchdog()
  if (menuWin && !menuWin.isDestroyed() && menuWin.isVisible()) menuWin.hide()
  // 菜单收起后把工作中的气泡补回来
  if (readState().work?.active) showBubbleWindow()
}

function showPet() {
  writeState({ visible: true })
  if (win) {
    win.showInactive()
    win.moveTop()
  }
  if (readState().work?.active) showBubbleWindow()
}

function hidePet() {
  stopThrow()
  hideBubbleWindow()
  hideMenu()
  closeChat()
  writeState({ visible: false })
  if (win) win.hide()
}

function togglePet() {
  if (readState().visible === false) showPet()
  else hidePet()
  refreshTray()
}

function stopThrow(notify = true) {
  try {
    win?.webContents.send('win:facing', '')
    // 飞行结束（落地/撞鱼/用户又按下）：让渲染端把「甩飞」形象收掉，别卡在那儿。
    // 注意：throwWindow() 开头也会调 stopThrow()，那次是在「起飞前」清场，不能发这个信号，
    // 否则刚亮起来的甩飞形象会被立刻收掉（现象：甩飞时看不到举网形象）。
    if (notify) {
      win?.webContents.send('win:throwState', { active: false, dir: '' })
      win?.webContents.send('win:throwEnd')
    }
  } catch {}
  if (throwTimer) {
    clearInterval(throwTimer)
    throwTimer = null
  }
}

function setupTray() {
  try {
    const image = nativeImage.createFromPath(path.join(__dirname, 'tray.png'))
    tray = new Tray(image)
    tray.setToolTip('和大人')
    refreshTray()
    tray.on('double-click', togglePet)
  } catch (error) {
    log(`tray failed ${error?.message || error}`)
  }
}

/** 托盘只有一个切换项：显示时是「隐藏和大人」，隐藏时是「显示和大人」。 */
function refreshTray() {
  if (!tray) return
  const hidden = readState().visible === false
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: hidden ? '显示和大人' : '隐藏和大人', click: togglePet },
      { type: 'separator' },
      { label: '退出桌宠', click: () => app.quit() },
    ]),
  )
  tray.setToolTip(hidden ? '和大人（已隐藏）' : '和大人')
}

/** 状态轮询：气泡该不该出现、主窗口该不该显示。 */
function startStateWatcher() {
  if (visibilityTimer) clearInterval(visibilityTimer)
  visibilityTimer = setInterval(() => {
    if (!win) return
    let state
    try {
      state = readState()
    } catch {
      return
    }
    fishTarget = state.dshpet || null
    const gate = state.dshpet?.gate
    if (gate && typeof gate.open === 'boolean') {
      if (fishGateOpen !== gate.open) log(`fish gate -> ${gate.open ? 'open' : 'closed'} (${gate.reason || ''})`)
      fishGateOpen = gate.open
      fishGateReason = String(gate.reason || '')
    }
    const helpersNow = Array.isArray(state.dshpet?.helpers) ? state.dshpet.helpers.filter((h) => Number.isFinite(Number(h?.x))) : []
    if (helpersNow.length) {
      fishHelpers = helpersNow
      fishHelper = helpersNow[0]
    } else if (state.dshpet?.helper && Number.isFinite(Number(state.dshpet.helper.x))) {
      fishHelper = state.dshpet.helper
    }
    if (state.visible !== lastVisibility) {
      lastVisibility = state.visible
      log(`visibility ${state.visible === false ? 'hidden' : 'shown'}`)
      refreshTray()
    }
    if (state.visible === false) {
      if (win.isVisible()) win.hide()
      hideBubbleWindow()
      return
    }
    if (!win.isVisible()) win.showInactive()

    const workActive = Boolean(state.work && state.work.active)
    const sayId = Number(state.say?.id) || 0
    if (sayId && sayId !== lastSayId) {
      lastSayId = sayId
      showBubbleWindow()
      if (sayTimer) clearTimeout(sayTimer)
      sayTimer = setTimeout(() => {
        sayTimer = null
        if (!readState().work?.active) hideBubbleWindow()
      }, 9000)
    }
    // 大肥鱼会走、会被拖：每 5 秒扫一次像素，碰撞判定用最新的实框
    // 不再周期扫描：统一在「按下拖动」和「甩出去」这两个时刻扫描（省 CPU，也够准）
    if (workActive) {
      if (sayTimer) {
        clearTimeout(sayTimer)
        sayTimer = null
      }
      // 菜单打开时不抬气泡，避免盖住菜单
      if (!(menuWin && !menuWin.isDestroyed() && menuWin.isVisible())) showBubbleWindow()
    } else if (!sayTimer && sayId === lastSayId) {
      hideBubbleWindow()
    }
  }, 400)
}


/**
 * 找大肥鱼：截一张 1/4 屏，在 dsh-pet 的桌面宠物窗口里数「蓝毛」色像素。
 * 她的头发/裙子是饱和的蓝（b 明显大于 r），桌面别的窗口分得开。
 * 扫到就把像素团的包围盒换算成屏幕 DIP 记下来 —— 她会走、会被拖，配置推算的框靠不住。
 * 扫不到 = 她不在画面上（被关了/没显示），撞击必定失手。
 */
/** 配置推算的槽位（兜底）：手动校准 > dsh-pet 配置的角落/边距/尺寸 */
function configSlotRect() {
  const t = fishTarget
  if (!t || !t.rect) return null
  const r = t.rect
  if (![r.x, r.y, r.w, r.h].every((v) => Number.isFinite(Number(v)))) return null
  const box = { x: Number(r.x), y: Number(r.y), w: Number(r.w), h: Number(r.h) }
  // desktop 表面（含 both）下，dsh-pet 的宠物是相对**屏幕工作区**按角落摆的，不是相对 DSH 窗口。
  // host（dshpet.js）拿不到屏幕几何，只能按窗口算，算出来的框会整体偏左上
  // （实测 1018,185 vs 真实 1242,133）。这里用「窗口右缘到框右缘」还原 marginX，
  // 再以工作区为锚重算，both 也一并按桌面那份算。
  if (t.surface === 'desktop' && t.window && Number.isFinite(Number(t.window.w))) {
    const wa = screen.getPrimaryDisplay().workArea
    const marginX = Number(t.window.x) + Number(t.window.w) - (box.x + box.w)
    const marginY = box.y - Number(t.window.y)
    return {
      x: Math.round(wa.x + wa.width - marginX - box.w),
      y: Math.round(wa.y + marginY),
      w: box.w,
      h: box.h,
    }
  }
  return box
}

/**
 * 碰撞用的框：刚扫出来的实框（10 秒内）> 手动校准 > 配置推算。
 * 大肥鱼会走、会被拖，扫出来的才是真的。
 */
function fishSlotRect() {
  // 门禁关（没插件/没启用/她没显示）→ 一个框都不给，撞空气也不会有判定
  if (!fishGateOpen) return null
  const fresh = fishDetectAt > 0 && Date.now() - fishDetectAt < FISH_FRESH_MS
  // 刚扫过、而且没扫到她：她确实不在画面上（被网走了/被关了/没显示）
  // 这时不能退回「配置推算的框」——那个框永远在，会让她明明不在也被撞出捕捉判定
  // 例外：一个桌宠窗口都没探测到（fishWindowCount=0）说明是探测失败，不是她不在，仍允许兜底
  if (fresh && fishWindowCount > 0 && !fishPresent) return null
  if (fresh && fishDetectRect) return { ...fishDetectRect, detected: true }
  // 还没扫过（启动瞬间）或扫描结果过期：才允许用手动校准 / 配置推算兜底
  if (!fresh) return configSlotRect()
  return null
}

/**
 * 整屏截图兜底：每个显示器一张，位置用 bounds（DIP），内容用 desktopCapturer。
 *
 * 为什么 macOS 需要它：dsh-pet 的桌面 helper 是 `app.dock.hide()` 的透明窗口，
 * - System Events 侧：探测脚本只枚举 `background only = false`，helper 被当成后台进程跳过；
 * - ScreenCaptureKit 侧：`getSources({types:['window']})` 的窗口列表里常常根本没有它。
 * 两条路都断，按标题找窗口就永远找不到鱼。整屏截图不依赖窗口枚举，
 * 蓝毛在哪都扫得到，扫出来的框本来也直接是屏幕 DIP。
 */
async function captureScreens() {
  try {
    const { desktopCapturer } = require('electron')
    const displays = screen.getAllDisplays()
    if (!displays.length) return []
    const maxW = Math.min(1920, Math.max(...displays.map((d) => d.size.width)))
    const maxH = Math.min(1080, Math.max(...displays.map((d) => d.size.height)))
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxW, height: maxH },
      fetchWindowIcons: false,
    })
    const out = []
    for (const src of sources) {
      const thumb = src.thumbnail
      if (!thumb || thumb.isEmpty()) continue
      const ts = thumb.getSize()
      if (!ts.width || !ts.height) continue
      const disp =
        displays.find((d) => String(d.id) === String(src.display_id)) || screen.getPrimaryDisplay()
      const b = disp.bounds
      out.push({
        kind: 'pet',
        title: src.name || 'screen',
        x: Math.round(b.x),
        y: Math.round(b.y),
        w: Math.round(b.width),
        h: Math.round(b.height),
        image: thumb,
        // 缩略图不保证 1:1，横竖分开换算；slot 计算会按这两个系数还原成 DIP
        scaleX: b.width / ts.width,
        scaleY: b.height / ts.height,
      })
    }
    return out
  } catch (error) {
    log(`screen capture failed ${error?.message || error}`)
    return []
  }
}

/**
 * 取当前屏幕上的画面（每屏一张），供 detectFish 扫蓝毛。
 *
 * 历史：这里原本按窗口标题找 dsh-pet 的桌宠窗口，Windows 走 PrintWindow、
 * macOS/Linux 走 System Events + desktopCapturer 的 window 源。两条路都要求
 * 「先按标题找到窗口」，而 dsh-pet 的桌面 helper 恰恰是最难被找到的窗口
 * （dock-hidden、透明、无边框）。现在统一成整屏截图，见 captureScreens。
 */
async function probePetWindows(timeout = 8000) {
  // 全平台统一：整屏截图。「按窗口标题找她」那条路整个退役。
  // 它在任何一个平台上都不稳：dsh-pet 的桌面 helper 是 dock-hidden 的透明窗口，
  // macOS 的 System Events 只枚举 background only=false 的进程，ScreenCaptureKit 的
  // 窗口列表里也常常没有它；Windows 的 PrintWindow 同样得先按标题找到窗口。
  // 任何一环断了，鱼就"凭空消失"。整屏截图不依赖窗口枚举：鱼画在哪个表面、
  // 画了几只，扫像素一视同仁。
  return captureScreens(timeout)
}

/**
 * 在一张 PrintWindow 出来的 PNG 里找大肥鱼（蓝毛连通块）。
 * @returns {{hits:number, rect:object|null}|null} rect 是相对窗口客户区的 DIP 偏移
 */
function scanImage(img, kind = 'pet') {
  try {
    if (!img || typeof img.getSize !== 'function' || img.isEmpty()) return null
    const { width: w, height: h } = img.getSize()
    if (!w || !h) return null
    const bmp = img.toBitmap() // BGRA
    const mask = new Uint8Array(w * h)
    let hits = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const b = bmp[i]
        const g = bmp[i + 1]
        const r = bmp[i + 2]
        const a = bmp[i + 3]
        if (a < 40) continue
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        if (max === 0) continue
        const sat = (max - min) / max
        if (b > 110 && b - r > 35 && b >= g && sat > 0.22 && max > 70) {
          mask[y * w + x] = 1
          hits++
        }
      }
    }
    const blobs = []
    const seen = new Uint8Array(w * h)
    const stack = new Int32Array(w * h)
    for (let seed = 0; seed < mask.length; seed++) {
      if (!mask[seed] || seen[seed]) continue
      let top = 0
      stack[top++] = seed
      seen[seed] = 1
      let count = 0
      let bx0 = Infinity
      let bx1 = -1
      let by0 = Infinity
      let by1 = -1
      while (top > 0) {
        const idx = stack[--top]
        const x = idx % w
        const y = (idx - x) / w
        count++
        if (x < bx0) bx0 = x
        if (x > bx1) bx1 = x
        if (y < by0) by0 = y
        if (y > by1) by1 = y
        if (x > 0 && mask[idx - 1] && !seen[idx - 1]) {
          seen[idx - 1] = 1
          stack[top++] = idx - 1
        }
        if (x + 1 < w && mask[idx + 1] && !seen[idx + 1]) {
          seen[idx + 1] = 1
          stack[top++] = idx + 1
        }
        if (y > 0 && mask[idx - w] && !seen[idx - w]) {
          seen[idx - w] = 1
          stack[top++] = idx - w
        }
        if (y + 1 < h && mask[idx + w] && !seen[idx + w]) {
          seen[idx + w] = 1
          stack[top++] = idx + w
        }
      }
      const bw = bx1 - bx0 + 1
      const bh = by1 - by0 + 1
      // 桌面窗口里的她约 200×250 DIP；DSH 网页里的她会小一号、还可能被窗口边缘裁掉，
      // 而且那个窗口里 UI 的蓝色元素更多，所以按来源分开设阈值
      const page = kind === 'page'
      const minCount = page ? 1500 : 800
      const minW = page ? 50 : 80
      const minH = page ? 60 : 80
      const maxW = 460
      const maxH = 520
      if (count < minCount || bw < minW || bh < minH || bw > maxW || bh > maxH) continue
      blobs.push({ count, bx0, by0, bw, bh })
    }
    if (!blobs.length) return { hits, rect: null, rects: [] }
    // 画面里可能同时有多只大肥鱼：display=both 时网页一份、桌面一份，
    // 配置里也可能养了多只。每个合格连通块都留一个框，撞上任意一只就算捕到。
    blobs.sort((a, b) => b.count - a.count)
    const margin = 30
    const rects = blobs.map((b) => ({
      x: b.bx0 - margin,
      y: b.by0 - margin,
      w: Math.round(b.bw + margin * 2),
      h: Math.round(b.bh + margin * 2),
      hits: b.count,
    }))
    return { hits: rects[0].hits, rect: rects[0], rects }
  } catch (error) {
    log(`fish scan failed ${error?.message || error}`)
    return null
  }
}

/**
 * 从文件路径抓一张图再扫（Windows PrintWindow 的产物）
 * @returns {{hits:number, rect:object|null}|null}
 */
function scanPng(pngPath, kind = 'pet') {
  try {
    const { nativeImage } = require('electron')
    return scanImage(nativeImage.createFromPath(pngPath), kind)
  } catch {
    return null
  }
}

/**
 * 找大肥鱼：逐个桌宠窗口取内容，再在每张图里找「蓝毛连通块」。
 * 找到就把「窗口位置 + 块包围盒」换算成屏幕 DIP 当碰撞框；一个都没找到 = 她不在画面上（撞击必失手）。
 */
/** 一个框有超过一半落在自己窗口里 → 那是和大人本人，不是大肥鱼 */
function selfIsSameBlob(slot, self) {
  const x0 = Math.max(slot.x, self.x)
  const y0 = Math.max(slot.y, self.y)
  const x1 = Math.min(slot.x + slot.w, self.x + self.width)
  const y1 = Math.min(slot.y + slot.h, self.y + self.height)
  if (x1 <= x0 || y1 <= y0) return false
  const overlap = (x1 - x0) * (y1 - y0)
  return overlap > 0.5 * slot.w * slot.h
}

async function detectFish() {
  if (fishDetecting) return fishPresent
  if (!fishGateOpen) {
    // 没有大肥鱼插件 / 插件没启用 / 她把显示关了：完全不检测（省 CPU，也不会有幽灵判定）
    fishSlots = []
    fishPresent = false
    fishEverSeen = false
    fishDetectRect = null
    fishDetectAt = 0
    fishWindowCount = 0
    return false
  }
  fishDetecting = true
  try {
    const windows = await probePetWindows()
    fishWindowCount = windows.length
    const slots = []
    let lastHits = 0
    let foundHits = 0
    // 注意：下面循环变量也叫 win（捕获结果），会遮蔽模块级的和大人窗口。
    // 自己的位置必须在循环前取好，否则自替换永远拿到 null。
    const selfBounds = win && typeof win.getBounds === 'function' ? win.getBounds() : null
    for (const win of windows) {
      const img = win.image || (win.png ? require('electron').nativeImage.createFromPath(win.png) : null)
      const scan = scanImage(img, win.kind)
      if (!scan) continue
      lastHits = Math.max(lastHits, scan.hits)
      const rects = scan.rects && scan.rects.length ? scan.rects : scan.rect ? [scan.rect] : []
      if (!rects.length) continue
      const sx = Number(win.scaleX) > 0 ? Number(win.scaleX) : 1
      const sy = Number(win.scaleY) > 0 ? Number(win.scaleY) : 1
      // 一张图里可能有好几只：每个框都进 slots，撞上任意一只就算捕到。
      // 但**和大人自己**也是蓝的（官服），整屏扫描会把他自己扫成"鱼"——
      // 那样一甩飞，网立刻撞在自己身上秒抓。凡是跟自己窗口大面积重合的框一律丢掉。
      for (const r of rects) {
        const slot = {
          x: Math.round(Number(win.x) + r.x * sx),
          y: Math.round(Number(win.y) + r.y * sy),
          w: Math.round(r.w * sx),
          h: Math.round(r.h * sy),
          hits: r.hits || scan.hits,
          from: win.kind === 'page' ? 'page' : 'desktop',
        }
        if (selfBounds && selfIsSameBlob(slot, selfBounds)) {
          log(`skip self-blob @${slot.x},${slot.y} ${slot.w}x${slot.h}`)
          continue
        }
        slots.push(slot)
        foundHits = Math.max(foundHits, r.hits || scan.hits)
      }
    }
    fishSlots = slots
    fishPresent = slots.length > 0
    if (fishPresent) {
      fishEverSeen = true
      fishDetectRect = slots[0]
    } else {
      fishDetectRect = null
    }
    const found = fishPresent ? { hits: foundHits, rect: fishDetectRect } : null
    fishDetectAt = Date.now()
    log(
      `fish detect windows=${windows.length} present=${fishPresent} everSeen=${fishEverSeen} ` +
        `hits=${fishPresent ? foundHits : lastHits} ` +
        `slots=${slots.map((x) => `${x.from}@${x.x},${x.y} ${x.w}x${x.h}`).join(' ') || 'none'}`,
    )
    try {
      writeState({
        fishDetect: {
          present: fishPresent,
          everSeen: fishEverSeen,
          hits: found ? found.hits : lastHits,
          windows: windows.length,
          slots: slots.map((x) => ({ from: x.from, x: x.x, y: x.y, w: x.w, h: x.h })),
          rect: fishDetectRect,
          surface: fishTarget?.surface || '',
          gate: fishGateOpen,
          at: Date.now(),
        },
      })
    } catch {}
    return fishPresent
  } catch (error) {
    log(`fish detect failed ${error?.message || error}`)
    return fishPresent
  } finally {
    fishDetecting = false
  }
}

/** 撞上大肥鱼之前，网络是不是该自己先收网：把大肥鱼立刻关掉（不等插件轮询） */
async function hideFishNow() {
  const origin = process.env.HESHEN_DSHPET_ORIGIN
  const token = process.env.HESHEN_DSHPET_TOKEN
  if (!origin || !token) return
  const petId = (fishTarget && fishTarget.petId) || 'main'
  try {
    const res = await fetch(`${origin}/api/dsh-pet-7340/pet-display?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-DSH-Pet-Token': token },
      body: JSON.stringify({ id: petId, display: 'none' }),
      signal: AbortSignal.timeout(4000),
    })
    log(`fish hide status=${res.status}`)
  } catch (error) {
    log(`fish hide failed ${error?.message || error}`)
  }
}

/**
 * 甩飞撞上大肥鱼：停下飞行 → 判定 → 播动作 + 说台词 + 写 state.fish。
 * forced 只给测试用（success / fail / reckless / hidden）。
 */
function runCapture(slot, svx, svy, forced) {
  stopThrow()
  if (captureLock) return
  captureLock = true
  setTimeout(() => {
    captureLock = false
  }, 3200)

  const target = fishTarget || {}
  // visible 的语义：屏幕上此刻确实扫到了至少一只大肥鱼，才允许判定。
  // 不再区分「桌面窗口」还是「网页」——整屏截图之后两者本来就分不开，
  // 以前"只画在网页里 → 必定失败"的那条规则整个删掉。
  // 本轮从没扫到过她 = 可能刚启动、抓拍失败 → 按「在」处理，别让游戏直接没法玩。
  const visible = fishGateOpen && (fishSlots.length > 0 || !fishEverSeen)
  const speed = Math.hypot(Number(svx) || 0, Number(svy) || 0)
  let verdict
  if (forced === 'success') verdict = { result: 'success', chance: 0, reckless: false, speed }
  else if (forced === 'hidden') verdict = { result: 'hidden', chance: 1, reckless: true, speed }
  else if (forced === 'reckless') verdict = { result: 'fail', chance: 1, reckless: true, speed: Math.max(speed, 2600) }
  else if (forced === 'fail') verdict = { result: 'fail', chance: 1, reckless: false, speed: Math.min(speed, 900) }
  else verdict = capture.judgeCapture({ speed, visible })

  const now = Date.now()
  let anim = '跪舔'
  let face = '04-委屈'
  let line = capture.pickLine(capture.FAIL_LINES)
  if (verdict.result === 'success') {
    anim = '网住大肥鱼'
    face = '05-得意'
    line = capture.pickLine(capture.BRAG_LINES)
    // 她被网走了：立刻标记「不在」，别让旧的检测框在接下来几秒里又触发一次捕捉
    fishPresent = false
    fishEverSeen = true
    fishDetectRect = null
    fishSlots = []
    fishDetectAt = Date.now()
    void hideFishNow()
  } else if (verdict.result === 'hidden') {
    anim = '斗嘴'
    face = '06-恼怒'
    line = capture.pickLine(capture.HIDDEN_BLAME_LINES)
  } else if (verdict.reckless) {
    anim = '斗嘴'
    face = '06-恼怒'
    line = capture.pickLine(capture.BLAME_LINES)
  }

  try {
    writeState({
      // 不写 anim：捕捉演出由 state.capture 驱动，写 anim 会被工作态当成「用户点播」再播一遍
      say: { id: now + 1, text: line, face },
      capture: {
        at: now,
        result: verdict.result,
        anim,
        speed: Math.round(speed),
        facing: flightFacing || '',
      },
      fish: {
        at: now,
        result: verdict.result,
        speed: Math.round(speed),
        chance: Number((verdict.chance || 0).toFixed(3)),
        slot: slot ? { x: slot.x, y: slot.y, w: slot.w, h: slot.h } : null,
      },
    })
    log(
      `capture ${verdict.result} speed=${Math.round(speed)} chance=${Number(verdict.chance || 0).toFixed(2)} ` +
        `anim=${anim} line=${line.slice(0, 14)}`,
    )
  } catch (error) {
    log(`capture write failed ${error?.message || error}`)
  }
}

function throwWindow(vx, vy) {
  stopThrow(false) // 起飞前清场：不要把甩飞形象收掉
  if (!win) return
  // 起飞瞬间：坐标不是刚量的就立刻补一次（拖动时已经预扫过，通常这里就是新的）
  if (fishGateOpen && !fishDetecting && Date.now() - fishDetectAt > 600) void detectFish()
  log(
    `throw start speed=${Math.round(Math.hypot(Number(vx) || 0, Number(vy) || 0))} ` +
      `fishAge=${fishDetectAt ? Date.now() - fishDetectAt : -1}ms ` +
      `slots=${fishSlots.map((x) => `${x.from}@${x.x},${x.y} ${x.w}x${x.h}`).join(' ') || 'none'}`,
  )
  const bounds = win.getBounds()
  // 尺寸在飞行中可能变（甩飞形象比待机宽）：每帧现算边界，别用起飞那一刻的尺寸
  const area = screen.getDisplayMatching(bounds).workArea
  const minX = area.x
  const minY = area.y
  const startSize = intendedSize()
  const maxX0 = Math.max(minX, area.x + area.width - startSize.width)
  const maxY0 = Math.max(minY, area.y + area.height - startSize.height)
  let x = Math.min(Math.max(bounds.x, minX), maxX0)
  let y = Math.min(Math.max(bounds.y, minY), maxY0)
  let svx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, Number(vx) || 0))
  let svy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, Number(vy) || 0))
  const throwStartedAt = Date.now()
  let last = Date.now()
  // 飞行朝向：向左飞就跟渲染端说一声，让它换成「面向左」的镜像素材
  let lastFacing = ''
  const sendFacing = (dir) => {
    flightFacing = dir
    if (dir === lastFacing) return
    lastFacing = dir
    try {
      win?.webContents.send('win:facing', dir)
    } catch {}
  }
  sendFacing(svx < 0 ? 'left' : svx > 0 ? 'right' : '')

  const bounce = (edge, speed) => {
    try {
      log(`bounce ${edge} speed=${Math.round(Math.abs(speed))}`)
      win?.webContents.send('win:bounce', edge, Math.abs(speed))
    } catch {}
  }

  // 飞行状态：每 ~100ms 播一次（渲染端据此保持「举网」形象，不靠猜）
  let lastStateAt = 0
  const publishThrowState = (active, dir) => {
    if (active) {
      const now = Date.now()
      if (now - lastStateAt < 100) return
      lastStateAt = now
    }
    try {
      win?.webContents.send('win:throwState', { active: Boolean(active), dir: dir || '' })
    } catch {}
  }

  throwTimer = setInterval(() => {
    if (!win) {
      stopThrow()
      return
    }
    const now = Date.now()
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
    last = now
    const { width, height } = intendedSize()
    const maxX = Math.max(minX, area.x + area.width - width)
    const maxY = Math.max(minY, area.y + area.height - height)
    svy += GRAVITY * dt
    x += svx * dt
    y += svy * dt

    if (x < minX) {
      x = minX
      if (svx < 0) bounce('left', svx)
      svx = Math.abs(svx) * RESTITUTION
    } else if (x > maxX) {
      x = maxX
      if (svx > 0) bounce('right', svx)
      svx = -Math.abs(svx) * RESTITUTION
    }
    if (y < minY) {
      y = minY
      if (svy < 0) bounce('top', svy)
      svy = Math.abs(svy) * RESTITUTION
    } else if (y > maxY) {
      y = maxY
      if (svy > 0) bounce('bottom', svy)
      svy = -Math.abs(svy) * RESTITUTION
      svx *= Math.max(0, 1 - FLOOR_FRICTION * dt)
    }

    if (Math.abs(svx) < 25 && Math.abs(svy) < 25 && y >= maxY - 1) {
      svx = 0
      svy = 0
    }
    // 方向变了（含撞墙回弹）就通知渲染端换朝向
    sendFacing(Math.abs(svx) < 120 ? (Math.abs(svy) < 120 ? '' : lastFacing) : svx < 0 ? 'left' : 'right')
    // 撞上大肥鱼：立刻停飞并判定捕捉（判定只需要一下，不等落地）
    if (!captureLock) {
      // 她可能同时画在桌面窗口和网页（DSH 窗口）里：每个扫到的框都算一遍。
      // 扫描结果超过 2.5 秒就作废并立刻重扫——切换 display 之后旧的框不能再用来判捕捉
      // 她几乎不动（实测整场只在 ~30px 内漂），「过期但存在」的槽位照样能用；
      // 只有「刚扫过且明确没扫到」才算不在。以前一律丢弃，导致大量甩飞在无槽位状态下必 miss。
      if (Date.now() - fishDetectAt > 1500 && !fishDetecting) void detectFish()
      const slots = fishSlots.length ? fishSlots : fishSlotRect() ? [fishSlotRect()] : []
      if (slots.length) {
        const ink = { x: Math.round(x) + 4, y: Math.round(y) + 4, w: width - 8, h: height - 8 }
        const hit = slots.find((s) => capture.rectsOverlap(ink, s, 10))
        if (hit) {
          runCapture(hit, svx, svy)
          return
        }
      }
    }

    // 还在飞：持续告诉渲染端「举网要继续」
    publishThrowState(Math.abs(svx) > 20 || Math.abs(svy) > 20, svx < 0 ? 'left' : 'right')
    // 只改位置，尺寸显式写死，避免 DPI 取整把窗口越抛越大
    win.setBounds({ x: Math.round(x), y: Math.round(y), width, height })
    syncSatellites()
    if (svx === 0 && svy === 0) stopThrow()
    // 硬超时兜底：8 秒还没停下就强制收尾，避免「举着网卡住/拖不动」
    else if (Date.now() - throwStartedAt > 8000) {
      log('throw force-stop after 8s')
      stopThrow()
    }
  }, 16)
}

function defaultPosition(width, height) {
  const area = screen.getPrimaryDisplay().workArea
  return {
    x: Math.round(area.x + area.width - width - 28),
    y: Math.round(area.y + area.height - height - 40),
  }
}

/** 读取待机素材的着墨尺寸，让窗口一启动就是正确大小。 */
function canvasSize() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'animations', 'layout.json'), 'utf8'))
    const idle = raw['idle-static'] || raw.idle
    if (idle && Number(idle.width) > 0) {
      return {
        width: Number(idle.width),
        height: Number(idle.height),
        anchorX: Number(idle.anchorX) || Number(idle.width) / 2,
      }
    }
  } catch {}
  return { width: 198, height: 259, anchorX: 98 }
}

function baseWebPreferences(preload) {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    backgroundThrottling: false,
  }
}

function createPetWindow() {
  const state = readState()
  const canvas = canvasSize()
  // 0.75：整体缩小到 3/4，「100%」对应的就是缩小后的尺寸
  const scale = Math.max(0.7, Math.min(1.5, Number(state.scale) || 1)) * 0.75
  const inkW = Math.round(canvas.width * scale)
  const inkH = Math.round(canvas.height * scale)
  const anchorPx = Math.round(canvas.anchorX * scale) + 4
  currentMetrics = { width: canvas.width, height: canvas.height, anchorPx, scale }
  const width = inkW + 8
  const height = inkH + 8
  const fallback = defaultPosition(width, height)
  const hasX = state.x !== null && state.x !== undefined && Number.isFinite(Number(state.x))
  const hasY = state.y !== null && state.y !== undefined && Number.isFinite(Number(state.y))

  win = new BrowserWindow({
    width,
    height,
    x: hasX ? Number(state.x) : fallback.x,
    y: hasY ? Number(state.y) : fallback.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences: baseWebPreferences(path.join(__dirname, 'preload.js')),
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // 主窗口就是角色本身，必须整窗可点，否则整只和大人都会变成点击穿透
  win.setIgnoreMouseEvents(false)
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    log(`renderer[${level}] ${message} (${sourceId}:${line})`)
  })
  win.webContents.on('did-fail-load', (_event, code, desc) => log(`did-fail-load ${code} ${desc}`))
  win.webContents.on('did-finish-load', () => {
    log('pet did-finish-load')
    if (readState().visible !== false) {
      win.show()
      win.setAlwaysOnTop(true, 'screen-saver')
      win.moveTop()
    }
    syncSatellites()
  })
  {
    // 可选初始状态：常服（#changfu）、镜像（#mirror），测试用
    const hash = []
    win.loadFile(path.join(__dirname, 'pet.html'), hash.length ? { hash: hash.join('-') } : undefined)
  // 启动时把已保存的亏空阈值同步进 state，右键菜单才能显示当前值
  try {
    writeState({ jailThreshold: readJailThreshold() })
  } catch {}

  }
  win.once('ready-to-show', () => {
    if (readState().visible !== false) win.show()
  })
  win.on('move', () => syncSatellites())
  win.on('moved', () => {
    syncSatellites()
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!win) return
      const [px, py] = win.getPosition()
      writeState({ x: px, y: py })
    }, 250)
  })
  win.on('closed', () => {
    stopThrow()
    win = null
  })
}

function createBubbleWindow() {
  bubbleWin = new BrowserWindow({
    width: BUBBLE_W,
    height: BUBBLE_H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences: baseWebPreferences(path.join(__dirname, 'preload.js')),
  })
  // 气泡层级压在菜单/对话之下，保证右键菜单不会被提示框盖住
  bubbleWin.setAlwaysOnTop(true, 'floating')
  bubbleWin.setIgnoreMouseEvents(true, { forward: true })
  bubbleWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  bubbleWin.loadFile(path.join(__dirname, 'bubble.html'))
  bubbleWin.webContents.on('did-finish-load', () => log('bubble did-finish-load'))
}

function createMenuWindow() {
  menuWin = new BrowserWindow({
    width: MENU_W,
    height: 420,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    show: false,
    webPreferences: baseWebPreferences(path.join(__dirname, 'preload.js')),
  })
  menuWin.setAlwaysOnTop(true, 'screen-saver')
  menuWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  menuWin.loadFile(path.join(__dirname, 'menu.html'))
  menuWin.on('blur', () => hideMenu())
  menuWin.webContents.on('did-finish-load', () => log('menu did-finish-load'))
}

function createChatWindow() {
  chatWin = new BrowserWindow({
    width: CHAT_W,
    height: CHAT_H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    show: false,
    webPreferences: baseWebPreferences(path.join(__dirname, 'preload.js')),
  })
  chatWin.setAlwaysOnTop(true, 'screen-saver')
  chatWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  chatWin.loadFile(path.join(__dirname, 'chat.html'))
  chatWin.on('blur', () => {
    // 点外面只收输入焦点，不关窗口；用户用 × 或 Esc 关
  })
  chatWin.webContents.on('did-finish-load', () => log('chat did-finish-load'))
}

function createWindow() {
  createPetWindow()
  createBubbleWindow()
  createMenuWindow()
  createChatWindow()
  setupTray()
  startStateWatcher()
}

/** 调试用：把每个窗口各截一张图后退出。 */

ipcMain.handle('state:read', () => readState())
ipcMain.handle('state:write', (_event, next) => writeState(next || {}))

ipcMain.on('pet:metrics', (_event, payload) => {
  if (!win || !payload) return
  const PAD = 4
  const scale = Math.max(0.7, Math.min(1.5, Number(payload.scale) || 1))
  const inkW = Math.max(1, Math.round(Number(payload.width) * scale))
  const inkH = Math.max(1, Math.round(Number(payload.height) * scale))
  const width = inkW + PAD * 2
  const height = inkH + PAD * 2
  // 帽子中心在窗口内的横向位置：换/缩放动作时以它为锚点，角色不会左右跳
  const anchorPx = Math.round((Number(payload.anchorX) || inkW / 2) * scale) + PAD
  const bounds = win.getBounds()
  const scaleChanged = Math.abs(scale - currentMetrics.scale) > 0.001
  const oldAnchorPx = currentMetrics.anchorPx ?? Math.round(bounds.width / 2)
  const anchorScreenX = bounds.x + oldAnchorPx
  currentMetrics = {
    width: Number(payload.width) || currentMetrics.width,
    height: Number(payload.height) || currentMetrics.height,
    anchorPx,
    scale,
  }
  log(
    `metrics ${payload.name || '?'} ink ${inkW}x${inkH} -> ${width}x${height} ` +
      `bounds ${bounds.width}x${bounds.height} scale=${scale}`,
  )
  if (
    Math.abs(bounds.width - width) <= 2 &&
    Math.abs(bounds.height - height) <= 2 &&
    !scaleChanged
  ) {
    return
  }
  win.setBounds({
    x: Math.round(anchorScreenX - anchorPx),
    y: Math.round(bounds.y + bounds.height - height),
    width,
    height,
  })
  const after = win.getBounds()
  log(`metrics applied -> bounds ${after.width}x${after.height}`)
  syncSatellites()
})

ipcMain.on('win:throw', (_event, vx, vy) => {
  if (!win) return
  log(`throw request vx=${Math.round(vx)} vy=${Math.round(vy)}`)
  throwWindow(vx, vy)
})
ipcMain.on('win:throwSkip', (_event, info) => {
  log(
    `throw skipped settled=${info?.settled} settleMs=${info?.settleMs} ` +
      `stillMs=${info?.stillMs} dist=${info?.dist} speed=${info?.speed}`,
  )
})
ipcMain.on('win:stop', () => stopThrow())
ipcMain.on('win:ignore', (_event, ignore) => {
  if (!win) return
  // 窗口已紧贴角色，一旦忽略鼠标整只和大人就点不到，因此主窗口始终可点
  if (ignore) log('win:ignore(true) 已忽略（主窗口保持可点）')
  win.setIgnoreMouseEvents(false)
})
function intendedSize() {
  const scale = currentMetrics.scale || 1
  return {
    width: Math.round((currentMetrics.width || 198) * scale) + 8,
    height: Math.round((currentMetrics.height || 259) * scale) + 8,
  }
}

function nudge(dx, dy) {
  if (!win) return
  const [x, y] = win.getPosition()
  const { width, height } = intendedSize()
  // 移动时显式带上目标尺寸：只拿当前 bounds 会把 DPI 取整误差反馈成“窗口越拖越大”
  win.setBounds({
    x: Math.round(x + Number(dx || 0)),
    y: Math.round(y + Number(dy || 0)),
    width,
    height,
  })
  syncSatellites()
}

ipcMain.on('win:move', (_event, dx, dy) => {
  stopThrow()
  nudge(dx, dy)
})
ipcMain.on('win:hide', () => hidePet())
ipcMain.on('win:show', () => showPet())
ipcMain.on('app:quit', () => app.quit())

ipcMain.on('fish:prefetch', () => {
  // 拖拽开始就重扫一次：松手甩出去的那一刻，用的是「刚量过」的坐标
  if (!fishGateOpen) return
  if (!fishDetecting && Date.now() - fishDetectAt > 600) void detectFish()
})

ipcMain.on('menu:open', (_event, point) => {
  const cursor = screen.getCursorScreenPoint()
  openMenu(
    point && Number.isFinite(Number(point.x)) ? Number(point.x) : cursor.x,
    point && Number.isFinite(Number(point.y)) ? Number(point.y) : cursor.y,
  )
})
ipcMain.on('menu:close', () => hideMenu())
ipcMain.on('menu:resize', (_event, height) => {
  if (!menuWin || menuWin.isDestroyed()) return
  const value = Math.max(80, Math.min(460, Math.round(Number(height) || 0)))
  const bounds = menuWin.getBounds()
  if (bounds.height === value) return
  const area = screen.getDisplayMatching(bounds).workArea
  const y = Math.min(bounds.y, area.y + area.height - value - 6)
  menuWin.setBounds({ x: bounds.x, y: Math.max(area.y + 6, y), width: MENU_W, height: value })
})
let thresholdWin = null

function openThresholdWindow() {
  hideMenu()
  if (thresholdWin && !thresholdWin.isDestroyed()) {
    thresholdWin.show()
    thresholdWin.focus()
    return
  }
  const width = 320
  const height = 190
  const b = win && !win.isDestroyed() ? win.getBounds() : null
  const area = screen.getDisplayMatching(b || screen.getPrimaryDisplay().bounds).workArea
  const x = b ? Math.min(Math.max(area.x + 8, b.x + b.width + 8), area.x + area.width - width - 8) : area.x + 100
  const y = b ? Math.min(Math.max(area.y + 8, b.y - 40), area.y + area.height - height - 8) : area.y + 100
  thresholdWin = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  thresholdWin.loadFile(path.join(__dirname, 'threshold.html'))
  let thresholdOpenedAt = Date.now()
  thresholdWin.once('ready-to-show', () => {
    thresholdOpenedAt = Date.now()
    thresholdWin.show()
    thresholdWin.focus()
    thresholdWin.webContents.send('jail:threshold-init', readJailThreshold())
  })
  thresholdWin.on('closed', () => {
    thresholdWin = null
  })
  thresholdWin.on('blur', () => {
    // 点外面就收起（跟右键菜单一致）；刚打开的那 700ms 内不算，否则一创建就自己关了
    if (Date.now() - thresholdOpenedAt < 700) return
    setTimeout(() => {
      if (thresholdWin && !thresholdWin.isDestroyed() && !thresholdWin.isFocused()) {
        thresholdWin.close()
      }
    }, 180)
  })
}

ipcMain.on('jail:threshold-save', (_event, value) => {
  const v = Math.round(Number(value) * 100) / 100
  if (!Number.isFinite(v) || v < 0.01 || v > 10000) return
  writeJailThreshold(v)
  log(`jail threshold -> ${v}`)
  writeState({ jailThreshold: v })
  if (thresholdWin && !thresholdWin.isDestroyed()) thresholdWin.close()
})

ipcMain.on('jail:threshold-close', () => {
  if (thresholdWin && !thresholdWin.isDestroyed()) thresholdWin.close()
})

ipcMain.on('menu:action', (_event, payload) => {
  const action = String(payload?.action || '')
  const data = payload?.data || {}
  if (action === 'scale') {
    writeState({ scale: Number(data.scale) || 1 })
    win?.webContents.send('pet:scale', Number(data.scale) || 1)
    return
  }
  if (action === 'settle') {
    const ms = clampSettle(data.ms)
    writeState({ throwSettleMs: ms })
    win?.webContents.send('pet:throwSettle', ms)
    log(`throw settle -> ${ms}ms`)
    return
  }
  hideMenu()
  if (action === 'play') {
    if (data.anim) writeState({ anim: { id: Date.now(), name: data.anim, loop: data.loop !== false } })
    if (data.text) writeState({ say: { id: Date.now(), text: String(data.text) } })
  } else if (action === 'face') {
    writeState({ say: { id: Date.now(), text: String(data.text || ''), face: data.face || '' } })
  } else if (action === 'treasury') {
    writeState({ treasury: { ...(readState().treasury || {}), refreshAt: Date.now() } })
  } else if (action === 'jail-threshold') {
    openThresholdWindow()
  } else if (action === 'chat') {
    openChat()
  } else if (action === 'memory') {
    // 记忆账本由插件端生成（主记忆/目录/分记忆与 token 账目），这里只点个「该出账本了」并由窗口展示
    writeState({ memory: { viewAt: Date.now() } })
    openChat()
  } else if (action === 'hide') {
    // 菜单里已经没有「先躲起来」，这里保留 IPC 兜底但不再暴露入口
    hidePet()
  } else if (action === 'quit') {
    app.quit()
  }
})
ipcMain.on('bubble:height', (_event, height) => {
  const h = Math.max(48, Math.min(BUBBLE_H, Math.round(Number(height) || BUBBLE_H)))
  if (Math.abs(h - bubbleContentH) < 1) return
  bubbleContentH = h
  syncSatellites()
})
ipcMain.on('chat:open', () => openChat())
ipcMain.on('chat:close', () => closeChat())

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
    }
  })
  app.whenReady().then(createWindow)
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => {
    if (visibilityTimer) clearInterval(visibilityTimer)
    if (sayTimer) clearTimeout(sayTimer)
    tray?.destroy()
  })
}


// 启动后预热一次捕鱼槽位：不预热的话第一次甩飞时 fishSlots 还是空的，
// 碰撞只能用配置推算的框（她可能已经被拖走），而且探测本身要花几百毫秒。
setTimeout(() => {
  if (fishGateOpen && !fishDetecting) void detectFish()
}, 5000)
