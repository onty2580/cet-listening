# Echo 开发指南

> Phase 0 Repository Audit 产出 · 2026-08-24
> 面向对象：本项目的维护者（一个人）与 AI 协作者。

## 1. 快速开始

### 环境要求

- Python 3.10+（server.py 纯标准库，**零第三方依赖**）
- 无 Node/构建工具需求（前端是原生 HTML/CSS/JS，直接编辑即改）

### 启动

```bash
cd echo/
python3 server.py          # 默认 http://localhost:5173，入口 /（通用根路径）
PORT=8000 python3 server.py  # 自定义端口
```

打开 `http://localhost:5173/` 即播放器。Phase 1 起根路径直接服务播放器，
`/cet6/<id>` 旧深链仍保留（向后兼容）。

注意：端口被占用时会自动向后扫描最多 50 个端口——脚本化使用时务必显式设 `PORT`。

### 测试音频

仓库不含音频文件（`.gitignore` 忽略 `*.mp3`）。本地验证用 ffmpeg 生成占位音频：

```bash
# 通用样例（catalog 指向 library/Samples/）
mkdir -p library/Samples/Dreams
ffmpeg -y -f lavfi -i "sine=frequency=220:duration=62" \
  -codec:a libmp3lame -b:a 64k library/Samples/Dreams/dreams.mp3

# CET 旧声源（tracks.json 指向）
mkdir -p audio/cet6
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=60" \
  -codec:a libmp3lame -b:a 64k audio/cet6/2017-12-1.mp3
```

真实 CET 音频上游通过百度网盘分发，手动放入 `audio/cet6/<id>.mp3`。
通用精听音频为 `MP3 + SRT`，放入 `library/<专辑>/` 并登记到 `catalog.json`。

### 冒烟验证命令

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/                 # 200（根=播放器）
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/catalog.json     # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/tracks.json      # 200（CET 旧索引仍在）
curl -sI http://localhost:5173/audio/cet6/2017-12-1.mp3 | grep Accept-Ranges    # bytes
curl -s -D - -o /dev/null -H "Range: bytes=0-99" \
  http://localhost:5173/audio/cet6/2017-12-1.mp3 | head -1                      # HTTP/1.0 206
```

## 2. 代码结构导览

```text
echo/
├── server.py              # 全部后端：路由 + Range 媒体服务 + admin API + data_tools 调度
├── index.html             # 播放器页骨架；已加载 srt.js + app.js
├── admin.html             # 数据管理页骨架（仍 CET 专属，Phase 2 改造）
├── ui/
│   ├── app.js             # ★ 核心：播放器全部逻辑（约 1800 行原生 JS，已去 CET 域）
│   ├── srt.js             # ★ 通用 SRT 解析器 parseSrt()（零依赖，可被 node:test 单测）
│   ├── styles.css         # 全部样式（三栏布局 + 移动端断点 860px/520px）
│   ├── admin.js           # admin 页逻辑（561 行）
│   ├── admin.css
│   └── echo-icon.svg      # Echo 图标（Phase 1 替换了 cet-icon.svg）
├── catalog.json           # ★ 通用内容索引：{id,title,audio,transcript}，audio 指 MP3、transcript 指 .srt
├── tracks.json            # CET 旧索引（37 条 cet6；scan.py 生成，与 catalog.json 并存）
├── library/               # 通用精听内容：library/<专辑>/<id>.mp3 + <id>.srt（样例 Samples/Dreams）
├── transcripts/cet6/      # CET 旧字幕三件套 .md/.transcript.json/.timings.json ×37
├── audio/cet6/            # CET 旧音频（不入库）
├── tests/                 # node:test 单元测试（srt.test.mjs 等）
├── data_tools/            # whisper 对齐管线（scan/timings/normalize；仅 CET 格式，已冻结）
└── docs/                  # 本文档套件
```

### app.js 内部地图（关键函数）

| 功能 | 函数 | 位置 |
|---|---|---|
| 全局状态 / DOM 缓存 | `state` / `els` | 14 / 36 |
| localStorage 旧键迁移（cet6-* → echo-*） | `migrateLegacyStorageKeys` | 模块顶部 |
| 路由解析（保留 /cet4 /cet6 旧深链） | `getRouteFromLocation` | 235 附近 |
| SRT 加载分支（catalog 项） | `loadTrack` 内 `parseSrt` → `buildLinesFromSrtSegments` | 718-754 |
| 内嵌时间轴检测（SRT 端点自带 start/end 则跳过估算） | `applyTimings` 内 `hasEmbeddedTimings` 守卫 | 1249 |
| SRT 段 → 内部 lines[] 契约映射 | `buildLinesFromSrtSegments` | — |
| 时间轴应用 / 自动估算 | `applyTimings` / `buildAutoTimings` | 1249 / 1324 |
| 字幕渲染 | `renderTranscript` | 1463 |
| 当前句二分查找 | `findActiveLineIndex` | 1636 |
| 单句循环（rAF 监控） | `toggleLineLoop`/`startLineLoopMonitor` 等 | 1657,1740 |
| 断点续听持久化 | browser-state 系列 | 424-503 |
| 通用曲目切换 / 排序 | `switchTrack` / `compareTracks`（日期在前、通用按题名） | — |


## 3. Git 工作流

```bash
git remote add origin git@github.com:<你的用户名>/cet-listening.git  # 用户 fork 后补
# upstream 已配置：https://github.com/3056810551/cet-listening.git
```

分支模型：`main`（跟随上游基线）· `develop`（日常集成）· `feature/* fix/* refactor/*`
阶段 tag：`v0-original` → `v0.1-generic-core` → `v0.2-library` → `v0.3-listening` → `v0.4-ai`

Commit 规范（Conventional Commits，一 commit 一类问题）：

```text
feat(library): add filesystem library scanner
fix(srt): handle multiline subtitle blocks
refactor(core): remove CET-specific domain coupling
```

禁止 `feat: rewrite everything` 式大杂烩提交。

## 4. 开发任务执行流程（强制）

```text
Inspect → Understand → Plan → Implement → Test → Review → Commit
```

- 禁止未读代码就修改；禁止按文件名猜结构
- 不确定设计时列 A/B/C 方案，选最简单且足够好者
- 每任务完成按 Changed/Why/Files/Tests/Result/Risks/Next 格式汇报

## 5. 测试策略

现状：上游**零测试**。Echo 从 Phase 1 起建立测试，目前落地的是 SRT 解析器单测：

```bash
node --test            # 从仓库根运行，自动发现 tests/*.test.mjs
```

前后端全零新增运行时依赖；测试用 Node 内置的 `node:test`（仅开发期需要 Node，
产品本身零 Node）。

已建立 / 待建立（优先级从高到低）：

1. SRT 解析器（multiline/CRLF/HTML 标签/malformed/重叠/乱序）— ✅ 单测 12 条
2. 听写 normalize 比较 — 单元测试
3. Library 扫描配对逻辑 — 单元测试
4. 音频 Range 服务 — 集成测试（curl 断言 206/Content-Range，已在冒烟命令覆盖）
5. 句子同步/循环 — 浏览器实测（headless Chrome 截图 + 计算布局断言）

原则：不为测试引入重依赖；Python 侧将来用标准库 `unittest`。

## 6. 已知技术债清单（记录在案，勿顺手修）

| 债 | 位置 | 处置阶段 |
|---|---|---|
| admin 无密码认证（仅 IP 判断 + ALLOW_REMOTE_ADMIN） | server.py:120 | Phase 4（公网暴露前必须清偿） |
| `/api/admin/run` 子进程执行面 | server.py:153 | 同上 |
| JOBS 字典无清理（慢泄漏） | server.py:24 | Phase 2 admin 改造时 |
| 无 Cache-Control/ETag 头 | server.py 全局 | Phase 2+ 优化 |
| HTTP/1.0 协议版本（keep-alive 依赖头 hack） | server.py:822 附近 | 观察即可，无实际影响 |
| catalog.json 与 tracks.json 双索引并存，需手工同步 | 库根 | Phase 2 归一为单一 Library 扫描 |
| SRT 无内嵌时间轴时退化为 buildAutoTimings 估算（非精确） | app.js applyTimings | 固有取舍；精确需 whisper 或人工 SRT |
| 移动端面板先后顺序（当前音频卡片居中、字幕偏下） | styles.css 860 断点 | Phase 2/3 移动端细化 |
| admin 仍是 CET 专属数据页（非通用） | admin.html | Phase 2 |
| 无暗色主题（color-scheme 仅 light） | styles.css:2 | 低优先级 backlog |
