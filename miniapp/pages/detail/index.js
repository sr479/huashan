const api = require('../../utils/api');
const view = require('../../utils/view');
const contact = require('../../utils/contact');

Page({
  data: {
    id: '',
    start: '',
    end: '',
    today: '',
    maxStart: '',
    maxEnd: '',
    month: '',
    monthTitle: '',
    cells: [],
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    garment: null,
    settings: {},
    loading: true,
    error: '',
    calendarLoading: true,
    calendarError: '',
    days: 1,
    rentalText: '',
  },
  onLoad(query) {
    const today = view.todayInChina();
    const dates = view.datesFromQuery(query, today);
    this.setData({
      id: query.id || '',
      today,
      ...dates,
      maxStart: view.addDays(today, 365),
      maxEnd: view.addDays(dates.start, 89),
      month: dates.start.slice(0, 7),
    });
  },
  onShow() {
    this.load();
    this.loadCalendar();
  },
  async onPullDownRefresh() {
    try {
      await Promise.all([this.load(), this.loadCalendar()]);
    } finally {
      wx.stopPullDownRefresh();
    }
  },
  async load() {
    const version = (this._loadVersion = (this._loadVersion || 0) + 1);
    this.setData({ loading: true, error: '' });
    try {
      const data = await api.catalog(this.data.start, this.data.end);
      if (version !== this._loadVersion) return;
      const garment = data.garments.find((g) => g.id === this.data.id);
      if (!garment) throw new Error('这套服装暂未展示，请返回首页挑选其他服装');
      const days = view.rentalDays(this.data.start, this.data.end);
      getApp().globalData.settings = data.settings;
      this.setData({
        garment: view.garmentView(garment),
        settings: data.settings,
        today: data.today,
        days,
        rentalText: view.money(garment.dailyPrice * days),
      });
    } catch (error) {
      if (version === this._loadVersion) this.setData({ error: error.message });
    } finally {
      if (version === this._loadVersion) this.setData({ loading: false });
    }
  },
  async loadCalendar() {
    const version = (this._calendarVersion = (this._calendarVersion || 0) + 1);
    const month = this.data.month;
    this.setData({
      calendarLoading: true,
      calendarError: '',
      monthTitle: month.replace('-', ' 年 ') + ' 月',
    });
    try {
      const { days } = await api.calendar(this.data.id, month);
      if (version !== this._calendarVersion) return;
      this._calendarDays = days;
      this.updateCells();
    } catch (error) {
      if (version === this._calendarVersion) this.setData({ calendarError: error.message });
    } finally {
      if (version === this._calendarVersion) this.setData({ calendarLoading: false });
    }
  },
  updateCells() {
    this.setData({
      cells: view.calendarCells(
        this._calendarDays || [],
        this.data.month,
        this.data.start,
        this.data.end,
        this.data.today,
      ),
    });
  },
  changeStart(event) {
    const start = event.detail.value;
    const end =
      this.data.end < start || view.rentalDays(start, this.data.end) > 90 ? start : this.data.end;
    this.changeDates(start, end);
  },
  changeEnd(event) {
    this.changeDates(this.data.start, event.detail.value);
  },
  changeDates(start, end) {
    const error = view.validateRange(start, end, this.data.today);
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }
    const monthChanged = this.data.month !== start.slice(0, 7);
    this.setData({ start, end, maxEnd: view.addDays(start, 89), month: start.slice(0, 7) });
    this.load();
    if (monthChanged) this.loadCalendar();
    else this.updateCells();
  },
  previousMonth() {
    this.changeMonth(-1);
  },
  nextMonth() {
    this.changeMonth(1);
  },
  changeMonth(offset) {
    this.setData({ month: view.shiftMonth(this.data.month, offset) });
    this.loadCalendar();
  },
  chooseDay(event) {
    const date = event.currentTarget.dataset.date;
    this.changeDates(date, date);
  },
  previewPhoto(event) {
    wx.previewImage({ current: event.currentTarget.dataset.url, urls: this.data.garment.images });
  },
  book() {
    if (this.data.loading || this.data.error || !this.data.garment || !this.data.garment.available)
      return;
    wx.navigateTo({
      url: `/pages/booking/index?id=${encodeURIComponent(this.data.id)}&start=${this.data.start}&end=${this.data.end}`,
    });
  },
  callStore() {
    contact.callStore(this.data.settings);
  },
  onShareAppMessage() {
    return {
      title: `${this.data.garment ? this.data.garment.name : '花山节服饰'} · 看价格与档期`,
      path: `/pages/detail/index?id=${encodeURIComponent(this.data.id)}`,
    };
  },
});
