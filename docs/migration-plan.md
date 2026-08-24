# Echo 迁移计划（CET 耦合处置清单）

> Phase 0 Repository Audit 产出 · 2026-08-24；Phase 2 执行后更新处置结果（✅ 标记已完成项）
> 用途：Phase 1"去 CET 化"的施工图。本文件只记录，不执行——所有改动在后续 Phase 按 commit 粒度实施。

## 处置分类定义

- **抽象**：保留行为，把 CET 概念替换为通用概念（category/item）
- **复用**：原样保留，零修改或极小修改
- **删除**：CET 专属且通用场景无价值
- **新增**：Echo 需要但上游没有的能力

---

## A. 后端（server.py）

| 耦合点 | 位置 | 处置 |
|---|---|---|
| `APP_EXAMS = ("cet6","cet4")` | server.py:19 | ✅ **删除**（Phase 1 摘除；Phase 2 随重写消失） |
| 入口路由正则 `/(?:cet6\|cet4)…` | server.py:86 | ✅ **删除**（Phase 2：`/` 唯一入口，`?track=<id>` 路由） |
| exam URL 前缀剥离 | server.py:269-276 | ✅ **删除** |
| 默认路径模板 transcripts/{exam}/ 等 | server.py:406-409 | ✅ **抽象** → `library/` 路径规则（scan_library） |
| 上传/保存拼 transcripts/{exam}/ | server.py:477,559,701,706,711 | ✅ **删除**（随 admin 整体移除；添加内容=放文件进 library/） |
| `TRACK_ID_PATTERN` 强制 YYYY-M-N | server.py:20 | ✅ **删除** → Item id = 文件 basename |
| `normalize_exam` 兜底 cet6 | server.py:736-737 | ✅ **删除** |
| admin 全套 API + JOBS + run 子进程（约 400 行） | server.py | ✅ **整体移除**（用户决策：彻底移除 admin；do_POST 恒 404。jobs 思想 Phase 4 AI 任务如需再重建） |
| Range 媒体服务 handle_media/parse_range | server.py:281-329 | ✅ **复用**（核心资产，实测 206 正常） |
| 路径遍历防护 | server.py | ✅ **复用**（SimpleHTTPRequestHandler translate_path + is_file 校验） |
| 启动横幅/端口扫描逻辑 | server.py:820-841 | ✅ **复用**（横幅已去 admin/data-tools 行；Docker 场景显式 PORT） |

## B. 数据层

| 项 | 现状 | 处置 |
|---|---|---|
| tracks.json | 37 条全 cet6 | ✅ **不再被加载**，留仓库作历史档案（用户决策：不删除）。通用内容由 `/api/library` 实时扫描取代（原计划 catalog.json 文件，已改为实时扫描——admin 移除后维护索引文件无收益） |
| `.md` 文稿 | CET 题目结构 | **保留不动**（历史资产）；播放器不再依赖它作为输入 |
| `.transcript.json` / `.timings.json` | whisper 对齐产物 | ✅ **结构复用**：播放器内部契约 lines[]。SRT 解析器输出对齐到该结构 |
| data_tools/ 整目录 | whisper 管线 | **冻结**：不删，Echo 主线不再使用；ASR 能力 Phase 4 以新实现替代 |
| ID 规则 YYYY-M-N | scan.py:19,89 | ✅ **删除** → Item id = 文件 basename |

## C. 前端 — index.html / styles.css

| 耦合点 | 位置 | 处置 |
|---|---|---|
| 标题"CET听力播放器" | index.html:9 | **替换**（Echo） |
| `#examTabs` 考试切换 tab | index.html:57 + styles.css:141-165 | **抽象** → Source/Collection 导航（Phase 2 Library UI 接管） |
| 默认文案"2025 年 12 月 第 1 套" | index.html:283 | **替换** |
| cet-icon.svg | ui/cet-icon.svg | **替换**为 Echo 图标 |
| 三栏布局/可折叠侧栏/resizer/switch 控件样式 | styles.css 各处 | **复用** |

## D. 前端 — app.js（重点）

| 耦合点 | 位置 | 处置 |
|---|---|---|
| DEFAULT_EXAM="cet6"、EXAM_LABELS | app.js:6-10 | **删除** |
| 路由正则 `/^\/(cet4\|cet6)/` | app.js:272-281 | **抽象** → 通用路由 |
| localStorage key `cet6-` 前缀（含核心 browser-state） | app.js:1-5,1059-1064,1117,1139 | **迁移**：改 `echo-` 前缀，加一次性 key 迁移逻辑保住续听数据 |
| `splitTranscriptLine` Q\d+/W:/M: 对话假设 | app.js:1195 | **降级**为可选启发式（speaker 字段可选） |
| `parseTrackId` 年月套号假设 | app.js:235 | **删除** |
| 播放引擎全套（二分查找/rAF 循环/seekToLine/进度条/快捷键） | 见 development-guide §2 表 | **复用**（不动） |
| 盲听开关 transcriptVisible / 翻译开关 translationVisible | app.js:823-833 | **复用**（盲听已是 Phase 3 目标的一半！） |
| 断点续听 browser-state | app.js:424-503 | **复用** |
| 缺失：上一句/下一句按钮 | — | **新增**（Phase 3，或提前到 1.4） |
| 缺失：点击句子文字跳转（现仅行内按钮） | renderTranscript 区域 | **新增**（小改动，高价值） |
| 缺失：自定义倍速（硬编码三档） | app.js:887-895 | **新增**（Phase 3） |
| 缺失：A-B 循环 | — | **新增**（Phase 3） |
| 行内按钮 opacity:0 hover-only → 触屏不可见 | styles.css:819-835 | **修复**（Phase 1，阻塞移动端精听） |

## E. Admin 页面（admin.html/admin.js/admin.css）

整页是 CET 数据准备工具台（exam 下拉×5、年月套表单、whisper 任务触发）。

✅ **已执行（Phase 2，用户决策：彻底移除）**：三个文件已删除，
server.py 全部 `*admin*` 路由/处理已移除。添加音频 = 把 MP3+SRT 放进 `library/`（filesystem-first）。
job 日志轮询 UI 模式与 status 汇总卡片思路记录在案，Phase 4 AI 任务如需后台作业可参考重建。

## F. 新增能力清单（上游没有、Echo 必需）

1. ✅ **SRT 解析器** → 输出 lines[] 契约结构（Phase 1，附单元测试 12 条）
2. ✅ **Library Scanner**（Source→Collection→Item，basename 配对）→ `scan_library()` + `GET /api/library`（Phase 2，附 unittest 11 条）
3. ✅ ~~catalog.json 生成与 serve~~ → 被 `/api/library` 实时扫描取代（Phase 2 决策）
4. ~~Upload MP3/SRT 流程~~ → 用户决策移除：filesystem-first，直接放文件进 `library/`
5. Dockerfile + compose（延后到部署阶段，用户决策）
6. ✅ **Dictation 逐句行内听写 + normalize 比较**（Phase 3：ui/dictation.js 纯函数 + 16 单测；词级 diff 批改）
7. Translation/ASR 旁路 + OpenAI-compatible provider（Phase 4）
8. ✅ **三层树浏览 + 搜索**（Phase 2）：分组折叠（localStorage 持久化）+ title/source/collection 子串过滤
9. ✅ **精听控制套件**（Phase 3）：上一句/下一句（`[` `]`）、A-B 循环（rAF enforce + 与句循环互斥）、倍速下拉 0.5–2 + 自定义（持久化）

## G. refactor/listening 分支处置

**不合并不 cherry-pick。** 理由见 architecture.md §5。
仅借鉴两个思想：FRONTEND_MODE 双模式切换（未来若做新 UI）；API 层类型化组织。
该分支留在 upstream，不做本地跟踪。

---

## 执行顺序建议（Phase 1 施工序）

```text
1. SRT 解析器 + 测试（纯新增，零风险）
2. 行内按钮触屏可见性修复（一行级 CSS 改动，解除移动端阻塞）
3. 数据层：catalog.json + SRT item 跑通播放（先并存，不拆旧）
4. 路由/UI 去 CET 化 + localStorage key 迁移
5. 清理后端 exam 常量与 ID 正则
6. tag v0.1-generic-core
```

每步独立 commit、可独立回退；任何一步失败不影响已完成的步骤。
