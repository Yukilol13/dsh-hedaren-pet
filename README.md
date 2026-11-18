# dsh-hedaren-pet · 和大人桌面宠物

> 给你的 DeepSeek Harness 桌面塞一位 Q 版和大人：两头身、大头、眯眼笑，穿官服、戴孔雀翎顶戴，会说话、会算账、会替皇上操心国库。

一个 **DSH 插件**（bundle）——它不只是一个表情包，而是一只**独立运行的透明 Electron 桌宠**：有自己的窗口、自己的托盘、自己的右键菜单、自己的动画和记忆。

![和大人](app/animations/idle-static.png)

## 它能做什么

| 模块 | 说明 |
| --- | --- |
| 🎬 全套动画 | 23 段 C 版动作：待机·呼吸、捻须、背手、打哈欠、数朝珠、拱手、递古董、跪舔、拍马屁、被参一本、银票打手、斗嘴、琉璃厂、常服算账、塞银票、常服进门、府里数银、工作三阶段…… 278×306 统一画布，换动作窗口不跳 |
| 😀 8 张表情 | 招牌笑 / 算计 / 惊讶 / 委屈 / 得意 / 恼怒 / 害怕 / 困倦，随台词自动切 |
| 💬 聊天与人格 | 右键「与和大人说话」：称你为皇上、自称奴才；带**三层记忆**（主记忆 / 目录 / 分记忆）与 token 账本，记得住你之前说过的事 |
| 💰 国库抽成 | 每轮对话结束象征性查一次国库（花的 token 折成钱），顺手抽成几厘，记在「和大人资产」里；「查看国库」随时报账 |
| 🐟 网住大肥鱼 | 把和大人**甩出去**，撞到屏幕上的蓝毛小女仆「大肥鱼」就有机会把她网走（撒网动画、邀功/请罪/怪老纪台词、捕获计数）。画面里有几只就登记几只，撞上**任意一只**都算 |
| 🏮 牢房亏空 | 右键可设「亏空阈值」（0.01–10,000，两位小数，**默认 10 元**）：国库余额低于它时查国库，和大人会先报完账、再换成光膀子红肚兜的牢房形象高呼「小月！莫愁！」 |
| 🪞 镜像 | 待机随机镜像；向左甩飞时自动换「面向左」的镜像素材（甩飞形象与网住动画都有左右两版） |
| 🫳 手感 | 拖动、甩飞、撞墙回弹、落地压扁、气泡跟随、右键菜单、托盘显示/隐藏 |

## 安装到 DSH

```bash
# 1) 放进某个插件目录（示例）
git clone https://github.com/Yukilol13/dsh-hedaren-pet.git
# 2) 在 profile 里加链接依赖
cd ~/.dsh/profiles/desktop
npm pkg set dependencies.dsh-hedaren-pet="link:/path/to/dsh-hedaren-pet"
npm pkg set 'dsh.profile.bundles[999]'="dsh-hedaren-pet"
# 3) 建 junction / symlink 到 node_modules（Windows 用 mklink /J）
mklink /J node_modules\dsh-hedaren-pet C:\path\to\dsh-hedaren-pet
# 4) 重启 DSH（或插件管理器里重新启用该 bundle）
```

## 使用

- **左键单击**：随机礼仪/日常动作 + 一句台词
- **拖拽**：拖动；松手前快速甩动 → 飞出去（撞墙会弹）
- **右键**：菜单（与和大人说话 / 查看国库 / 亏空阈值 / 记忆账本 / 动作分类 / 缩放与甩飞灵敏度 / 系统托盘…）
- **托盘**：显示/隐藏和大人

## 目录结构

```
dsh-hedaren-pet/
├─ index.js             插件主体（工具、状态轮询、国库、聊天、记忆）
├─ dshpet.js            dsh-pet 联动（定位大肥鱼、关/开她、窗口探测）
├─ memory.js            三层记忆存储
├─ persona.md           和大人人格
├─ app/                 桌宠 Electron 应用
│  ├─ main.js           窗口、物理、托盘、菜单、IPC
│  ├─ pet.html          渲染（动画/状态机/镜像/甩飞）
│  ├─ bubble.html       气泡
│  ├─ menu.html         右键菜单
│  ├─ chat.html         聊天窗
│  ├─ threshold.html    亏空阈值输入
│  ├─ capture.js        捕捉判定（概率、台词、矩形）
│  ├─ animations/       23 段 webp + 待机/甩飞/网住/牢房静态图 + layout.json
│  └─ expressions/      8 张表情
├─ locale/              中英文案
├─ cordis.patch.yml     bundle 补丁
└─ icon.svg             插件图标
```

## 环境与依赖

- **DeepSeek Harness**（桌面版 Web GUI）
- **dsh-pet**（可选，装了才有捕鱼玩法；见下节「捕鱼的前置条件」）

### 平台支持

| 平台 | 桌宠本体（窗口/动画/拖拽/菜单/聊天/国库/牢房） | 捕鱼（定位大肥鱼） |
| --- | --- | --- |
| **Windows** | ✅ 已验证 | ✅ PrintWindow 按窗口抓图 + 蓝色连通块（子进程，不占主线程） |
| **macOS** | ✅ 已在真机验证（Retina / scaleFactor 2） | ✅ 整屏截图；需给 Electron **屏幕录制**权限 |
| **Linux (X11)** | ✅ 逻辑上可用 | ✅ 整屏截图；需 Electron 屏幕捕获权限 |
| **Linux (Wayland)** | ⚠️ 透明窗口依赖合成器 | ⚠️ 取决于合成器是否允许整屏捕获 |

抓法按平台分两条，选型理由是**主线程开销**：

- **Windows**：`app/print_pets.ps1` 枚举标题含「dsh-pet 桌宠」「DeepSeek Harness」的窗口，
  用 `PrintWindow(PW_RENDERFULLCONTENT)` 逐窗口抓 1:1 客户区。
  抓图跑在 **常驻 PowerShell 进程**里（`-Daemon`，C# 编译结果缓存成 DLL 只加载一次），
  主线程只解码一张窗口大小的 PNG 再扫（实测 10~25 ms）。实测：
  整屏 `desktopCapturer` 一次 ~500 ms 且**全程阻塞 Electron 主线程**；
  一次性 PowerShell 一次 ~1.4 s；常驻进程之后一次抓图只要 **35~67 ms**。
  甩飞是「松手就飞」，等 1.4 秒等于前 1.4 秒没有任何碰撞框（飞快了直接从她身上穿过去），
  所以起飞前会 `await` 最多 400 ms 拿一批新鲜坐标（通常 40~90 ms 就够）。
- **macOS / Linux**：整屏截图（`captureScreens`，每个显示器一张）。这两边的桌面 helper 是
  `app.dock.hide()` 的透明窗口：System Events 只枚举 `background only = false` 的进程，
  ScreenCaptureKit 的窗口列表里也常常没有它，按标题找永远找不到，只能整屏扫。

`app/winprobe.js` 仅剩宿主侧用来估算兜底框。

## 设置（DSH 设置 → 和大人府邸）

桌宠的所有可调项都在 DSH 设置页里的「和大人府邸」栏目（`settings.section`，`client/client.js`）：

| 项 | 说明 |
| --- | --- |
| 桌宠显示 | 显示/隐藏（等价于菜单里的显示、隐藏） |
| 大小 | 70%–150%（写 `state.scale`） |
| 甩飞阈值 | 50–500 ms，松手前静止超过这么久才甩出去 |
| 亏空阈值 | 余额低于它就进牢房，0 = 不关 |
| 对话模型 | DSH 里所有配置好的 `provider/model`，选中即生效（聊天窗里也能换） |
| 国库余额 | 当前余额与来源 |

数据接口是宿主插件注册的同源路由 `GET/POST /heshen-pet/settings`。右键菜单里只剩动作（说话、国库、记忆账本、动画、退出）。

## 对话模型与余额

- 对话走 DSH 的 `llm` 服务：`llm.listProviders()` + `llm.listModels(provider)` 列出现有模型，`llm.stream({provider, model, ...})` 调用；凭据由 DSH 的 provider 适配器管。调不通才回退官方 `api.deepseek.com`（再不行回退 `arkcli-agent-plan` 的火山接口）。
- 余额按来源链查：**OpenRouter 额度 → 月之暗面余额 → DeepSeek 余额**。谁配了凭据且查得到就报谁（`state.treasury.sourceLabel` 会写明来源），都查不到时就是原来那版显示的 DeepSeek 余额。

## 捕鱼的前置条件（门禁）

捕鱼不是永远在跑。只有同时满足下面三条才会做窗口探测与像素扫描：

1. **大肥鱼插件装着且启用** —— 检测宿主上的路由前缀（`/dsh-pet-*` 或 `/dsh-dafeiyu-*`）。
   插件没装、或装了但在插件管理器里关掉 → 前缀消失 → 直接不检测。
2. **配置里确实有这只宠物**（默认 `id=main`）。
3. **她的 `display` 不是 `none`**（`desktop` / `both` / `web` 都算有显示）。

任何一条不满足：`state.dshpet.gate = { open: false, reason }`，桌宠侧完全不探测、不给碰撞框，
撞空气也不会触发捕捉判定。常见 `reason`：

| reason | 含义 |
| --- | --- |
| `no-plugin` | 没装大肥鱼插件，或插件被关掉 |
| `no-fish-pet` | 配置里没有那只宠物 |
| `fish-hidden` | 她把显示关了（`display: none`） |
| `ok` | 门禁打开，正常检测 |

检测时机：**启动后预热一次**（避免第一次甩飞时槽位是空的）、**按下拖动时**预扫一次、
**甩飞瞬间**补扫一次（坐标超过 1.5 秒就作废重扫），平时完全不扫，不占 CPU。

## 已知限制

- 大肥鱼的位置靠**像素扫描**判断（蓝色连通块），**不调用任何模型接口、不消耗 token**；
  只在**启动预热**、**按下拖动**、**甩飞瞬间**扫描
- 画面里有几只大肥鱼就登记几只，撞上任意一只都算捕到；`display: both` 时网页和桌面各有一份，
  两份都能撞
- 和大人自己的官服也是蓝的，扫桌面那份时会把自己扫成鱼——所以凡是**与自己窗口重合超过一半**的
  连通块一律丢弃，避免一甩飞就"抓到自己"
- Windows 只抓那两个窗口的内容，目标被其它窗口**遮住**也照样扫得到；
  macOS/Linux 按屏幕合成结果判断，遮住就算看不见
- macOS 需要给 Electron「屏幕录制」权限；Linux Wayland 能否捕获取决于合成器
- 动画素材为 1x 分辨率（278×306），显示按 0.75 基准缩放，放大到 150% 会略软
- 甩飞形象/网住动画的左右两版是镜像素材，不是重新绘制

## 致谢

- **[dsh-pet](https://github.com/PC2005-cloud/dsh-pet)** —— 那只蓝毛小女仆「大肥鱼」、她的透明桌面
  helper，以及 `/dsh-pet-*` 内部路由都来自这个项目。捕鱼玩法整个建立在它之上：本插件只做
  「找到她 + 撒网判定」，鱼是它的。感谢作者做出这么可爱的桌宠，并把接口留得足够好用。
- 捕鱼玩法的灵感也来自 dsh-pet 的桌面助手形态——独立透明窗口 + 像素级存在感，才让"甩出去撞上
  什么"这种玩法成立。

## License

MIT
