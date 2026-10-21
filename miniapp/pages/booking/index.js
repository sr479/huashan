const api = require('../../utils/api');
const view = require('../../utils/view');

Page({
  data: {
    id: '',
    start: '',
    end: '',
    today: '',
    garment: null,
    settings: {},
    days: 1,
    rentalText: '',
    consent: false,
    loading: true,
    submitting: false,
    error: '',
    createdOrderNo: '',
  },
  onLoad(query) {
    wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    const today = view.todayInChina();
    this.setData({ id: query.id || '', today, ...view.datesFromQuery(query, today) });
  },
  onShow() {
    if (!this.data.createdOrderNo) this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const data = await api.catalog(this.data.start, this.data.end);
      const garment = data.garments.find((g) => g.id === this.data.id);
      if (!garment) throw new Error('这套服装暂未开放预约');
      getApp().globalData.settings = data.settings;
      const days = view.rentalDays(this.data.start, this.data.end);
      this.setData({
        garment: view.garmentView(garment),
        settings: data.settings,
        today: data.today,
        days,
        rentalText: view.money(garment.dailyPrice * days),
      });
      if (!garment.available)
        throw new Error(garment.unavailableReason + '，请返回服装详情调整日期');
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
  changeConsent(event) {
    this.setData({ consent: event.detail.value.includes('agree') });
  },
  async submit(event) {
    if (this.data.submitting || this.data.loading || this.data.createdOrderNo || !this.data.garment)
      return;
    let input;
    try {
      input = view.bookingInput(
        event.detail.value,
        this.data.id,
        this.data.start,
        this.data.end,
        this.data.today,
        this.data.consent,
      );
    } catch (error) {
      this.setData({ error: error.message });
      return;
    }
    this.setData({ submitting: true, error: '' });
    try {
      // 提交前重新读取价格与档期，最终金额仍由服务器计算。
      const fresh = await api.catalog(this.data.start, this.data.end);
      const garment = fresh.garments.find((g) => g.id === this.data.id);
      if (!garment || !garment.available)
        throw new Error(
          (garment && garment.unavailableReason) || '这套服装暂不可预约，请返回详情调整日期',
        );
      const changed =
        garment.dailyPrice !== this.data.garment.dailyPrice ||
        garment.deposit !== this.data.garment.deposit ||
        fresh.settings.cleaningDays !== this.data.settings.cleaningDays ||
        fresh.settings.rentalRules !== this.data.settings.rentalRules ||
        fresh.settings.returnTime !== this.data.settings.returnTime;
      const days = view.rentalDays(this.data.start, this.data.end);
      this.setData({
        garment: view.garmentView(garment),
        settings: fresh.settings,
        today: fresh.today,
        rentalText: view.money(garment.dailyPrice * days),
      });
      if (changed) {
        this.setData({ consent: false });
        throw new Error('门店更新了价格或租赁规则，请核对后重新勾选并提交');
      }
      const validation = view.validateRange(this.data.start, this.data.end, fresh.today);
      if (validation) throw new Error(validation);
      const booking = await api.book(input);
      this._booking = booking;
      this.setData({ createdOrderNo: booking.orderNo });
      this.showReceipt();
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },
  showReceipt() {
    if (!this._booking) return;
    getApp().setReceipt(this._booking, this.data.settings);
    wx.redirectTo({
      url: '/pages/receipt/index',
      fail() {
        wx.showToast({ title: '预约已提交，请保存页面上的预约编号', icon: 'none' });
      },
    });
  },
  copyOrder() {
    wx.setClipboardData({ data: this.data.createdOrderNo });
  },
});
