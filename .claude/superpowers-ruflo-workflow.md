# Superpowers + Ruflo 协作开发工作流

## 角色分工

| | Superpowers（方法论） | Ruflo（基础设施） |
|---|---|---|
| **定位** | 怎么思考、怎么规划、怎么执行、怎么验证 | 记忆持久化、后台自动化、多 Agent 编排 |
| **管什么** | "脑" — 思考、判断、决策、验证 | "手" — 记忆、搜索、后台监控、并行调度 |
| **核心能力** | brainstorming, writing-plans, subagent-driven-development, test-driven-development, code-review, verification | memory_store/search, agent_spawn, hooks_worker, aidefence_scan, guidance_recommend |

## 五阶段工作流集成

### 阶段一：Brainstorming

```
brainstorming 之前：
  ruflo memory_search_unified → 检索过往相似决策和模式
  ruflo agentdb_graph_query   → 查看相关代码社区

brainstorming 之后：
  ruflo memory_store → 保存核心设计决策和理由（namespace: patterns）
```

**价值**：今天做的架构决策，下次开新会话时 Ruflo 自动加载，不会重复讨论。

### 阶段二：Writing Plans

```
写计划之前：
  ruflo guidance_recommend       → 发现适用的开发规范
  ruflo agentdb_pattern_search  → 找相似功能的历史实现模式

写计划之后：
  ruflo memory_store → 把计划存为可检索模式（key: plan-{feature-name}）
```

**价值**：计划不再是看完就扔的临时产物，而是下次碰到类似需求时可以检索的参考。

### 阶段三：Subagent-Driven Development

核心原则：**Superpowers 做编码，Ruflo 做辅助。**

| 场景 | 用什么 | 原因 |
|------|--------|------|
| 需要完整 Claude 能力（编辑文件、跑测试、类型检查） | Superpowers subagents | Claude Code 子代理能力完整 |
| 专项分析（安全审查、代码探索、性能分析） | Ruflo Swarm agents | 持久化记忆、跨会话、成本更低 |
| 大规模并行（10+ 独立任务） | Ruflo Hive-Mind | 女王协调，避免混乱 |

实操模式：
```
1. Superpowers subagents 做核心编码工作
2. 同时启动 Ruflo Swarm 做辅助：
   ruflo agent spawn -t reviewer --name "security-check"
   ruflo agent spawn -t tester --name "test-gap-analysis"
3. 后台 Worker（audit, testgaps, optimize）自动运行，持续反馈
```

### 阶段四：Code Review

双线并行审查：

```
Superpowers code-reviewer  → 主审查（代码质量、逻辑、架构）
Ruflo aidefence_scan       → 安全/PII 扫描（自动后台运行）
Ruflo audit Worker         → 安全检查（daemon 自动触发）
Ruflo agentdb_pattern_search → 查找历史上相似的 Bug 模式
```

### 阶段五：Verification

```
Superpowers verification-before-completion 检查清单时：
  ruflo task_status      → 确认所有子任务完成
  ruflo claims_board     → 确认没有遗漏的待认领工作
  ruflo hooks_coverage-gaps → 检查测试覆盖缺口
```

## 核心原则

### 两条铁律

1. **不要用 Ruflo Agent 替代 Superpowers subagent 做核心编码** — Ruflo Agent 能力范围更窄
2. **不要跳过 Ruflo 的 Memory/Hooks** — 它们在你不知道的时候已经帮你做了审计和测试分析

### Ruflo 不能做的

- 不能用 Ruflo subagent 做需要完整上下文理解的代码编写
- 不能用 Ruflo 替代 test-driven-development 的 TDD 流程
- Ruflo 的知识图谱需要先积累才有价值，空图查不出东西

## 日常习惯

### 每天开始开发时

```bash
# 1. 确认 Ruflo 状态
ruflo system_status
ruflo daemon status

# 2. 查看后台 Worker 进展
# audit, map, optimize, testgaps 可能已经发现了问题

# 3. 检索相关历史记忆
ruflo memory_search_unified --query "今天的任务关键词"
```

### 功能开发完成后

```bash
# 存储关键决策到记忆
ruflo memory_store --key "feature-xxx-decision" --value "{...}" --namespace patterns

# 让 Ruflo 做一轮增强审查
ruflo aidefence_scan
ruflo hooks_coverage-gaps
```

### 代码审查前

检查 Ruflo Worker 的审计报告 — `audit` Worker 已经在后台跑了多轮安全检查。

## 记忆存储规范

### 建议的命名空间

| 命名空间 | 用途 |
|----------|------|
| `patterns` | 通用模式（语义搜索可用） |
| `postiz-architecture` | 架构决策 |
| `postiz-bugs` | Bug 修复记录 |
| `postiz-decisions` | 重要决策和理由 |

### Key 命名规范

```
{类型}-{简短描述}
例如：postiz-platform-integration-architecture
     plan-user-authentication
     fix-rate-limit-handling
     decision-use-temporal-for-workflows
```

### 存储内容建议

```json
{
  "title": "简短标题",
  "pattern": "一句话总结模式",
  "context": "触发场景",
  "decision": "做了什么决定",
  "reason": "为什么这么做",
  "alternatives": "考虑过的替代方案",
  "keyFiles": ["相关文件路径"]
}
```

## 命令速查

### Superpowers 常用技能

```
/brainstorming      — 创意构思
/writing-plans      — 编写实施计划
/subagent-driven-development — 多 Agent 并行开发
/test-driven-development — TDD 流程
/code-review        — 代码审查
/verification-before-completion — 完成前验证
/systematic-debugging — 系统化调试
```

### Ruflo 常用命令

```
# 状态
ruflo system_status
ruflo daemon status
ruflo doctor

# 记忆
ruflo memory_store --key "key" --value "{...}" --namespace patterns
ruflo memory_retrieve --key "key" --namespace patterns
ruflo memory_search_unified --query "查询词"
ruflo memory_list --namespace patterns

# 内存清理
ruflo memory_compress  # 释放空间
```

## 类比

> **Superpowers 是驾驶员，Ruflo 是仪表盘 + 辅助驾驶系统。**
>
> 驾驶员（Superpowers）负责方向判断、路线规划、复杂路况处理。
> 仪表盘（Ruflo）负责持续监控、记录轨迹、在危险时报警、在需要时提供历史经验参考。
>
> 两者配合，不是互相替代。
