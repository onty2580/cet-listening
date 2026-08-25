# Echo 开发指南

> Phase 0 Repository Audit 产出 · 2026-08-24；Phase 2（v0.2-library）更新；Phase 4（v0.3.1-redesign）更新结构与债表
> 面向对象：本项目的维护者（一个人）与 AI 协作者。

## 1. 快速开始

### 环境要求

- Python 3.10+（server.py 纯标准库，**零第三方依赖**）
- 无 Node/构建工具需求（前端是原生 HTML/CSS/JS，直接编辑即改）

### 启动

```bash
cd echo/
python3 server.py          # 默认 http://localhost:5173，入口 /（唯一应用入口）
PORT=8000 python3 server.py  # 自定义端口
```

注意：端口被占用时会自动向后扫描最多 50 个端口——脚本化使用时务必显式设 `PORT`。

### 添加内容（filesystem-first）

把 `MP3 + 同名 .srt` 放进 `library/`，刷新页面即可，无索引文件、无管理页：

```text
library/
├── Podcasts/BBC/2026-01-01-the-future-of-ai.mp3 + .srt   # Source/Collection/Item
├── Samples/direct.mp3 + .srt                             # 直接挂 Source（无 Collection）
└── loose.mp3 + .srt                                      # 库根（归入 "Library" Source）
```

- **Item** = 同目录、同 basename 的音频 + `.srt`；缺任一不构成 item。
- **Source** = 相对 `library/` 第 1 段目录；**Collection** = 第 2 段。
- **标题** = 同目录 `<同名>.txt` 或 `title.txt` 首行；否则人性化 basename
  （去日期/编号前缀、`-`/`_` 转空格、首字母大写）。
- 服务端每次收到 `/api/library` 请求都实时重扫，无需重启。

### 测试音频

仓库不含音频文件（`.gitignore` 忽略 `*.mp3`）。本地验证用 ffmpeg 生成占位音频：

```bash
mkdir -p library/Samples/Dreams
ffmpeg -y -f lavfi -i "sine=frequency=220:duration=62" \
  -codec:a libmp3lame -b:a 64k library/Samples/Dreams/dreams.mp3
# dreams.srt 已在仓库；再放 dreams.txt（首行作标题）可选
```

### 部署（N100 自托管，2026-08-25 起运行）

```bash
# 首次（N100 上，Debian 13 + Docker）
git clone -b develop https://github.com/onty2580/cet-listening.git ~/echo
cd ~/echo && docker compose up -d    # 端口仅绑 Tailscale IP 100.96.175.68:5173

# 更新代码（compose 挂载仓库目录，无镜像构建）
cd ~/echo && git pull && docker compose restart

# 同步音频（N100 未装 rsync，用 scp）
scp -r library/. n100:echo/library/
```

- `restart: unless-stopped` 保证 7×24；Echo 无认证，端口刻意不绑 0.0.0.0（局域网不可达，仅 Tailscale 网内可达）
- 健康检查：`curl http://100.96.175.68:5173/`（200）、Range 请求（206）

### 冒烟验证命令

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/                 # 200（根=播放器）
curl -s http://localhost:5173/api/library | python3 -m json.tool | head -20     # 三层 JSON
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/api/admin/status # 404（admin 已移除）
curl -sI http://localhost:5173/library/Samples/Dreams/dreams.mp3 | grep Accept-Ranges  # bytes
curl -s -D - -o /dev/null -H "Range: bytes=0-99" \
  http://localhost:5173/library/Samples/Dreams/dreams.mp3 | head -1             # HTTP/1.0 206
```

## 2. 代码结构导览

```text
echo/
├── server.py              # 全部后端：路由 + scan_library() + Range 媒体服务（~300 行）
├── index.html             # 应用骨架：顶栏（品牌/标题/内容库钮）+ 字幕画布 + 底部播放条 + 内容库抽屉
├── ui/
│   ├── app.js             # ★ 核心：播放器 + 库树/搜索/听写/抽屉交互（原生 JS，已去 CET 域）
│   ├── srt.js             # ★ 通用 SRT 解析器 parseSrt()（零依赖，可被 node:test 单测）
│   ├── dictation.js       # ★ 听写纯函数 normalizeAnswer/diffWords/gradeAttempt（零依赖）
│   ├── styles.css         # 全部样式：设计令牌（亮/暗双主题）+ 骨架 + 树/搜索/字幕/听写 + 断点 860px/520px
│   └── echo-icon.svg      # Echo 图标
├── library/               # ★ 唯一内容源：MP3 + 同名 .srt（+ 可选 .txt 标题覆盖）
├── tests/
│   ├── srt.test.mjs       # SRT 解析器单测（node:test，12 条）
│   ├── dictation.test.mjs # 听写 normalize/diff 单测（node:test，16 条）
│   └── test_scan.py       # scan_library 单测（unittest，11 条）
├── tracks.json            # 历史 CET 索引，保留作档案，不再被加载
├── transcripts/cet6/      # 历史 CET 档案，不再被加载
├── audio/cet6/            # 历史 CET 音频（不入库）
├── data_tools/            # whisper 对齐管线（仅 CET 格式，已冻结；维护历史档案时仍可用）
└── docs/                  # 本文档套件 + design/（UI 革新设计稿）
```

### server.py 内部地图（Phase 2 后）

| 功能 | 函数 |
|---|---|
| 路由分发（/、/api/library、媒体后缀） | `do_GET` / `do_HEAD` / `is_root_request` / `is_media_request` |
| 库扫描（纯函数，root 可注入供单测） | `scan_library(root=None)` |
| 标题覆盖 + 人性化 | `item_title` / `humanize_title` |
| Range 解析（含后缀/越界/416） | `parse_range` / `handle_media` |
| JSON 输出（no-store） | `send_json` |

### app.js 内部地图（关键函数）

| 功能 | 函数 |
|---|---|
| 全局状态 / DOM 缓存 | `state` / `els` |
| localStorage 旧键迁移（cet6-* → echo-*） | `migrateLegacyStorageKeys` |
| 库加载：fetch /api/library → 树 + 展平 | `init` → `flattenLibrary` / `normalizeLibraryItem` |
| 路由解析（仅 `?track=<id>`） | `getRouteFromLocation` |
| 三层树渲染（折叠 + 搜索） | `renderTrackList` → `buildSourceNode` / `buildCollectionNode` / `buildTrackButton` |
| 折叠状态持久化 | `collapsedGroups`（localStorage `echo-collapsed-groups`，默认全展开） |
| 搜索过滤 | `state.librarySearchText`（title/source/collection 子串，命中展平） |
| SRT 加载分支 | `loadTrack` 内 `parseSrt` → `buildLinesFromSrtSegments` |
| 时间轴应用 / 自动估算 | `applyTimings` / `buildAutoTimings` |
| 当前句二分查找 | `findActiveLineIndex` |
| 单句循环（rAF 监控） | `toggleLineLoop` / `startLineLoopMonitor` / `enforceLineLoop` |
| A-B 循环（同一 rAF 监控） | `setAbLoopPoint` / `enforceAbLoop` / `hasAbLoop` / `clearAbLoop` |
| 上一句/下一句 | `stepLine(direction)`（`[` `]` 快捷键） |
| 倍速（下拉+自定义，持久化） | `setPlaybackRate` / `restorePlaybackRate`（`echo-playback-rate`） |
| 听写模式 | `setDictationActive` / `openDictationLine` / `submitDictation`；纯函数在 ui/dictation.js |
| 断点续听持久化 | browser-state 系列 |
| 排序 | `getOrderedSources` / `getOrderedCatalog` / `compareTracks`（title localeCompare） |
| 内容库抽屉 | `bindLibraryDrawer` / `setLibraryDrawerOpen`（#libraryToggle / backdrop / Escape 关闭，打开聚焦搜索框） |
| 主题三态切换（自动/亮/暗） | `getThemeMode` / `applyThemeMode` / `cycleThemeMode` / `bindThemeToggle`（`echo-theme-mode`；index.html 头部内联脚本防首帧闪烁） |

## 3. Git 工作流

```bash
# origin = https://github.com/onty2580/cet-listening.git（用户 fork）
# upstream = https://github.com/3056810551/cet-listening.git
```

分支模型：`main`（跟随上游基线）· `develop`（日常集成）· `feature/* fix/* refactor/*`
阶段 tag：`v0-original` → `v0.1-generic-core` → `v0.2-library` → `v0.3-listening` → `v0.4-ai`

Commit 规范（Conventional Commits，一 commit 一类问题）；禁止大杂烩提交。

## 4. 开发任务执行流程（强制）

```text
Inspect → Understand → Plan → Implement → Test → Review → Commit
```

- 禁止未读代码就修改；禁止按文件名猜结构
- 不确定设计时列 A/B/C 方案，选最简单且足够好者
- 每任务完成按 Changed/Why/Files/Tests/Result/Risks/Next 格式汇报

## 5. 测试策略

```bash
python3 -m unittest tests.test_scan -v              # 库扫描单测（11 条）
node --test tests/srt.test.mjs                      # SRT 解析单测（12 条）
node --test tests/dictation.test.mjs                # 听写 normalize/diff 单测（16 条）
```

（注意 `node --test tests/` 会把 Python 文件当 JS 加载而报错，指定具体文件运行。）

前后端全零新增运行时依赖；测试用 Node 内置 `node:test` 与 Python 标准库 `unittest`。

已建立（Phase 3 后）：

1. SRT 解析器（multiline/CRLF/HTML 标签/malformed/重叠/乱序）— ✅ 12 条
2. Library 扫描配对/分层/标题 — ✅ 11 条（unittest，临时目录装配）
3. 听写 normalize/diff/grading（撇号保留、NFKC、词级 LCS diff）— ✅ 16 条
4. 音频 Range 服务 — curl 断言 206/Content-Range（冒烟命令覆盖）
5. 前端全链路 — headless Chrome + e2e_driver.html（同源 iframe 驱动：树/折叠/搜索/SRT/
   步进/A-B 状态机/倍速下拉含自定义/听写全链路/抽屉开合/主题三态切换，34 项断言）

## 6. 已知技术债清单（记录在案，勿顺手修）

| 债 | 位置 | 处置阶段 |
|---|---|---|
| 无 Cache-Control/ETag 头（静态文件） | server.py | Phase 2+ 优化（/api/library 已 no-store） |
| HTTP/1.0 协议版本（keep-alive 依赖头 hack） | server.py | 观察即可，无实际影响 |
| SRT 无内嵌时间轴时退化为 buildAutoTimings 估算（非精确） | app.js applyTimings | 固有取舍；精确需 whisper 或人工 SRT |
| 普通模式点击句子文字仍不跳转（仅行内按钮；听写模式已支持点击句子） | app.js renderTranscript | Phase 4 评估（一行 click 委托） |
| `/api/library` 全量返回，库达数百条后扫描/传输成本上升 | server.py | 观察即可；必要时加缓存/分页 |
| loadTrack 仍保留 transcript.json/.md 回退分支（library 条目不会走到） | app.js loadTrack | Phase 4 评估清理 |
| 听写进度（dictationCorrect）仅会话级，刷新丢失（开关状态本身持久化） | app.js state.dictationCorrect | 观察即可；持久化需权衡"重测"价值 |

已清偿（Phase 2）：admin 无认证 / `/api/admin/run` 子进程面 / JOBS 泄漏（随 admin 整体移除）；catalog.json 与 tracks.json 双索引（归一为 /api/library 实时扫描）。
已清偿（Phase 3）：上一句/下一句缺失；自定义倍速缺失；A-B 循环缺失；听写模式缺失；520px 控制行布局。
已清偿（Phase 4 v0.3.1-redesign）：无暗色主题（令牌化 + prefers-color-scheme 双主题）；移动端面板先后顺序（字幕优先 IA，侧栏不复存在）。悬浮播放器拖拽/固定、侧栏拖宽/折叠功能随 IA 重构移除（用户决策），相关 localStorage 键（echo-player-pinned/echo-player-position/echo-*-sidebar-*）成为无害残留。
