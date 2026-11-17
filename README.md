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
| 🐟 网住大肥鱼 | 把和大人**甩出去**，撞到桌面上的蓝毛小女仆「大肥鱼」就有机会把她网走（带撒网动画、邀功/请罪/怪老纪台词、捕获计数） |
| 🏮 牢房欠债 | 右键可设「欠债阈值」（0.01–10,000，两位小数）：国库余额低于它时查国库，和大人会先报完账、再换成光膀子红肚兜的牢房形象高呼「小月！莫愁！」 |
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
- **右键**：菜单（与和大人说话 / 查看国库 / 欠债阈值 / 记忆账本 / 动作分类 / 缩放与甩飞灵敏度 / 系统托盘…）
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
│  ├─ threshold.html    欠债阈值输入
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
| **Windows** | ✅ 已验证 | ✅ PowerShell + PrintWindow（1:1 抓窗口内容） |
| **macOS** | ✅ 逻辑上可用（Electron 通用 API） | ⚠️ 需给 Electron **屏幕录制**权限（窗口位置用 `osascript`，需要**辅助功能**权限），未在真机验证 |
| **Linux (X11)** | ✅ 逻辑上可用 | ⚠️ 需装 `wmctrl`（或 `xdotool`）+ Electron 屏幕捕获；HiDPI 会按 `scaleFactor` 折算，未在真机验证 |
| **Linux (Wayland)** | ⚠️ 透明窗口依赖合成器 | ❌ 窗口枚举基本不可用，捕鱼会因 `no-window-tool` 被门禁关掉 |

窗口探测集中在 `app/winprobe.js`：Windows 走 PowerShell + user32，macOS 走 `osascript`，
Linux 走 `wmctrl -lG` / `xdotool`；抓窗口内容在 Windows 用 PrintWindow、其它平台用 Electron 的
`desktopCapturer`。任一平台探测失败只会让**捕鱼**失效，不影响桌宠本体。

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

检测时机也只有两个：**按下拖动时**预扫一次、**甩飞瞬间**补扫一次（坐标超过 1.5 秒就作废重扫），
平时完全不扫，不占 CPU。

## 已知限制

- 大肥鱼的位置靠**像素扫描**判断（抓窗口内容 + 蓝色连通块），**不调用任何模型接口、不消耗 token**，
  一次约 0.3–1.5 秒（Windows PowerShell 冷启动更慢）；只在**按下拖动**和**甩飞瞬间**扫描
- macOS 的窗口位置依赖 System Events，需要用户在系统设置里授权；Linux Wayland 下窗口枚举不可用
- 动画素材为 1x 分辨率（278×306），显示按 0.75 基准缩放，放大到 150% 会略软
- 甩飞形象/网住动画的左右两版是镜像素材，不是重新绘制

## License

MIT
