# Echo Roadmap

> Phase 0 Repository Audit 产出 · 2026-08-24
> 原则：先理解再修改；每阶段可回退（git tag）；最简单且足够好的方案优先。

## Phase 0 — Foundation & Audit ✅

**目标**：Fork + 稳定运行 + 理解代码。

- [x] 克隆上游，配置 upstream remote，打 `v0-original` tag
- [x] 本地运行验证（零依赖直跑；curl 验证页面/静态资源/音频 Range 206）
- [x] Repository Audit（后端 / 前端播放器 / 数据 / 部署 / 测试 / refactor 分支）
- [x] 产出 docs 五件套（architecture / product-vision / roadmap / development-guide / migration-plan）
- [x] Docker 运行评估（结论：python-slim 即可，见 architecture.md §6；实现延后到 Phase 2）

**状态**：已完成。期间未做任何功能性修改。

---

## Phase 1 — Generic Audio Core → `v0.1-generic-core` ✅

**目标**：把 CET Listening 抽象成 Generic Audio Listening Core。

### 1.1 SRT First（新增能力，最高优先级）
- [x] 新写 SRT 解析器 `ui/srt.js`（前端解析、服务端只 serve 文件），
  映射到 app.js 已有 lines[] 结构 `{start, end, text}`
- [x] 稳健：multiline / 空 block / HTML 标签 / 重叠时间轴 / 乱序 / malformed / UTF-8/BOM / CRLF
- [x] 单元测试 `tests/srt.test.mjs`（node:test，12 条）— 项目第一批测试

### 1.2 去 CET 化
- [x] 路由 `/cet6|/cet4` → 根路径通用入口（旧深链保留）；APP_EXAMS/normalize_exam 摘除
- [x] UI 文案、exam tabs、CET 图标（→ echo-icon.svg）替换
- [x] localStorage key 前缀迁移（cet6-* → echo-*，一次性）
- [x] CET 对话假设（Q\d+/W:/M:）从前置依赖降为可选

### 1.3 Generic Audio Item 模型
- [x] `catalog.json`：`{ "id", "title", "audio"(.mp3), "transcript"(.srt) }`
- [x] 样例 `library/Samples/Dreams/`（11 句 SRT）
不做 CEFR/tags/difficulty/vocabulary。

### 1.4 保留现有播放器
- [x] Play/Pause/Seek/速度/句子高亮/自动滚动/单句循环/browser-state 续听——全部原样复用，零改动。

**验收**：MP3+SRT → 播放 → 字幕同步 → 点击跳转 全链路可用；UI 无 CET 概念。
- [x] 浏览器实测：根页 37 CET + 1 通用；SRT 11 句全渲染、句 1 active、内嵌时间轴生效（“SRT 时间轴”）
- [x] curl 冒烟 7 项全 200/206

**顺带修复**（属阻塞移动端核心交互的缺陷）：
- [x] 行内 play/loop 按钮去 hover-only（触屏常显）
- [x] ≤860px shell 横向溢出：重置三面板 grid-column，单列堆叠（桌面不受影响）

**状态**：已完成，tag `v0.1-generic-core`。移动端面板先后顺序留待 Phase 2/3 细化。

---

## Phase 2 — Generic Audio Library → `v0.2-library`

**目标**：管理任意 MP3 + SRT。

- Library Scanner：启动扫描 `library/`，Source→Collection→Item 三层，basename 配对
- catalog.json 替代 tracks.json（保持纯文件，无数据库）
- Library UI 最小版：三层浏览 + 点击进 Player
- Search：仅 title/source/collection 子串匹配
- Upload：MP3/SRT 上传 → validate → basename 配对 → 落目录 → rescn
- Docker 化：Dockerfile + compose + volume（library/audio/transcripts），显式 PORT
- Admin 改造决策点：现有 CET 数据管道 admin 大概率整体移除或缩编为"上传工具"

**验收**：BBC/Podcast/Audiobook/自制录音混放一个目录树，服务器自动识别并全部可播。

---

## Phase 3 — Listening Mode → `v0.3-listening`

**目标**：把播放器升级成真正的精听工具。

- Normal Mode（已有，保底）
- Intensive Mode：上一句/下一句按钮（当前缺失）、单句循环强化
- Blind Listening：已有开关，补模式化体验（隐藏字幕时播放完全不受影响）
- Dictation：逐句听写 → normalize 比较（lowercase/trim/空白/标点）→ 揭示原文；第一版无 AI
- A-B Loop：Set A / Set B / Loop 三键极简版
- 自定义倍速输入（替掉硬编码三档）
- Mobile UI 全面验证：Android Chrome / iOS Safari / iPad / Desktop；大按钮、底部控制、竖横屏、无 hover

**验收**：Normal + Blind + Intensive + Dictation + Sentence Loop 全部可用且无 AI 依赖。

---

## Phase 4 — Optional AI Enhancement → `v0.4-ai`

**目标**：不破坏核心的前提下加 AI。

- Translation：SRT → translation.json（旁路文件，禁止覆盖原 SRT）；Show/Hide 开关起步
- ASR：仅 MP3 有、SRT 缺失时运行；产物 generated.srt 进 Library 流程
- Provider：OpenAI-compatible API 三项配置（base_url/api_key/model）
- 任务模型：Python 后台子进程（复用 jobs 思想），不引入 Redis/Celery
- 安全债清偿（部署公网前必须）：admin 认证方案落地

**验收**：无 AI 完整可用；有 AI 时翻译与 ASR 均为可选旁路。

---

## 明确不做的（Phase 0–4 全程）

CET/IELTS 词库 · CEFR · Anki/FSRS · 用户系统 · 社交 · 推荐 · 游戏化 · 复杂 dashboard · AI chat · 发音评分 · 语义/向量搜索 · PostgreSQL/Redis/微服务 · 新前端框架

## 横切原则（每阶段适用）

1. 每个 commit 只解决一类问题（Conventional Commits）
2. 核心功能必须测试：SRT 解析 / Range 服务 / 句子同步 / 循环 / 扫描配对 / 听写比较
3. 不重写已稳定工作的模块（上游播放器引擎是资产不是负债）
4. 遇多方案时选**最简单且足够好**者，偏好 simple/local/filesystem-first/low-dependency
