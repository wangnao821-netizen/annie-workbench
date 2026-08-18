/* Vera 工作台 — electron-builder afterPack 钩子
 * 创建后端运行时必需的目录（electron-builder 不复制空目录，
 * 且 gitignore 的 data/、logs/ 规则会拦掉同名占位文件）。
 * 首次启动建库/写日志依赖这些目录存在。 */
'use strict';

const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  const backend = path.join(context.appOutDir, 'resources', 'backend');
  for (const dir of ['core/data', 'data', 'logs']) {
    fs.mkdirSync(path.join(backend, dir), { recursive: true });
  }
};
