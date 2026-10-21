const api = require('../../utils/api');
const view = require('../../utils/view');
const contact = require('../../utils/contact');

Page({
  data: {
    today: '',
    start: '',
    end: '',
    maxStart: '',
    maxEnd: '',
    days: 1,
    settings: {},
    categories: ['全部服饰'],
    category: '全部服饰',
    search: '',
    onlyAvailable: false,
    garments: [],
    loading: true,
    error: '',
    hasDemo: false,
  },
  onLoad(query) {
    const today = view.todayInChina();
    const dates = view.datesFromQuery(query, today);
    this.setData({
      today,
      ...dates,
      maxStart: view.addDays(today, 365),
      maxEnd: view.addDays(dates.start, 89),
      days: view.rentalDays(dates.start, dates.end),
    });
  },
  onShow() {
    this.load();
  },
  async onPullDownRefresh() {
    try {
      await this.load();
    } finally {
      wx.stopPullDownRefresh();
    }
  },
  async load() {
    const { start, end, today } = this.data;
    const error = view.validateRange(start, end, today);
    if (error) {
      this.setData({ error, loading: false });
      return;
    }
    const version = (this._loadVersion = (this._loadVersion || 0) + 1);
    this.setData({ loading: true, error: '' });
    try {
      const data = await api.catalog(start, end);
      if (version !== this._loadVersion) return;
      this._garments = data.garments.map(view.garmentView);
      const categories = ['全部服饰', ...new Set(data.garments.map((g) => g.category))];
      getApp().globalData.settings = data.settings;
      this.setData({
        settings: data.settings,
        today: data.today,
        maxStart: view.addDays(data.today, 365),
        categories,
        category: categories.includes(this.data.category) ? this.data.category : '全部服饰',
        hasDemo: data.garments.some((g) => g.demo),
      });
      this.filter();
    } catch (error) {
      if (version === this._loadVersion) this.setData({ error: error.message });
    } finally {
      if (version === this._loadVersion) this.setData({ loading: false });
    }
  },
  filter() {
    const { category, onlyAvailable, search } = this.data;
    const term = search.trim().toLowerCase();
    this.setData({
      garments: (this._garments || []).filter(
        (g) =>
          (category === '全部服饰' || g.category === category) &&
          (!onlyAvailable || g.available) &&
          (!term || (g.name + g.sku + g.size).toLowerCase().includes(term)),
      ),
    });
  },
  changeStart(event) {
    const start = event.detail.value;
    const end =
      this.data.end < start || view.rentalDays(start, this.data.end) > 90 ? start : this.data.end;
    this.setData({
      start,
      end,
      maxEnd: view.addDays(start, 89),
      days: view.rentalDays(start, end),
    });
    this.load();
  },
  changeEnd(event) {
    this.setData({
      end: event.detail.value,
      days: view.rentalDays(this.data.start, event.detail.value),
    });
    this.load();
  },
  changeCategory(event) {
    this.setData({ category: event.currentTarget.dataset.category });
    this.filter();
  },
  changeSearch(event) {
    this.setData({ search: event.detail.value });
    this.filter();
  },
  changeAvailability(event) {
    this.setData({ onlyAvailable: event.detail.value });
    this.filter();
  },
  openGarment(event) {
    if (this.data.loading || this.data.error) return;
    wx.navigateTo({
      url: `/pages/detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}&start=${this.data.start}&end=${this.data.end}`,
      fail(error) {
        console.warn('花山节详情跳转失败', error.errMsg);
        wx.showToast({ title: '暂时无法打开服装详情，请稍后重试', icon: 'none' });
      },
    });
  },
  lookup() {
    wx.navigateTo({
      url: '/pages/lookup/index',
      fail(error) {
        console.warn('花山节页面跳转失败', error.errMsg);
        wx.showToast({ title: '暂时无法打开预约查询，请稍后重试', icon: 'none' });
      },
    });
  },
  callStore() {
    contact.callStore(this.data.settings);
  },
  copyWechat() {
    contact.copyWechat(this.data.settings);
  },
  onShareAppMessage() {
    return {
      title: `${this.data.settings.storeName || '花山节'} · 一起挑选苗族盛装`,
      path: '/pages/home/index',
    };
  },
});
