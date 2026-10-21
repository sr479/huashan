function resolveBase(config, environment) {
  const base = String(config.apiBaseUrl || '')
    .trim()
    .replace(/\/+$/, '');
  const match = /^(https?):\/\/([a-zA-Z0-9.-]+)(?::(\d+))?$/.exec(base);
  if (!match) throw new Error('门店服务暂未开放，请稍后再试');
  const [, scheme, host, port] = match;
  if (environment === 'develop' && config.allowLocalDevelopment) return base;
  if (
    scheme !== 'https' ||
    (port && port !== '443') ||
    !host.includes('.') ||
    /^\d+(\.\d+){3}$/.test(host) ||
    /\.(invalid|localhost|local)$/i.test(host)
  )
    throw new Error('门店服务暂未开放，请稍后再试');
  return base;
}

function imageUrl(base, path) {
  // 只显示现有后台上传的服装实拍，不接受任意外站图片。
  return /^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(path || '') ? base + path : '';
}

module.exports = { resolveBase, imageUrl };
