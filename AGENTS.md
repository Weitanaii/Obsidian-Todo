# AGENTS.md - Obsidian Todo Plugin

## 铁律（必须遵守）

### 1. 文件替换必须处理 CRLF
- **永远不要**直接用 `String.Replace()` 处理文件内容
- **必须**先检测文件换行符类型（CRLF 还是 LF）
- **必须**使用对应换行符进行替换
- **参考经验教训：** #59

### 2. PowerShell 写中文文件
- 使用 `[System.IO.File]::WriteAllText($path, $content, $utf8NoBom)` 
- 编码：`New-Object System.Text.UTF8Encoding($false)`
- **参考经验教训：** #1

### 3. 构建与部署
- 每次改动后必须 `npm run build` 验证
- 构建通过后必须复制到部署目录
- 部署后必须提醒用户重启 Obsidian 验证

### 4. 开发前必读
- 阅读 `经验教训文档` 了解历史问题
- 阅读 `AGENTS.md` 了解项目规范

### 5. 不要使用的图标
- `wallet` - 不在 Lucide 图标库中
- `trending-up` - 不在 Lucide 图标库中
- 使用 `piggy-bank` 替代 `wallet`
- 使用 `rocket` 或 `star` 替代 `trending-up`

### 6. 标签管理样式
- `.todo-setting-tag-group` 需要 `padding: 0 0.85rem`
- 与 Obsidian 原生 `.setting-item` 的 padding 保持一致

## 代码规范

### TypeScript
- 使用 `instanceof` 做运行时类型检查，不要用 `as` 强转
- 类型定义放在 `src/models/` 目录

### CSS
- 使用 Obsidian CSS 变量（如 `var(--text-muted)`）
- 保持与 Obsidian 原生样式一致

### 文件结构
- 模型：`src/models/`
- 服务：`src/services/`
- 视图：`src/views/`
- 工具：`src/utils/`
- UI 组件：`src/ui/`

## 经验教训索引

完整经验教训文档位置：
`C:\Users\admin\OneDrive\我的Obsidian知识库\03-项目\Obsidian Todo\3. 开发过程中的经验教训 by codex.md`

关键条目：
- #1: PowerShell 转义地狱
- #59: TodoView.ts 使用 CRLF 换行符
- #63: 部署后必须验证用户反馈