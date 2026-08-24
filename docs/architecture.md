# Echo 架构文档

> Phase 0 Repository Audit 产出 · 2026-08-24；Phase 2（v0.2-library）更新当前架构节
> 基线：upstream/main @ 1876536（tag `v0-original`）

---

## 1. 当前架构（Phase 2 后）

仍是**零框架、零数据库、零构建**的单体本地 Web 应用，但内容源已完全通用化：

```text
Browser (原生 HTML/CSS/JS，无框架无构建)
   ↓ HTTP (默认 :5173)
server.py — Python 标准库 ThreadingHTTPServer（~300 行，零第三方依赖）
   ↓ /api/library（实时扫描）+ 静态文件 + 自定义 Media 处理
Filesystem
├── library/                       # 唯一内容源：MP3 + 同名 .srt（+ 可选 .txt 标题）
├── tracks.json                    # 历史 CET 索引，保留作档案，不再被加载
├── transcripts/cet6/…             # 历史 CET 档案，不再被加载
└── audio/cet6/…                   # 历史 CET 音频，不再被加载
```

### 路由清单（server.py）

| 路由 | 方法 | 功能 |
|---|---|---|
| `/` | GET/HEAD | serve index.html（唯一应用入口） |
| `/api/library` | GET/HEAD | 实时扫描 `library/`，返回三层 JSON（Cache-Control: no-store） |
| 媒体后缀（.mp3 等 6 种） | GET/HEAD | handle_media：完整 Range 支持（206/416） |
| 其余路径 | GET/HEAD | SimpleHTTPRequestHandler 默认静态服务 |
| POST 任意路径 | POST | 404（admin 已整体移除） |

Phase 1 的 `/cet6/<id>`、`/cet4/<id>` 深链入口与全部 `/api/admin/*`
（含 `ALLOW_REMOTE_ADMIN`、JOBS、whisper 触发）已在 Phase 2 移除；
前端 `?track=<id>` 是唯一路由。

### Audio Serving 细节（server.py:281-329）

已验证可用（curl 实测 206）：
- 解析 `Range: bytes=start-end` / 后缀形式 → `206 Partial Content` + `Content-Range` + `Accept-Ranges: bytes`
- 无 Range 时 `200` 全量返回
- 1MB 分块流式写出；客户端断连（BrokenPipe 等）静默容错
- MIME 用 `mimetypes.guess_type`（mp3 → audio/mpeg）
- **缺失**：没有任何 Cache-Control / ETag 头（后续优化点，不阻塞）

已知限制：
- 监听 `0.0.0.0`，端口默认 5173，被占用时自动向后扫描最多 50 个端口（Docker 场景必须显式固定 `PORT`，否则健康检查会指向错误端口）
- admin 移除后，原"admin 无认证 / JOBS 泄漏"两项风险随之消失；`do_POST` 恒 404，无写接口
- 无 Cache-Control / ETag（静态文件）；`/api/library` 已带 no-store

## 2. Player 数据流（核心资产）

播放器是本项目质量最高的部分（ui/app.js，1912 行原生 JS）：

```text
audio.mp3
   ↓ <audio id="audio"> (index.html:238)
currentTime
   ↓ timeupdate 事件 (~250ms) (app.js:780)
updateFromTime (1594)
   ↓ findActiveLineIndex —— 二分查找 line.start ≤ t < line.end (1636)
current segment
   ↓ .line.active / .line.passed class 切换 (1624)
highlight
   ↓ scrollIntoView({behavior:"smooth", block:"center"}) (1632)
auto scroll
```

另有独立于 timeupdate 的 **requestAnimationFrame 循环监控器**
（startLineLoopMonitor:1740 / checkLineLoop:1755 / enforceLineLoop:1763），
用于单句循环的精确回跳——比 timeupdate 的 250ms 粒度更精准。

### 字幕数据加载优先级（loadTrack，Phase 2 后）

```text
1. *.srt（library/ 条目全部走此路径）：ui/srt.js 容错解析（BOM/CRLF/multiline/HTML 标签/重叠/乱序）
2. *.transcript.json（历史 CET 结构，仅当 URL 直指时仍可用）
3. 回退：*.md 浏览器端解析 + *.timings.json 合并
```

内部统一的行结构：

```json
{ "id": "line-0", "sectionId": "…", "speaker": "M:", "text": "…",
  "type": "dialogue", "words": 26, "start": 12.3, "end": 15.8 }
```

**Echo 改造的关键结论：只要把 SRT 解析成上述 lines[] 结构，整个播放器引擎无需改动。**

### 播放控制能力现状盘点（Phase 3 后）

| 能力 | 状态 | 说明 |
|---|---|---|
| Play / Pause | ✅ | 按钮 + Space 快捷键 |
| Seek | ✅ | 进度条 pointer 拖拽（含 userSeeking 冲突保护）、±5s 按钮、←→ 键 |
| 速度调节 | ✅ | 下拉 0.5/0.75/1/1.25/1.5/2 + 自定义（0.25–4）；echo-playback-rate 持久化 |
| 上一句 / 下一句 | ✅ | 播放器条按钮 + `[` `]` 快捷键；activeIndex 步进 |
| 当前句高亮 | ✅ | active 白底卡片 + passed 变灰 |
| 自动滚动 | ✅ | smooth 居中滚动 |
| 单句循环 | ✅ | rAF 精确回跳，还有段落(section)循环 |
| A-B 循环 | ✅ | A/B/清除按钮 + A/B 键；rAF 监控 enforceAbLoop；与句循环互斥 |
| 听写模式 | ✅ | 逐句行内听写：打码→点击播放→输入→normalize 批改→词级 diff；ui/dictation.js 纯函数 |
| 盲听（隐藏字幕） | ✅ | transcriptVisible 开关；听写开启时自动联动关闭 |
| 翻译显示开关 | ✅ | translationVisible 开关 + localStorage 持久化 |
| 点击句子文字跳转 | ⚠️ | 仅听写模式下点击句子会播放+展开输入；普通模式仍只有行内按钮（留 Phase 4 评估） |

### 断点续听（值得继承的隐性资产）

localStorage key `cet6-browser-state`（app.js:424-503）：每个 track 记录
audioTime + 两个侧栏 scrollTop；160ms debounce 保存、播放态 1s 节流、pagehide/visibilitychange 兜底刷写。刷新/重开恢复体验完善。

## 3. Library 数据流（Phase 2 已实现）

```text
library/                        # filesystem 就是数据库，无索引文件
├── Podcasts/BBC/
│     ├── 2026-01-01-the-future-of-ai.mp3
│     └── 2026-01-01-the-future-of-ai.srt   # 第一公民格式
├── Samples/Dreams/
│     ├── dreams.mp3
│     ├── dreams.srt
│     └── dreams.txt             # 可选标题覆盖（首行）
└── …

GET /api/library —— 每次请求实时扫描，无索引漂移
   ↓ basename 配对 audio + .srt（缺任一不成 item）
   ↓ 路径分层：第 1 段 = Source，第 2 段 = Collection（2 段直挂 Source，1 段挂根 "Library"）
   ↓ 标题 = <stem>.txt / title.txt 首行，否则人性化 basename（scan_library()）
三层 JSON {"sources":[{id,title,items,collections:[{id,title,items}]}]}
   ↓
前端 flattenLibrary() 展平为 items[]（附 source/collection 名）供播放器复用；
renderTrackList() 按树渲染 Source → Collection → Item，支持折叠与搜索。
```

概念模型只需三层：**Source → Collection → Item**。
不引入数据库；SRT 在浏览器端由 ui/srt.js 解析为 §2 的 lines[] 结构喂给现有播放器。

与 Phase 0 计划的一处偏差：原计划"扫描写 catalog.json"，实际改为
`/api/library` 每请求实时扫描——admin 已移除、添加内容=放文件，
维护一个会过期的索引文件没有收益。tracks.json / catalog.json 均不再加载
（catalog.json 已删除；tracks.json 留仓库作历史）。

## 4. AI 数据流（Optional Enhancement，不属于核心）

```text
MP3 + SRT ──→ Core Player ──→ 完整可用（无 AI 时）

可选增强（均为旁路，禁止阻塞核心）：
SRT ──→ Translation(LLM) ──→ translation.json（独立文件，禁止覆盖原 SRT）
MP3 ──→ ASR(仅在 SRT 缺失时) ──→ generated.srt ──→ Library
```

Provider 设计为 OpenAI-compatible API（base_url/api_key/model 三项配置），
后台任务用 Python 子进程即可（复用现有 admin jobs 模式），不引入 Celery/Redis。

## 5. refactor/listening 分支评估

上游作者的平行重写尝试（4 个 "init" 提交，基于落后 main 一个提交的点）：

- 新增 `frontend/`：React 19 + TypeScript + Vite + react-router 7 + zod 全套重写
- 删除全部 admin（约 -1600 行）；server.py 砍到 ~120 行
- 引入 `FRONTEND_MODE=legacy|react` 环境变量做双前端静态根切换

**结论：不可合并**。一次性大提交、与 main 分叉、丢弃 admin、违背 Echo"不为现代化引入新前端框架"原则。
**可借鉴**：① FRONTEND_MODE 双模式切换思路（Echo 未来切换 legacy→新 UI 时可参考）；② zod 类型化 API 层的组织方式（仅思想，非引入依赖）。

## 6. N100 / Docker 适配评估

| 维度 | 评估 |
|---|---|
| 依赖 | server.py 纯标准库 → `python:3.x-slim` 镜像即可跑主服务 |
| RAM/CPU | 极低（估算 <50MB RSS 空载；无常驻计算；`/api/library` 每请求扫描，库很大时才有成本） |
| 存储 | 代码 <5MB；数据全在 volume（library/） |
| 端口 | 必须显式设 `PORT` 环境变量（禁用自动扫描歧义） |
| 路径 | ROOT 相对定位，volume 挂载无障碍 |
| GPU/AI | 无强依赖；AI 全部走外部 API |
| 风险点 | 无 Cache-Control（移动端重复拉音频略费流量）；`/api/library` 全量返回，库达数百条后可考虑分页/缓存 |

三者都不是 Phase 0 阻塞项，记入 roadmap。
