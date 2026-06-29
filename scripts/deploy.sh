#!/bin/bash
# Fi-Pool-Manager 部署脚本（Ubuntu 服务器）
# 使用：bash scripts/deploy.sh

set -euo pipefail

echo "=== Fi-Pool-Manager 部署开始 ==="

# 1. 检查 Node.js
if ! command -v node &> /dev/null; then
  echo "❌ 未找到 Node.js，请先安装 Node.js >= 18"
  exit 1
fi

echo "✓ Node.js $(node --version)"
echo "✓ npm $(npm --version)"

# 2. 安装依赖
echo "→ 安装依赖..."
npm ci --production

# 3. 构建
echo "→ 构建项目..."
npm run build --workspaces

# 4. 创建数据目录
mkdir -p data

# 5. 配置 .env（如果不存在）
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ 已从 .env.example 创建 .env，请编辑配置"
fi

# 6. 初始化数据库
echo "→ 初始化数据库..."
node -e "
const { ensureDatabase } = require('@fi-pool/server/db/migrate');
ensureDatabase();
console.log('✓ 数据库初始化完成');
"

echo ""
echo "=== 部署完成 ==="
echo ""
echo "CLI 使用："
echo "  npx fi-pool list-pools"
echo "  npx fi-pool status"
echo ""
echo "更多命令：npx fi-pool help"
