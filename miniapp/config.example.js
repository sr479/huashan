// 仅供开发者工具联调。真机联调需改为手机可访问的服务地址。
// 正式版必须填写已备案、配置为合法域名且证书有效的 HTTPS 域名。
module.exports = {
  apiBaseUrl: 'http://127.0.0.1:3000',
  allowLocalDevelopment: true,
  // 仅用于受邀体验成员的限时云端测试。正式版不使用此例外。
  allowTemporaryTrial: false,
  temporaryTrialExpiresAt: '', // 启用时必须填写含时区的 ISO 时间，且接口必须为 HTTPS。
};
