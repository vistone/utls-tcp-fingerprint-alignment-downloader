# 提交规范

每次提交代码时，必须遵循以下流程：

## 标准提交流程

```bash
# 1. 修改代码

# 2. 在 package.json 中最小版本号 +1
#    当前版本 v1.0.6 → 下一版本 v1.0.7
#    编辑 package.json 中的 "version" 字段

# 3. 提交代码（commit message 格式：type: description）
git add -A
git commit -m "fix: 修复了xxx问题"

# 4. 打标签（版本号与 package.json 一致）
git tag v1.0.7

# 5. 推送代码和标签
git push origin master --tags

# 6. 创建 Release（必须）
gh release create v1.0.7 \
  --title "v1.0.7" \
  --notes "fix: 修复了xxx问题" \
  --target master
```

## 版本号规则

- **patch**（1.0.0 → 1.0.1）：bug 修复
- **minor**（1.0.0 → 1.1.0）：新功能
- **major**（1.0.0 → 2.0.0）：破坏性变更

## Commit Message 格式

```
type: description

type 取值：
  feat   - 新功能
  fix    - 修复
  docs   - 文档
  refactor - 重构
  chore  - 构建/配置变更
  perf   - 性能优化
  style  - 代码格式

示例：
  feat: 新增存储服务器 KV 数据库
  fix: 修复 gRPC 消息大小限制
  docs: 更新 README 中文版
  refactor: 拆分 DeviceManager 组件
```

## Release Notes 格式

Release title 使用版本号（如 `v1.0.7`），Notes 中列出本次变更的 commit message。
