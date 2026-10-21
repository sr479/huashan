function callStore(settings) {
  if (!settings || !settings.phone) {
    wx.showToast({ title: '门店暂未填写电话，请稍后再试', icon: 'none' });
    return;
  }
  wx.makePhoneCall({ phoneNumber: settings.phone });
}
function copyWechat(settings) {
  if (!settings || !settings.wechat) {
    wx.showToast({ title: '门店暂未填写微信号', icon: 'none' });
    return;
  }
  wx.setClipboardData({ data: settings.wechat });
}
module.exports = { callStore, copyWechat };
