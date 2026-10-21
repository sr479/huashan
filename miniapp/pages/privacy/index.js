const api = require('../../utils/api');
const view = require('../../utils/view');
const contact = require('../../utils/contact');
Page({
  data: { settings: {}, error: '' },
  onLoad() {
    wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    const settings = getApp().globalData.settings;
    if (settings) this.setData({ settings });
    else this.load();
  },
  async load() {
    try {
      const today = view.todayInChina();
      const data = await api.catalog(today, today);
      this.setData({ settings: data.settings, error: '' });
    } catch (error) {
      this.setData({ error: error.message });
    }
  },
  callStore() {
    contact.callStore(this.data.settings);
  },
});
