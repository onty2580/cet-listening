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
python3 server.py          # 默认 http://localhost:5173，入口 /cet6/
PORT=8000 python3 server.py  # 自定义端口
```

注意：端口被占用时会自动向后扫描最多 50 个端口——脚本化使用时务必显式设 `PORT`。

### 测试音频

仓库不含音频文件（`.gitignore` 忽略 `*.mp3`）。本地验证用 ffmpeg 生成占位音频：

```bash
mkdir -p audio/cet6
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=60" \
  -codec:a libmp3lame -b:a 64k audio/cet6/2017-12-1.mp3
```

真实 CET 音频上游通过百度网盘分发，手动放入 `audio/cet6/<id>.mp3`。

### 冒烟验证命令

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/cet6/            # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/tracks.json      # 200
curl -sI http://localhost:5173/audio/cet6/2017-12-1.mp3 | grep Accept-Ranges    # bytes
curl -s -D - -o /dev/null -H "Range: bytes=0-99" \
  http://localhost:5173/audio/cet6/2017-12-1.mp3 | head -1                      # HTTP/1.0 206
```

## 2. 代码结构导览

```text
echo/
├── server.py              # 全部后端：路由 + Range 媒体服务 + admin API + data_tools 调度
├── index.html             # 播放器页骨架（314 行）
├── admin.html             # 数据管理页骨架（419 行）
├── ui/
│   ├── app.js             # ★ 核心：播放器全部逻辑（1912 行原生 JS）
│   ├── styles.css         # 全部样式（三栏布局 + 移动端断点 860px/520px）
│   ├── admin.js           # admin 页逻辑（561 行）
│   ├── admin.css
│   └── cet-icon.svg       # CET 图标（Phase 1 替换）
├── tracks.json            # 内容索引（37 条 cet6；scan.py 生成）
├── transcripts/cet6/      # .md + .transcript.json + .timings.json 三件套 ×37
├── audio/cet6/            # 音频（不入库）
├── data_tools/            # whisper 对齐管线（scan/timings/normalize；需 faster-whisper）
└── docs/                  # 本文档套件
```

### app.js 内部地图（关键函数行号）

| 功能 | 函数 | 位置 |
|---|---|---|
| 全局状态 / DOM 缓存 | `state` / `els` | 14 / 36 |
| 路由解析（CET 耦合） | `parseTrackId` / exam 正则 | 235 / 272 |
| 字幕加载（三级回退） | transcript→md+timings→估算 | 718-754 |
| Markdown 解析（CET 格式假设） | `parseMarkdown`/`splitSentences`/`splitTranscriptLine` | 1143-1232 |
| 时间轴应用 / 自动估算 | `applyTimings` / `buildAutoTimings` | 1249 / 1324 |
| 字幕渲染 | `renderTranscript` | 1463 |
| 当前句二分查找 | `findActiveLineIndex` | 1636 |
| 单句循环（rAF 监控） | `toggleLineLoop`/`startLineLoopMonitor` 等 | 1657,1740 |
| 断点续听持久化 | browser-state 系列 | 424-503 |

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

现状：上游**零测试**。Echo 从 Phase 1 起建立测试，优先级：

1. SRT 解析器（multiline/CRLF/HTML 标签/malformed/重叠）— 单元测试，最高优先
2. 听写 normalize 比较 — 单元测试
3. Library 扫描配对逻辑 — 单元测试
4. 音频 Range 服务 — 集成测试（curl 断言 206/Content-Range）
5. 句子同步/循环 — E2E（Playwright 或手动清单）

测试框架选择原则：Python 侧用标准库 `unittest` 即可起步，不为测试引入重依赖。

## 6. 已知技术债清单（记录在案，勿顺手修）

| 债 | 位置 | 处置阶段 |
|---|---|---|
| admin 无密码认证（仅 IP 判断 + ALLOW_REMOTE_ADMIN） | server.py:120 | Phase 4（公网暴露前必须清偿） |
| `/api/admin/run` 子进程执行面 | server.py:153 | 同上 |
| JOBS 字典无清理（慢泄漏） | server.py:24 | Phase 2 admin 改造时 |
| 无 Cache-Control/ETag 头 | server.py 全局 | Phase 2+ 优化 |
| HTTP/1.0 协议版本（keep-alive 依赖头 hack） | server.py:822 附近 | 观察即可，无实际影响 |
| 行内播放按钮 hover-only，触屏不可见 | styles.css:819 | **Phase 1**（阻塞移动端精听） |
| 无暗色主题（color-scheme 仅 light） | styles.css:2 | 低优先级 backlog |
