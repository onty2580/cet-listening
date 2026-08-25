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

## Phase 2 — Generic Audio Library → `v0.2-library` ✅

**目标**：管理任意 MP3 + SRT。

- [x] Library Scanner：`scan_library()` 每请求实时扫描 `library/`，Source→Collection→Item 三层，basename 配对（缺 srt/mp3 不列入）
- [x] `GET /api/library` 取代 tracks.json + catalog.json 双索引（**与原计划的偏差**：不做 catalog.json 文件——admin 已移除、添加内容=放文件，实时扫描无索引漂移；catalog.json 删除，tracks.json 留仓库作历史）
- [x] 移除 admin：admin.html/ui/admin.js/ui/admin.css 删除，server 全部 `*admin*` 路由移除（do_POST 恒 404）；CET 深链路由移除
- [x] 前端数据层：init() fetch `/api/library`；flattenLibrary() 展平附 source/collection；`?track=<id>` 唯一路由；compareTracks 简化
- [x] Library UI：三层树（分组可折叠，localStorage 持久化）+ 搜索框（title/source/collection 子串过滤）
- [x] 标题：`<stem>.txt` / `title.txt` 首行覆盖，否则人性化 basename（去日期/编号、连字符转空格）
- [ ] Upload：**用户决策移除**——filesystem-first，直接放文件进 `library/`
- [ ] Docker：**延后到部署阶段**（用户决策）

**验收**：BBC/Podcast/Audiobook/自制录音混放一个目录树，服务器自动识别并全部可播。
- [x] 单测 11 条（unittest，扫描/配对/分层/标题）+ SRT 12 条回归全绿
- [x] curl 冒烟：`/` 200、`/api/library` 200、`.srt` 200、Range 206、`/api/admin/*` 404、`/cet6/` 404
- [x] headless Chrome E2E 11 项全 PASS（树渲染/折叠持久化/搜索/SRT 加载/标题覆盖/URL 参数）；500px 视口正常、console 无错误

---

## Phase 3 — Listening Mode → `v0.3-listening` ✅

**目标**：把播放器升级成真正的精听工具。

- [x] 上一句/下一句按钮（播放器条 + `[` `]` 快捷键；基于 activeIndex 步进，边界 clamp）
- [x] 自定义倍速：预设下拉 0.5/0.75/1/1.25/1.5/2 + 自定义输入（0.25–4），`echo-playback-rate` 持久化
- [x] A-B Loop：A/B/清除三键（A/B 快捷键），rAF 监控器内 enforceAbLoop（过 B 回 A）；与句/段循环互斥
- [x] Dictation 逐句行内听写（用户决策形态）：开关持久化 → 全文打码 → 点击句子播放+展开输入 →
  normalize 比较（大小写/标点/撇号/NFKC 容错）→ 全对揭示+自动进下一句；错词词级 diff（漏词红粗、多词删除线）
  - `ui/dictation.js` 纯函数（normalizeAnswer/diffWords/gradeAttempt）+ 16 条单测
- [x] Blind Listening：已有开关保留；听写开启时自动关闭原文开关（同一遮罩，避免打架）
- [x] Mobile UI：430/500/860/1400px 四档截图验证；520px 断点改 5 列控制行（修复新按钮挤爆布局）

**验收**：Normal + Blind + Intensive + Dictation + Sentence Loop 全部可用且无 AI 依赖。
- [x] 单测 28 条（srt 12 + dictation 16）+ unittest 11 条全绿
- [x] headless Chrome E2E 28 项全 PASS（树/搜索/播放/步进/A-B 状态机/倍速含自定义/听写全链路）
- [x] console 无错误；四档视口无横向溢出

---

## Phase 3.5 — UI 全面革新 → `v0.3.1-redesign` ✅

**目标**：把"三栏后台工具"界面重构为字幕优先的极简沉浸布局（用户四项决策：极简沉浸 / 明暗跟随系统 / 彻底重构信息架构 / 低调单一强调色）。设计方案由 Open Design（OD）生成两个方向，用户拍板 **B 冷灰 studio**（存档 `docs/design/`）。

- [x] OD 生成 A 暖纸墨 / B 冷灰 studio 两方向完整原型（含全部交互状态），headless 截图 QA 后用户选定 B
- [x] styles.css 全量令牌化重写：`:root` 亮色 + `prefers-color-scheme: dark` 暗色（清偿「无暗色主题」债）；冷灰阶 + 单一 slate 强调色；字幕排版升级（19px/1.62、840px 阅读列）
- [x] IA 骨架切换：顶栏（品牌/标题/内容库钮）+ 全屏字幕画布（`.workspace[hidden]` 盲听机制保留）+ 底部固定播放条（保留 `.now-playing` 类）+ 内容库抽屉（树 + 搜索 + 段落导航，backdrop/Escape 关闭、打开聚焦搜索框）
- [x] 随 IA 移除：悬浮播放器拖拽/固定、侧栏拖宽、侧栏折叠（用户决策接受）；app.js 净删 ~220 行布局代码，新增抽屉逻辑 ~30 行
- [x] 全部功能 ID 与内容 builder class 契约原位保留 → 既有 E2E 零改动通过
- [x] 补充（用户反馈）：顶栏手动主题三态切换（自动/亮/暗，`echo-theme-mode` 持久化 + 防闪烁内联脚本）；E2E 增至 34 项

**验收**：
- [x] 单测 28 条（srt 12 + dictation 16）+ unittest 11 条全绿
- [x] headless Chrome E2E 30 项全 PASS（28 项既有 + 抽屉开合 2 项新增）
- [x] curl 冒烟 200/200/206；430/520/860/1400 四视口 × 亮/暗双主题截图矩阵 console 零错误、零横向溢出
- [x] 文档四件套同步（README/development-guide/architecture/roadmap）+ 新 UI 预览图

---

## 部署 — N100 自托管 ✅（2026-08-25，AI 功能暂缓）

**目标**：7×24 跑在 N100（Debian 13 + Docker + Tailscale）上，日常可用。

- [x] `docker-compose.yml` 入库：python:3.13-slim + 仓库目录整体挂载（零镜像构建）+ `restart: unless-stopped`
- [x] 端口仅绑 Tailscale IP（100.96.175.68:5173）——Echo 无认证，不向局域网暴露
- [x] N100 clone develop → `~/echo`；音频经 scp 同步（N100 无 rsync）
- [x] 验证：容器 healthy、/ 200、/api/library 条目 available、Range 206、Mac 经 Tailscale 浏览器实测渲染正常零 console 错误
- [ ] AI（Phase 4）暂缓——先攒使用反馈

**更新流程**：N100 上 `cd ~/echo && git pull && docker compose restart`；新音频 `scp` 进 `library/`。

---

## Phase 4 — Optional AI Enhancement → `v0.4-ai`

**目标**：不破坏核心的前提下加 AI。

- Translation：SRT → translation.json（旁路文件，禁止覆盖原 SRT）；Show/Hide 开关起步
- ASR：仅 MP3 有、SRT 缺失时运行；产物 generated.srt 进 Library 流程
- Provider：OpenAI-compatible API 三项配置（base_url/api_key/model）
- 任务模型：Python 后台子进程（jobs 思想需重建——admin 已移除），不引入 Redis/Celery

**验收**：无 AI 完整可用；有 AI 时翻译与 ASR 均为可选旁路。

---

## 明确不做的（Phase 0–4 全程）

CET/IELTS 词库 · CEFR · Anki/FSRS · 用户系统 · 社交 · 推荐 · 游戏化 · 复杂 dashboard · AI chat · 发音评分 · 语义/向量搜索 · PostgreSQL/Redis/微服务 · 新前端框架

## 横切原则（每阶段适用）

1. 每个 commit 只解决一类问题（Conventional Commits）
2. 核心功能必须测试：SRT 解析 / Range 服务 / 句子同步 / 循环 / 扫描配对 / 听写比较
3. 不重写已稳定工作的模块（上游播放器引擎是资产不是负债）
4. 遇多方案时选**最简单且足够好**者，偏好 simple/local/filesystem-first/low-dependency
