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
- **dsh-pet**（可选）：用来定位/关闭大肥鱼；没有它时捕捉玩法会退化成"撞配置位置"
- Windows（窗口探测、托盘、PrintWindow 都是 Windows API；其它平台未适配）

## 已知限制

- 大肥鱼的位置靠**像素扫描**判断（PowerShell `PrintWindow` + 蓝色连通块），不消耗 token，但一次约 0.3–1.5 秒；只在**按下拖动**和**甩飞瞬间**扫描
- 动画素材为 1x 分辨率（278×306），显示按 0.75 基准缩放，放大到 150% 会略软
- 甩飞形象/网住动画的左右两版是镜像素材，不是重新绘制

## License

MIT
