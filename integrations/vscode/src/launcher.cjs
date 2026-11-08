'use strict';
const path = require('node:path');
const {spawn} = require('node:child_process');

function launchSpec(filePath, configuration = {}, platform = process.platform, environment = process.env) {
  if (!['win32','linux'].includes(platform)) throw new Error('Inkstone supports Windows and Linux only. / 墨石仅支持Windows和Linux。');
  const fileAPI = platform === 'win32' ? path.win32 : path.posix;
  if (typeof filePath !== 'string' || !fileAPI.isAbsolute(filePath) || filePath.includes('\0')) {
    throw new Error('Inkstone requires an absolute local file path. / 需要本地文件绝对路径。');
  }
  let executable = configuration.executablePath;
  if (executable == null || executable === '') {
    executable = platform === 'win32' ? path.win32.join(environment.LOCALAPPDATA || path.win32.join(environment.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local'), 'Programs', 'Inkstone', 'Inkstone.exe')
        : 'inkstone';
  }
  if (typeof executable !== 'string' || !executable.trim() || executable.includes('\0')) throw new Error('Invalid inkstone.executablePath. / 可执行文件路径无效。');
  if (/^["']|["']$/.test(executable)) throw new Error('Do not wrap the executable path in quotes. / 路径外不要额外添加引号。');
  if (platform === 'win32' && /\.(?:bat|cmd)$/i.test(executable)) throw new Error('Select Inkstone.exe, not a shell script. / 请选择Inkstone.exe。');
  const extra = configuration.args ?? [];
  if (!Array.isArray(extra) || extra.some(value => typeof value !== 'string' || value.includes('\0'))) throw new Error('inkstone.args must be an array of argument strings. / 参数必须为字符串数组。');
  const env = {...environment}; delete env.ELECTRON_RUN_AS_NODE;
  return {executable, args:[...extra, filePath], options:{shell:false, detached:true, windowsHide:false, stdio:'ignore', env}};
}

function launch(filePath, configuration, dependencies = {}) {
  const spec = launchSpec(filePath, configuration, dependencies.platform, dependencies.env);
  const start = dependencies.spawn || spawn;
  return new Promise((resolve, reject) => {
    let child;
    try { child = start(spec.executable, spec.args, spec.options); }
    catch (error) { reject(error); return; }
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve({pid:child.pid, executable:spec.executable}); });
  });
}
module.exports = {launchSpec, launch};
