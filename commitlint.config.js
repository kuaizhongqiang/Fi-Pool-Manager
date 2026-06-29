/**
 * commitlint 配置
 *
 * 基于 Conventional Commits 规范，约束 Git 提交信息格式。
 * 与 semantic-release 配合使用，确保版本号自动推导与 CHANGELOG 生成。
 *
 * @see https://commitlint.js.org/
 * @see https://www.conventionalcommits.org/
 */

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // 新功能
        'fix',      // 修复
        'docs',     // 文档
        'style',    // 代码风格（不影响功能）
        'refactor', // 重构
        'perf',     // 性能优化
        'test',     // 测试
        'chore',    // 构建/工具/依赖
        'ci',       // CI 配置
        'revert',   // 回滚
      ],
    ],
    'scope-empty': [1, 'never'],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
};
