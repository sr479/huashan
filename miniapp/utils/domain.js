function resolveBase(config, environment, now = Date.now()) {
  const base = String(config.apiBaseUrl || '')
    .trim()
    .replace(/\/+$/, '');
  const match = /^(https?):\/\/([a-zA-Z0-9.-]+)(?::(\d+))?$/.exec(base);
  if (!match) throw new Error('门店服务暂未开放，请稍后再试');
  const [, scheme, host, port] = match;
  if (environment === 'develop' && config.allowLocalDevelopment) return base;
  if (environment === 'trial' && config.allowTemporaryTrial === true) {
    const expiresAt = String(config.temporaryTrialExpiresAt || '');
    const expires = /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(expiresAt)
      ? Date.parse(expiresAt)
      : NaN;
    if (!Number.isFinite(expires) || now >= expires)
      throw new Error('本次内测入口已到期，请联系门店更新测试版本');
    const ip = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
    const localAddress =
      host === 'localhost' ||
      (ip &&
        (ip.slice(1).some((part) => Number(part) > 255) ||
          [0, 10, 127].includes(Number(ip[1])) ||
          (Number(ip[1]) === 169 && Number(ip[2]) === 254) ||
          (Number(ip[1]) === 172 && Number(ip[2]) >= 16 && Number(ip[2]) <= 31) ||
          (Number(ip[1]) === 192 && Number(ip[2]) === 168)));
    if (
      scheme !== 'https' ||
      !host.includes('.') ||
      localAddress ||
      /\.(invalid|localhost|local)$/i.test(host)
    )
      throw new Error('内测需配置手机可访问且证书有效的 HTTPS 测试服务');
    return base;
  }
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
