App({
  globalData: { settings: null, receipt: null },
  setReceipt(booking, settings) {
    this.globalData.receipt = booking;
    this.globalData.settings = settings || this.globalData.settings;
  },
  takeReceipt() {
    const receipt = this.globalData.receipt;
    this.globalData.receipt = null;
    return receipt;
  },
});
