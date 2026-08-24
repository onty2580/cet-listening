# Echo / cet-listening 架构文档

> Phase 0 Repository Audit 产出 · 2026-08-24
> 基线：upstream/main @ 1876536（tag `v0-original`）

---

## 1. 当前架构

上游项目是一个**零框架、零数据库、零构建**的单体本地 Web 应用：

```text
Browser (原生 HTML/CSS/JS，无框架无构建)
   ↓ HTTP (默认 :5173)
server.py — Python 标准库 ThreadingHTTPServer（单文件 841 行，零第三方依赖）
   ↓ 静态文件 + 自定义 Media 处理
Filesystem
├── tracks.json                    # 内容索引（37 条，全部 CET-6）
├── transcripts/cet6/*.md          # 人工整理的原文（含题目结构）
├── transcripts/cet6/*.transcript.json   # v1：sections + lines（文本分段+占位时间）
├── transcripts/cet6/*.timings.json      # v2：whisper 对齐结果（真实 start/end）
└── audio/cet6/*.mp3               # 音频（不入库，用户手动放置）
```

### 路由清单（server.py）

| 路由 | 方法 | 功能 | 位置 |
|---|---|---|---|
| `/` | GET | 故意返回 404（强制走 `/cet6/` 入口） | server.py:44 |
| `/cet6/…`、`/cet4/…` | GET | serve index.html（SPA 入口） | server.py:47,86 |
| 媒体后缀（.mp3 等 6 种） | GET/HEAD | handle_media：**完整 Range 支持** | server.py:50,281 |
| `/admin`、`/admin/` | GET | 数据管理页（仅本机 IP 可访问） | server.py:88 |
| `/api/admin/status` | GET | 目录/工具/tracks 状态汇总 | server.py:137 |
| `/api/admin/run` | POST | 启动 data_tools 子进程任务 | server.py:153 |
| `/api/admin/jobs/<uuid>` | GET | 任务日志轮询 | server.py:141 |
| `/api/admin/save-markdown` | POST | 写 transcript .md 文件 | server.py:165 |
| `/api/admin/upload?kind=audio\|markdown` | POST | 上传音频/文稿 | server.py:177,188 |
| 其余路径 | GET/HEAD | SimpleHTTPRequestHandler 默认静态服务 | server.py:53 |

**没有 rename/delete API；admin 本质是"CET 数据准备工具台"，不是内容管理系统。**

### Audio Serving 细节（server.py:281-329）

已验证可用（curl 实测 206）：
- 解析 `Range: bytes=start-end` / 后缀形式 → `206 Partial Content` + `Content-Range` + `Accept-Ranges: bytes`
- 无 Range 时 `200` 全量返回
- 1MB 分块流式写出；客户端断连（BrokenPipe 等）静默容错
- MIME 用 `mimetypes.guess_type`（mp3 → audio/mpeg）
- **缺失**：没有任何 Cache-Control / ETag 头（后续优化点，不阻塞）

已知限制：
- 监听 `0.0.0.0`，端口默认 5173，被占用时自动向后扫描最多 50 个端口（Docker 场景必须显式固定 `PORT`，否则健康检查会指向错误端口）
- admin 认证仅靠"来源 IP 是否本机"判断 + `ALLOW_REMOTE_ADMIN=1` 环境变量开关，**无密码**；`/api/admin/run` 可启动任意 data_tools 子进程，属于本机 RCE 面，暴露到局域网前必须处理
- `JOBS` 字典只增不清（轻微内存泄漏，长期运行需注意）

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

### 字幕数据加载优先级（app.js:718-754）

```text
1. *.transcript.json（v1 结构，若含真实时间则直接用）
2. 回退：*.md 浏览器端解析（parseMarkdown/splitSentences）+ *.timings.json 合并
3. 都没有：buildAutoTimings (1324) 按词数加权估算时间轴
```

内部统一的行结构：

```json
{ "id": "line-0", "sectionId": "…", "speaker": "M:", "text": "…",
  "type": "dialogue", "words": 26, "start": 12.3, "end": 15.8 }
```

**Echo 改造的关键结论：只要把 SRT 解析成上述 lines[] 结构，整个播放器引擎无需改动。**

### 播放控制能力现状盘点

| 能力 | 状态 | 说明 |
|---|---|---|
| Play / Pause | ✅ | 按钮 + Space 快捷键 |
| Seek | ✅ | 进度条 pointer 拖拽（含 userSeeking 冲突保护）、±5s 按钮、←→ 键 |
| 速度调节 | ⚠️ | 仅硬编码三档 1 / 1.25 / 1.5x，无自定义倍速 |
| 点击句子跳转 | ⚠️ | 只有行内悬浮 play 按钮可跳（seekToLine:1863）；**点击句子文字本身不跳转** |
| 当前句高亮 | ✅ | active 白底卡片 + passed 变灰 |
| 自动滚动 | ✅ | smooth 居中滚动 |
| 单句循环 | ✅ | rAF 精确回跳，还有段落(section)循环 |
| 上一句 / 下一句按钮 | ❌ | 不存在 |
| A-B 循环 | ❌ | 不存在 |
| 盲听（隐藏字幕） | ✅ | transcriptVisible 开关，隐藏后播放不受影响 |
| 翻译显示开关 | ✅ | translationVisible 开关 + localStorage 持久化 |
| 听写模式 | ❌ | 不存在 |

### 断点续听（值得继承的隐性资产）

localStorage key `cet6-browser-state`（app.js:424-503）：每个 track 记录
audioTime + 两个侧栏 scrollTop；160ms debounce 保存、播放态 1s 节流、pagehide/visibilitychange 兜底刷写。刷新/重开恢复体验完善。

## 3. Library 数据流（目标模型，Phase 2 实现）

```text
library/                        # filesystem 就是数据库
├── BBC/6 Minute English/Dreams/
│     ├── dreams.mp3
│     └── dreams.srt            # 第一公民格式
├── Podcast/Luke English Podcast/…
└── Audiobook/Harry Potter/…

服务器启动扫描
   ↓ Source（一级目录）→ Collection（二级目录）→ Item（叶子目录）
basename 配对 audio.mp3 + audio.srt
   ↓
生成 catalog.json（替代 tracks.json）
   ↓
Item = { id, title, audio, transcript }
```

概念模型只需三层：**Source → Collection → Item**。
不引入数据库；SRT 在服务端或浏览器端解析为 §2 的 lines[] 结构喂给现有播放器。

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
| RAM/CPU | 极低（估算 <50MB RSS 空载；无常驻计算） |
| 存储 | 代码 <5MB；数据全在 volume（audio/ + transcripts/ + 未来 library/） |
| 端口 | 必须显式设 `PORT` 环境变量（禁用自动扫描歧义） |
| 路径 | ROOT 相对定位，volume 挂载无障碍 |
| GPU/AI | 无强依赖；AI 全部走外部 API |
| 风险点 | ① admin 无认证（容器内需 ALLOW_REMOTE_ADMIN=1 才能从外部访问，等于对局域网裸奔）② JOBS 泄漏 ③ 无 Cache-Control（移动端重复拉音频略费流量） |

三者都不是 Phase 0 阻塞项，记入 roadmap。
