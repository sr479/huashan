const api = require('../../utils/api');
const view = require('../../utils/view');
const contact = require('../../utils/contact');

Page({
  data: { booking: null, settings: {}, loading: false, error: '' },
  onLoad() {
    wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    const app = getApp();
    const booking = app.takeReceipt();
    this.setData({
      booking: booking ? view.receiptView(booking) : null,
      settings: app.globalData.settings || {},
    });
    // 不把手机号或回执放入分享地址、日志和持久化存储。
    if (!app.globalData.settings) this.loadSettings();
  },
  async loadSettings() {
    try {
      const today = view.todayInChina();
      const data = await api.catalog(today, today);
      this.setData({ settings: data.settings });
      getApp().globalData.settings = data.settings;
    } catch (_) {
      /* 查询回执不依赖门店资料加载成功。 */
    }
  },
  async onPullDownRefresh() {
    try {
      await this.refresh();
    } finally {
      wx.stopPullDownRefresh();
    }
  },
  async refresh() {
    if (this.data.loading || !this.data.booking) return;
    this.setData({ loading: true, error: '' });
    try {
      const { orderNo, phone } = this.data.booking;
      this.setData({ booking: view.receiptView(await api.lookup({ orderNo, phone })) });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
  copyOrder() {
    wx.setClipboardData({ data: this.data.booking.orderNo });
  },
  callStore() {
    contact.callStore(this.data.settings);
  },
  copyWechat() {
    contact.copyWechat(this.data.settings);
  },
  lookup() {
    wx.redirectTo({ url: '/pages/lookup/index' });
  },
  home() {
    wx.reLaunch({ url: '/pages/home/index' });
  },
});
