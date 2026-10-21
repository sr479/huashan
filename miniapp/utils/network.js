function networkFailure(error, method, development) {
  const message = String((error && error.errMsg) || '');
  let code = 'NET_UNKNOWN';
  let hint = '暂时无法连接门店，请检查网络后重试';
  if (/domain list|not.*(?:legal|valid).*domain|合法域名/i.test(message)) {
    code = 'NET_DOMAIN';
    hint = '开发预览的请求被微信域名校验拦截，请核对该预览的调试设置';
  } else if (/ssl|tls|certificate|cert_|证书/i.test(message)) {
    code = 'NET_TLS';
    hint = 'HTTPS 安全连接失败，请联系开发者核对测试服务证书';
  } else if (/timeout|timed out|超时/i.test(message)) {
    code = 'NET_TIMEOUT';
    hint = '连接门店超时，请检查网络后重试';
  } else if (/offline|network.*(?:unreachable|unavailable)|not connected|无网络|断网/i.test(message)) {
    code = 'NET_OFFLINE';
    hint = '当前网络不可用，请检查微信联网权限和网络连接';
  } else if (/connect|dns|resolve.*host|name_not_resolved|enotfound/i.test(message)) {
    code = 'NET_CONNECT';
    hint = '无法连接测试服务，请联系开发者检查网络和服务地址';
  }

  // 不透传平台原始错误，避免 URL、查询参数或其他内容进入页面和日志。
  // 写请求中断后结果可能已落库，任何环境下都不能提示直接重试预约。
  const text =
    method === 'POST'
      ? '连接中断，暂未确认操作结果。请勿连续提交，可联系门店核实。'
      : development
        ? hint
        : '暂时无法连接门店，请检查网络后重试';
  const failure = new Error(text + (development ? `（${code}）` : ''));
  failure.code = code;
  return failure;
}

module.exports = { networkFailure };
