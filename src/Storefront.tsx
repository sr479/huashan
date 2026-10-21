import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Clock3,
  Scissors,
  ShoppingBag,
} from 'lucide-react';
import { api, post, useApi } from './api';
import {
  Artwork,
  Badge,
  Brand,
  DateRange,
  Empty,
  ErrorBox,
  Field,
  Modal,
  Spinner,
  useToast,
} from './components';
import {
  addDays,
  bookingLabels,
  money,
  rentalDays,
  shortDate,
  todayInChina,
} from '../shared/utils';
import type { Booking, CalendarDay, Catalog, Garment, Settings } from '../shared/types';

export default function Storefront() {
  const today = todayInChina(),
    [start, setStart] = useState(today),
    [end, setEnd] = useState(today);
  const catalog = useApi<Catalog>(`/api/catalog?start=${start}&end=${end}`);
  const [category, setCategory] = useState('全部服饰'),
    [search, setSearch] = useState(''),
    [onlyAvailable, setOnlyAvailable] = useState(false);
  const [selected, setSelected] = useState<Garment | null>(null),
    [bookingGarment, setBookingGarment] = useState<Garment | null>(null),
    [lookup, setLookup] = useState(false),
    [receipt, setReceipt] = useState<Booking | null>(null);
  const settings = catalog.data?.settings;
  const categories = ['全部服饰', ...new Set(catalog.data?.garments.map((g) => g.category) || [])];
  const items = useMemo(
    () =>
      catalog.data?.garments.filter(
        (g) =>
          (category === '全部服饰' || g.category === category) &&
          (!onlyAvailable || g.available) &&
          (!search || (g.name + g.sku + g.size).toLowerCase().includes(search.toLowerCase())),
      ) || [],
    [catalog.data, category, onlyAvailable, search],
  );
  useEffect(() => {
    const timer = setInterval(() => catalog.reload(), 60000);
    return () => clearInterval(timer);
  }, [start, end]);
  const changeDates = (a: string, b: string) => {
    setStart(a);
    setEnd(b);
  };
  return (
    <div className="storefront">
      <a className="skip-link" href="#collection">
        跳到服装列表
      </a>
      <header className="store-header">
        <div className="site-container header-inner">
          <a className="brand-link" href="/" aria-label="花山节首页">
            <Brand name={settings?.storeName} />
          </a>
          <nav className="store-nav" aria-label="主导航">
            <a href="#collection" className="nav-active">
              挑选服饰
            </a>
            <a href="#guide">租赁指南</a>
            <a href="#store">门店信息</a>
          </nav>
          <button className="button button-small button-quiet" onClick={() => setLookup(true)}>
            <Search size={16} />
            <span>查询预约</span>
          </button>
        </div>
      </header>
      {settings?.notice && (
        <div className="announcement">
          <span className="announcement-dot" />
          {settings.notice}
        </div>
      )}
      <main>
        <section className="site-container hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span />
              花山节 · 苗族服饰租赁
            </div>
            <h1>
              一身苗族盛装，
              <br />
              一场<span>花山之约。</span>
            </h1>
            <p>
              {settings?.introduction || '穿上苗族盛装，共赴花山节之约。'}
              <br />
              选一套心仪的服饰，把山间的好时光穿在身上。
            </p>
            <a className="button button-primary hero-cta" href="#collection">
              挑选我的盛装
              <ArrowUpRight size={18} />
            </a>
            <div className="hero-promises">
              <span>
                <Check size={14} />
                每套独立管理
              </span>
              <span>
                <Check size={14} />
                档期清晰可查
              </span>
              <span>
                <Check size={14} />
                到店取还
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <Artwork hero />
            <span className="hero-seal">
              山间
              <br />
              有盛装
            </span>
            <span className="hero-image-note">视觉示意 · 实际服装以实拍为准</span>
          </div>
        </section>
        <section id="collection" className="collection-section">
          <div className="site-container">
            <div className="section-title">
              <div>
                <div className="eyebrow">THE COLLECTION</div>
                <h2>挑一套，赴一场相遇</h2>
              </div>
              <p>先选日期，看看那天哪一套正好等着你。</p>
            </div>
            <div className="booking-filter">
              <DateRange
                start={start}
                end={end}
                today={catalog.data?.today || today}
                onChange={changeDates}
              />
              <div className="filter-summary">
                <span>
                  共 <strong>{rentalDays(start, end)}</strong> 天
                </span>
                <small>取还当日均计费 · 归还后预留清洗</small>
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={onlyAvailable}
                  onChange={(e) => setOnlyAvailable(e.target.checked)}
                />
                只看所选日期可租
              </label>
            </div>
            <div className="collection-toolbar">
              <div className="category-tabs" aria-label="服装分类">
                {categories.map((c) => (
                  <button
                    key={c}
                    className={category === c ? 'active' : ''}
                    onClick={() => setCategory(c)}
                    aria-pressed={category === c}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <label className="search-field">
                <Search size={17} />
                <input
                  aria-label="搜索服装"
                  placeholder="搜索服装名称 / 尺码"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            {catalog.data?.garments.some((g) => g.demo) && (
              <p className="demo-note">
                <Sparkles size={14} />
                当前包含示例服装与示例档期，店主可在后台替换为真实库存。
              </p>
            )}
            {catalog.error ? (
              <ErrorBox message={catalog.error} retry={catalog.reload} />
            ) : catalog.loading && !catalog.data ? (
              <Spinner text="正在查询服装与档期" />
            ) : (
              <>
                <div
                  className={`garment-grid ${catalog.loading ? 'is-loading' : ''}`}
                  aria-busy={catalog.loading}
                >
                  {items.map((g) => (
                    <article className="garment-card" key={g.id}>
                      <button
                        className="garment-image-button"
                        onClick={() => setSelected(g)}
                        disabled={catalog.loading}
                        aria-label={`查看${g.name}详情`}
                      >
                        <Artwork garment={g} />
                        <span className="inventory-tag">独立编号 {g.sku} · 仅 1 套</span>
                        <span className="image-action">
                          查看服装
                          <ArrowUpRight size={17} />
                        </span>
                      </button>
                      <div className="garment-content">
                        <div className="garment-category">
                          {g.category}
                          <span>{g.size} 码</span>
                        </div>
                        <button className="garment-title" onClick={() => setSelected(g)}>
                          {g.name}
                        </button>
                        <div className="garment-price-row">
                          <span className="price">
                            ¥{money(g.dailyPrice)}
                            <small>/ 天</small>
                          </span>
                          <Badge
                            value={g.available ? 'available' : 'unavailable'}
                            label={g.available ? '所选日期可租' : '所选日期不可租'}
                          />
                        </div>
                        <p className="garment-return">
                          {g.currentStatus === 'rented'
                            ? g.overdue
                              ? '已逾期未还 · 新档期待店主确认'
                              : `当前已租出 · 预计 ${shortDate(g.expectedReturn || '')}归还`
                            : g.currentStatus === 'cleaning'
                              ? '当前清洗中 · 完成检查后开放取衣'
                              : g.currentStatus === 'maintenance'
                                ? '当前维护中 · 暂停预约'
                                : g.currentStatus === 'reserved'
                                  ? '当前在店 · 今日已有预约'
                                  : '当前在店 · 可预约到店试穿'}
                        </p>
                        <div className="garment-bottom">
                          <span>
                            {g.nextAvailable
                              ? `最早预计 ${shortDate(g.nextAvailable)}可租`
                              : '新档期待店主确认'}
                          </span>
                          <button className="text-button" onClick={() => setSelected(g)}>
                            看档期
                            <ArrowRight size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                {items.length === 0 && (
                  <Empty
                    title="暂时没有符合条件的服装"
                    detail="试试调整日期、分类，或取消“只看可租”。"
                  >
                    <button
                      className="button"
                      onClick={() => {
                        setCategory('全部服饰');
                        setSearch('');
                        setOnlyAvailable(false);
                      }}
                    >
                      查看全部服饰
                    </button>
                  </Empty>
                )}
              </>
            )}
          </div>
        </section>
        <section id="guide" className="site-container rental-guide">
          <div className="section-title">
            <div>
              <div className="eyebrow">A LITTLE GUIDE</div>
              <h2>把相遇，安排得刚刚好</h2>
            </div>
            <p>四步完成租赁，轻松赴约。</p>
          </div>
          <div className="guide-grid">
            {[
              {
                icon: CalendarIcon,
                title: '选衣与选日期',
                text: '查看服装尺寸、价格和档期，找到适合你的那一套。',
              },
              {
                icon: ShoppingBag,
                title: '提交预约，等候确认',
                text: '填写取还日期与联系方式，店主确认后为你保留服装。',
              },
              {
                icon: Scissors,
                title: '到店试穿与取衣',
                text: '按确认时间到店，核对衣服及配饰，完成租金与押金登记。',
              },
              {
                icon: ShieldCheck,
                title: '归还验收与退押金',
                text: '按时归还，验收并结算押金；清洗与整理交给门店。',
              },
            ].map((step, i) => (
              <div className="guide-item" key={step.title}>
                <div className="guide-top">
                  <step.icon size={24} strokeWidth={1.3} />
                  <span>0{i + 1}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </section>
        <section id="store" className="store-section">
          <div className="site-container store-info">
            <div>
              <div className="eyebrow">MEET AT THE STORE</div>
              <h2>
                在花山节，
                <br />
                遇见你的那套盛装。
              </h2>
              <p>
                欢迎预约到店试穿。衣服的细节和合身的感觉，
                <br className="desktop-only" />
                都值得你亲自感受。
              </p>
            </div>
            <div className="store-contact">
              <div>
                <MapPin size={20} />
                <span>
                  <small>门店地址</small>
                  {settings?.address || '门店地址待完善，请预约后与店主确认'}
                </span>
              </div>
              <div>
                <Clock3 size={20} />
                <span>
                  <small>营业时间</small>
                  {settings?.hours || '请预约后与店主确认到店时间'}
                </span>
              </div>
              <div>
                <Phone size={20} />
                <span>
                  <small>联系门店</small>
                  {settings?.phone ? (
                    <a href={`tel:${settings.phone}`}>{settings.phone}</a>
                  ) : (
                    '可在预约备注中留下方便联系的时间'
                  )}
                  {settings?.wechat && <small>微信：{settings.wechat}</small>}
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="store-footer site-container">
        <Brand small name={settings?.storeName} />
        <div>
          <span>
            © {new Date().getFullYear()} {settings?.storeName || '花山节'} · 苗族服饰租赁
          </span>
          {settings?.icp && (
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
              {settings.icp}
            </a>
          )}
        </div>
        <a className="admin-entry" href="/admin">
          门店管理
          <ArrowUpRight size={13} />
        </a>
      </footer>
      {selected && settings && (
        <ProductDetail
          garment={selected}
          start={start}
          end={end}
          today={today}
          settings={settings}
          onDates={changeDates}
          onClose={() => setSelected(null)}
          onBook={(g) => {
            setSelected(null);
            setBookingGarment(g);
          }}
        />
      )}
      {bookingGarment && settings && (
        <BookingForm
          garment={bookingGarment}
          start={start}
          end={end}
          settings={settings}
          onClose={() => setBookingGarment(null)}
          onSuccess={(b) => {
            setBookingGarment(null);
            setReceipt(b);
            catalog.reload();
          }}
        />
      )}
      {lookup && (
        <LookupModal
          onClose={() => setLookup(false)}
          onFound={(b) => {
            setLookup(false);
            setReceipt(b);
          }}
        />
      )}
      {receipt && (
        <Receipt
          booking={receipt}
          settings={settings}
          onClose={() => setReceipt(null)}
          onUpdate={setReceipt}
        />
      )}
    </div>
  );
}
function CalendarIcon({ size = 24, strokeWidth = 1.3 }: { size?: number; strokeWidth?: number }) {
  return <Clock3 size={size} strokeWidth={strokeWidth} />;
}
function ProductDetail({
  garment,
  start,
  end,
  today,
  settings,
  onDates,
  onClose,
  onBook,
}: {
  garment: Garment;
  start: string;
  end: string;
  today: string;
  settings: Settings;
  onDates: (a: string, b: string) => void;
  onClose: () => void;
  onBook: (g: Garment) => void;
}) {
  const [month, setMonth] = useState(start.slice(0, 7)),
    [photo, setPhoto] = useState(0);
  const calendar = useApi<{ days: CalendarDay[] }>(
    `/api/garments/${garment.id}/calendar?month=${month}`,
  );
  const live = useApi<Catalog>(`/api/catalog?start=${start}&end=${end}`);
  const g = live.data?.garments.find((g) => g.id === garment.id) || garment;
  const firstDay = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const shiftMonth = (delta: number) => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + delta);
    setMonth(d.toISOString().slice(0, 7));
  };
  return (
    <Modal title={g.name} onClose={onClose} wide>
      <div className="product-detail">
        <div className="product-gallery">
          {g.images.length ? (
            <img
              className="detail-photo"
              src={g.images[photo] || g.images[0]}
              alt={`${g.name}实拍`}
            />
          ) : (
            <Artwork garment={g} />
          )}
          {g.images.length > 1 && (
            <div className="photo-thumbnails">
              {g.images.map((url, i) => (
                <button
                  key={url}
                  className={photo === i ? 'active' : ''}
                  aria-label={`查看第${i + 1}张实拍`}
                  onClick={() => setPhoto(i)}
                >
                  <img src={url} alt="" />
                </button>
              ))}
            </div>
          )}
          <div className="photo-note">{g.sku} · 每套独立管理，当前库存 1 套</div>
        </div>
        <div className="product-details">
          <div className="detail-category">
            {g.category} · {g.size} 码 <Badge value={g.currentStatus || g.state} />
          </div>
          <p className="detail-description">{g.description}</p>
          <div className="detail-prices">
            <div>
              <small>日租金</small>
              <span className="price">
                ¥{money(g.dailyPrice)}
                <small>/ 天</small>
              </span>
            </div>
            <div>
              <small>押金</small>
              <strong>¥{money(g.deposit)}</strong>
            </div>
          </div>
          <div className="detail-spec">
            <div>
              <span>尺寸参考</span>
              <p>{g.measurements || '请到店试穿确认具体尺寸'}</p>
            </div>
            <div>
              <span>配套清单</span>
              <p>{g.accessories.join('、') || '请向店主确认'}</p>
            </div>
            {g.expectedReturn && (
              <div>
                <span>预计归还</span>
                <p>
                  {shortDate(g.expectedReturn)} {settings.returnTime} 前
                  {g.overdue && <span className="text-danger"> · 已逾期未还</span>}
                </p>
              </div>
            )}
            <div>
              <span>最早预计可租</span>
              <p>{g.nextAvailable ? shortDate(g.nextAvailable) : '等待店主确认'}</p>
            </div>
          </div>
          <div className="detail-date-picker">
            <DateRange start={start} end={end} today={today} onChange={onDates} />
          </div>
          <div className="availability-result" aria-live="polite">
            {live.loading ? (
              '正在核对档期…'
            ) : live.error ? (
              <span className="text-danger">{live.error}</span>
            ) : g.available ? (
              <>
                <Check size={16} />
                {shortDate(start)}—{shortDate(end)}可预约 · {rentalDays(start, end)}天租金 ¥
                {money(g.dailyPrice * rentalDays(start, end))}
              </>
            ) : (
              <span className="text-danger">{g.unavailableReason}，请换一个日期。</span>
            )}
          </div>
          <button
            className="button button-primary button-full"
            disabled={!g.available || live.loading || !!live.error}
            onClick={() => onBook(g)}
          >
            申请预约这套服装
            <ArrowRight size={17} />
          </button>
          <p className="subtle">提交后由店主确认，确认前暂不占用库存。</p>
        </div>
      </div>
      <div className="detail-calendar">
        <div className="calendar-heading">
          <div>
            <h3>近期档期</h3>
            <small>空档是否可预约，还需包含归还后的 {settings.cleaningDays} 天清洗。</small>
          </div>
          <div className="month-controls">
            <button className="icon-button" aria-label="上个月" onClick={() => shiftMonth(-1)}>
              <ChevronLeft size={18} />
            </button>
            <span>{month.replace('-', ' 年 ')} 月</span>
            <button className="icon-button" aria-label="下个月" onClick={() => shiftMonth(1)}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        {calendar.error ? (
          <ErrorBox message={calendar.error} />
        ) : (
          <div className="month-calendar">
            <div className="calendar-week">
              {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="calendar-days">
              {Array.from({ length: firstDay }, (_, i) => (
                <span key={`empty-${i}`} />
              ))}
              {calendar.data?.days.map((day) => (
                <button
                  key={day.date}
                  className={`calendar-day day-${day.status} ${day.date >= start && day.date <= end ? 'day-selected' : ''}`}
                  disabled={!day.canStart}
                  onClick={() => onDates(day.date, day.date)}
                  aria-label={`${shortDate(day.date)}，${day.status === 'available' ? (day.canStart ? '可预约' : '需留清洗时间') : { reserved: '已预约', rented: '出租中', cleaning: '清洗中', maintenance: '维护中' }[day.status]}`}
                >
                  <strong>{Number(day.date.slice(8))}</strong>
                  <small>
                    {day.status === 'available'
                      ? day.date < today
                        ? '已过期'
                        : day.canStart
                          ? '空档'
                          : '留清洗'
                      : {
                          reserved: '已预约',
                          rented: '出租',
                          cleaning: '清洗',
                          maintenance: '维护',
                        }[day.status]}
                  </small>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="rental-rules">
        <h3>租赁须知</h3>
        <p>{settings.rentalRules}</p>
      </div>
    </Modal>
  );
}
export function BookingForm({
  garment,
  start,
  end,
  settings,
  onClose,
  onSuccess,
  admin = false,
}: {
  garment: Garment;
  start: string;
  end: string;
  settings: Settings;
  onClose: () => void;
  onSuccess: (b: Booking) => void;
  admin?: boolean;
}) {
  const [name, setName] = useState(''),
    [phone, setPhone] = useState(''),
    [note, setNote] = useState(''),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await post<Booking>(admin ? '/api/admin/bookings' : '/api/bookings', {
        garmentId: garment.id,
        guestName: name,
        phone,
        startDate: start,
        endDate: end,
        note,
      });
      onSuccess(result);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={admin ? '录入门店预约' : '预约你的花山之约'} onClose={onClose}>
      <div className="booking-summary">
        <div className="booking-mini-art">
          <Artwork garment={garment} />
        </div>
        <div>
          <span className="eyebrow">
            {garment.sku} · {garment.size} 码
          </span>
          <h3>{garment.name}</h3>
          <p>
            {shortDate(start)}取衣 — {shortDate(end)} {settings.returnTime} 前归还
          </p>
          <span>
            租期 {rentalDays(start, end)} 天 · 租金{' '}
            <strong>¥{money(garment.dailyPrice * rentalDays(start, end))}</strong> · 押金 ¥
            {money(garment.deposit)} 另计
          </span>
        </div>
      </div>
      <form onSubmit={submit} className="form-stack">
        <div className="form-grid">
          <Field label="称呼 *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="怎么称呼你"
              maxLength={40}
              required
            />
          </Field>
          <Field label="联系电话 *">
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              placeholder="用于门店确认预约"
              pattern="1[3-9][0-9]{9}"
              maxLength={11}
              required
            />
          </Field>
        </div>
        <Field label="预约备注">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="如：希望下午到店试穿，或其他需要门店留意的事情"
            rows={3}
            maxLength={500}
          />
        </Field>
        <div className="booking-explainer">
          <ShieldCheck size={18} />
          <p>预约申请由店主确认后生效。联系方式仅用于本次租赁与门店联系；租金、押金到店办理。</p>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          我已了解租赁规则，同意门店为本次预约联系我。
        </label>
        {error && <ErrorBox message={error} />}
        <button className="button button-primary button-full" disabled={busy || !consent}>
          {busy ? <Loader /> : '提交预约申请'}
          <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}
function Loader() {
  return <span className="button-loading">正在处理…</span>;
}
function LookupModal({ onClose, onFound }: { onClose: () => void; onFound: (b: Booking) => void }) {
  const [orderNo, setOrderNo] = useState(''),
    [phone, setPhone] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="查询我的预约" onClose={onClose}>
      <p className="form-intro">输入预约回执中的编号与预留手机号，查看店主确认状态。</p>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            onFound(await post<Booking>('/api/bookings/lookup', { orderNo, phone }));
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="预约编号">
          <input
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value.toUpperCase())}
            placeholder="HS 开头的预约编号"
            autoComplete="off"
            maxLength={40}
            required
          />
        </Field>
        <Field label="预留手机号">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="预约时填写的 11 位手机号"
            pattern="1[3-9][0-9]{9}"
            maxLength={11}
            required
          />
        </Field>
        {error && <ErrorBox message={error} />}
        <button className="button button-primary button-full" disabled={busy}>
          {busy ? '查询中…' : '查询预约'}
        </button>
      </form>
    </Modal>
  );
}
function Receipt({
  booking: b,
  settings,
  onClose,
  onUpdate,
}: {
  booking: Booking;
  settings?: Settings;
  onClose: () => void;
  onUpdate: (b: Booking) => void;
}) {
  const toast = useToast(),
    [busy, setBusy] = useState(false),
    [cancelOpen, setCancelOpen] = useState(false);
  return (
    <Modal title="我的预约回执" onClose={onClose}>
      <div className="receipt-heading">
        <div className="receipt-icon">
          <Check size={28} />
        </div>
        <h3>{b.status === 'pending' ? '预约申请已收到' : bookingLabels[b.status]}</h3>
        <p>
          {b.status === 'pending'
            ? '请留意门店联系。店主确认后，才会为你锁定档期。'
            : b.status === 'cancelled'
              ? '本次预约已取消。'
              : '取还安排以门店确认信息为准。'}
        </p>
      </div>
      <div className="receipt-number">
        <span>
          <small>请保存预约编号</small>
          <strong>{b.orderNo}</strong>
        </span>
        <button
          className="icon-button"
          aria-label="复制预约编号"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(b.orderNo);
              toast('预约编号已复制');
            } catch {
              toast('请长按预约编号复制');
            }
          }}
        >
          <Copy size={18} />
        </button>
      </div>
      <dl className="receipt-details">
        <div>
          <dt>服装</dt>
          <dd>
            {b.garmentName} · {b.sku}
          </dd>
        </div>
        <div>
          <dt>预约状态</dt>
          <dd>
            <Badge value={b.status} />
          </dd>
        </div>
        <div>
          <dt>取衣日期</dt>
          <dd>{b.startDate}</dd>
        </div>
        <div>
          <dt>还衣日期</dt>
          <dd>
            {b.endDate} {settings?.returnTime || '18:00'} 前
          </dd>
        </div>
        <div>
          <dt>租金 / 押金</dt>
          <dd>
            ¥{money(b.rentalTotal)} / ¥{money(b.depositRequired)}
          </dd>
        </div>
        <div>
          <dt>预留联系</dt>
          <dd>
            {b.guestName} · {b.phone.slice(0, 3)}****{b.phone.slice(-4)}
          </dd>
        </div>
        {b.note && (
          <div>
            <dt>备注</dt>
            <dd>{b.note}</dd>
          </div>
        )}
        {b.cancellationReason && (
          <div>
            <dt>取消原因</dt>
            <dd>{b.cancellationReason}</dd>
          </div>
        )}
      </dl>
      {settings?.phone && (
        <a className="button button-full" href={`tel:${settings.phone}`}>
          <Phone size={16} />
          联系门店
        </a>
      )}
      {b.status === 'pending' && !cancelOpen && (
        <button className="text-button receipt-cancel" onClick={() => setCancelOpen(true)}>
          取消这次预约申请
        </button>
      )}
      {cancelOpen && (
        <div className="inline-confirm">
          <p>确定取消这次待确认的预约申请？</p>
          <button
            className="button button-small button-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                onUpdate(
                  await post<Booking>('/api/bookings/cancel', {
                    orderNo: b.orderNo,
                    phone: b.phone,
                  }),
                );
                setCancelOpen(false);
                toast('预约申请已取消');
              } catch (error) {
                toast((error as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            确定取消
          </button>
          <button className="button button-small" onClick={() => setCancelOpen(false)}>
            保留预约
          </button>
        </div>
      )}
    </Modal>
  );
}
