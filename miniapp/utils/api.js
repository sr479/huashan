const config = require('../config');
const { resolveBase, imageUrl } = require('./domain');

function baseUrl() {
  let environment = 'release';
  try {
    environment = wx.getAccountInfoSync().miniProgram.envVersion;
  } catch (_) {}
  return resolveBase(config, environment);
}

function request(path, method = 'GET', data) {
  return new Promise((resolve, reject) => {
    let base;
    try {
      base = baseUrl();
    } catch (error) {
      reject(error);
      return;
    }
    wx.request({
      url: base + path,
      method,
      data,
      timeout: 15000,
      header: { 'content-type': 'application/json' },
      success(response) {
        const body = response.data;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          reject(new Error('服务返回异常，请稍后再试'));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(body.error || '操作失败，请稍后再试');
          error.status = response.statusCode;
          reject(error);
          return;
        }
        resolve(body);
      },
      fail() {
        reject(
          new Error(
            method === 'POST'
              ? '连接中断，暂未确认操作结果。请勿连续提交，可联系门店核实。'
              : '暂时无法连接门店，请检查网络后重试',
          ),
        );
      },
    });
  });
}

async function catalog(start, end) {
  const data = await request(
    `/api/catalog?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
  );
  const base = baseUrl();
  data.garments = data.garments.map((garment) => ({
    ...garment,
    images: garment.images.map((path) => imageUrl(base, path)).filter(Boolean),
  }));
  return data;
}

module.exports = {
  catalog,
  calendar: (id, month) =>
    request(`/api/garments/${encodeURIComponent(id)}/calendar?month=${encodeURIComponent(month)}`),
  book: (data) => request('/api/bookings', 'POST', data),
  lookup: (data) => request('/api/bookings/lookup', 'POST', data),
};
