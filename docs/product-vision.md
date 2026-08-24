# Echo 产品愿景

> Phase 0 Repository Audit 产出 · 2026-08-24

## 一句话定位

**Echo 是一个极简、自托管、移动端友好的个人英语音频精听系统。**

```text
Self-hosted audio intensive listening player
个人自托管音频精听工具
```

## Echo 不是什么

- ❌ CET-4 / CET-6 考试网站（上游的形态，只是我们的起点）
- ❌ IELTS / TOEFL 刷题平台
- ❌ 综合语言学习平台、RSS 阅读器
- ❌ AI 聊天机器人、社交学习平台

上游 cet-listening 已经证明了一件事：**"音频 + 字幕 + 逐句同步 + 循环"这个核心体验是成立的**。
Echo 要做的只是把它从"考试真题播放器"解放成"任意英语音频的精听工具"。

## 核心问题（唯一）

> 用户拥有英语音频和对应字幕时，如何通过一个极简播放器进行高质量逐句精听？

## 核心闭环

```text
MP3 + SRT
    ↓
Import → Library → Player
    ↓
Sentence Synchronization（逐句同步）
    ↓
Intensive Listening（精听：单句循环、上一句/下一句）
    ↓
Blind Listening（盲听：隐藏字幕裸听）
    ↓
Dictation（听写：听→写→核对）
```

AI 不在闭环内。AI 只是可选增强：SRT 翻译、无字幕时的 ASR。
**没有 AI，Echo 必须完整可用。**

## 七条产品原则

1. **Listening first** — 用户在听音频，不是在跟 AI 聊天
2. **Sentence-level interaction** — 句子是最小学习单位；点击/重播/上下句/循环都必须围绕句子
3. **MP3 + SRT first** — 用户提供这两个文件时直接使用，绝不强制走 AI 管线
4. **AI is optional** — 增强项；旁路设计，禁止阻塞核心播放
5. **Filesystem first** — 目录结构就是数据库；SRT + 少量 JSON；SQLite 仅在确有必要时
6. **Self-hosted first** — N100 + Debian + Docker + Tailscale，7×24 低资源运行；无 GPU/云依赖
7. **Mobile friendly** — Android/iPhone/iPad/MacBook 全可用；触摸友好、无 hover 依赖

## 典型用户场景

用户从 BBC 播客 / YouTube / 有声书拿到一段 MP3 和一份 SRT，
丢进 Echo 的 library 目录，打开手机浏览器：

1. 正常播放，字幕逐句高亮跟随（Normal）
2. 遇到没听清的句子，一键单句循环直到听懂（Intensive）
3. 关掉字幕整段盲听验证（Blind）
4. 开启听写模式逐句默写核对（Dictation）

全程低资源、私有的、跑在自己家里的小主机上。

## 成功标准

> **足够小，一个人可以完全理解和维护；足够好，可以每天真正用于英语精听。**

衡量方式：
- 从"拿到 MP3+SRT"到"开始精听"不超过一分钟
- 全部功能在一部手机浏览器上可完成
- 单文件 Python 服务 + 原生前端，代码量维持在小几千行的量级
