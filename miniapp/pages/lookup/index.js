const api = require('../../utils/api');

Page({
  data: { busy: false, error: '' },
  onLoad() {
    wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
  },
  async submit(event) {
    if (this.data.busy) return;
    const orderNo = String(event.detail.value.orderNo || '')
      .trim()
      .toUpperCase();
    const phone = String(event.detail.value.phone || '').trim();
    if (!/^HS\d{8}[A-F0-9]{10}$/.test(orderNo) || !/^1[3-9]\d{9}$/.test(phone)) {
      this.setData({ error: '请填写完整的 HS 开头预约编号和预留的 11 位手机号' });
      return;
    }
    this.setData({ busy: true, error: '' });
    try {
      const booking = await api.lookup({ orderNo, phone });
      getApp().setReceipt(booking);
      wx.navigateTo({ url: '/pages/receipt/index' });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ busy: false });
    }
  },
});
