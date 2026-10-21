import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  ImagePlus,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Shirt,
  Wallet,
  X,
} from 'lucide-react';
import { api, post, put, useApi, ApiError } from './api';
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
import { BookingForm } from './Storefront';
import {
  addDays,
  bookingLabels,
  money,
  paymentLabels,
  rentalDays,
  shortDate,
  stateLabels,
  todayInChina,
} from '../shared/utils';
import type {
  Audit,
  Booking,
  Dashboard,
  Garment,
  Payment,
  PaymentKind,
  Settings,
} from '../shared/types';

type Page = 'dashboard' | 'orders' | 'inventory' | 'schedule' | 'finance' | 'settings';
interface Finance {
  payments: (Payment & { orderNo: string; guestName: string; garmentName: string })[];
  totals: Dashboard['money'];
}
interface Bundle {
  dashboard: Dashboard;
  garments: Garment[];
  bookings: Booking[];
  settings: Settings;
  finance: Finance;
  audit: Audit[];
}
const nav = [
  { id: 'dashboard', label: '经营概览', icon: LayoutDashboard },
  { id: 'orders', label: '预约与订单', icon: ClipboardList },
  { id: 'inventory', label: '服装管理', icon: Shirt },
  { id: 'schedule', label: '服装排期', icon: CalendarDays },
  { id: 'finance', label: '收款与押金', icon: Wallet },
  { id: 'settings', label: '门店设置', icon: SettingsIcon },
] as const;
const getPage = (): Page => {
  const value = window.location.pathname.split('/')[2];
  return nav.some((n) => n.id === value) ? (value as Page) : 'dashboard';
};
export default function Admin() {
  const [user, setUser] = useState<{ username: string } | null>(null),
    [checking, setChecking] = useState(true),
    [data, setData] = useState<Bundle | null>(null),
    [error, setError] = useState(''),
    [refreshing, setRefreshing] = useState(false),
    [version, setVersion] = useState(0);
  const [page, setPage] = useState<Page>(getPage),
    [mobileOpen, setMobileOpen] = useState(false),
    [orderId, setOrderId] = useState<string | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    [manual, setManual] = useState(false);
  const toast = useToast();
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      const [dashboard, inventory, orders, settings, finance, audits] = await Promise.all([
        api<Dashboard>('/api/admin/dashboard'),
        api<{ garments: Garment[] }>('/api/admin/garments'),
        api<{ bookings: Booking[] }>('/api/admin/bookings'),
        api<Settings>('/api/admin/settings'),
        api<Finance>('/api/admin/finance'),
        api<{ entries: Audit[] }>('/api/admin/audit'),
      ]);
      setData({
        dashboard,
        garments: inventory.garments,
        bookings: orders.bookings,
        settings,
        finance,
        audit: audits.entries,
      });
      setVersion((v) => v + 1);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) setError((error as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    api<{ username: string }>('/api/admin/session')
      .then(setUser)
      .catch(() => {})
      .finally(() => setChecking(false));
    const expired = () => {
      setUser(null);
      setData(null);
      setOrderId(null);
    };
    window.addEventListener('hs-auth-expired', expired);
    const pop = () => setPage(getPage());
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('hs-auth-expired', expired);
      window.removeEventListener('popstate', pop);
    };
  }, []);
  useEffect(() => {
    if (user) void refresh();
  }, [user?.username, refresh]);
  useEffect(() => {
    if (!user || orderId || editing || manual || page === 'settings') return;
    const timer = setInterval(() => void refresh(), 30000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.username, orderId, editing, manual, page, refresh]);
  useEffect(() => {
    document.title = `${nav.find((n) => n.id === page)?.label || '管理后台'} · 花山节`;
  }, [page]);
  function navigate(next: Page) {
    setPage(next);
    setMobileOpen(false);
    window.history.pushState({}, '', next === 'dashboard' ? '/admin' : `/admin/${next}`);
  }
  async function garmentAction(g: Garment, action: string) {
    try {
      await post(`/api/admin/garments/${g.id}/action`, { action });
      toast(
        action === 'clean'
          ? '已完成清洗与检查'
          : action === 'maintain'
            ? '已登记维护'
            : '服装已恢复在店待租',
      );
      await refresh();
    } catch (error) {
      toast((error as Error).message, true);
    }
  }
  if (checking)
    return (
      <div className="auth-screen">
        <Spinner text="正在验证管理账号" />
      </div>
    );
  if (!user) return <Login onSuccess={setUser} />;
  return (
    <div className="admin-app">
      {mobileOpen && (
        <button
          className="sidebar-overlay"
          aria-label="关闭导航菜单"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`admin-sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <a href="/admin" className="brand-link">
          <Brand name={data?.settings.storeName} />
        </a>
        <div className="sidebar-section-label">门店经营管理</div>
        <nav aria-label="管理后台导航">
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? 'active' : ''}
              onClick={() => navigate(n.id)}
              aria-current={page === n.id ? 'page' : undefined}
            >
              <n.icon size={19} strokeWidth={1.7} />
              <span>{n.label}</span>
              {n.id === 'orders' && !!data?.dashboard.counts.pending && (
                <span className="nav-count">{data.dashboard.counts.pending}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="admin-profile">
            <span className="avatar">店</span>
            <span>
              <strong>{user.username}</strong>
              <small>门店管理员</small>
            </span>
            <button
              className="icon-button"
              aria-label="退出登录"
              onClick={async () => {
                try {
                  await post('/api/admin/logout', {});
                  setUser(null);
                  setData(null);
                } catch (error) {
                  toast((error as Error).message, true);
                }
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
          <a href="/" target="_blank" rel="noreferrer">
            查看顾客端
            <ArrowUpRight size={14} />
          </a>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-header">
          <div className="admin-breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航菜单"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>花山节</span>
            <span>/</span>
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="admin-header-right">
            <span className="sync-status">
              <span />
              {refreshing ? '同步中' : '门店数据'}
            </span>
            <span>{(data?.dashboard.today || todayInChina()).replaceAll('-', '.')}</span>
          </div>
        </header>
        <main className="admin-content">
          {error && <ErrorBox message={error} retry={() => void refresh()} />}
          {!data ? (
            <Spinner text="正在加载门店数据" />
          ) : (
            <>
              {data.garments.some((g) => g.demo) && (
                <div className="admin-demo-note">
                  <SparkleText />
                  当前含示例服装及订单。上线前请替换实拍、核对库存，并完善门店信息。
                </div>
              )}
              {page === 'dashboard' && (
                <DashboardView
                  data={data}
                  openOrder={setOrderId}
                  newOrder={() => setManual(true)}
                  navigate={navigate}
                  clean={(g) => void garmentAction(g, 'clean')}
                />
              )}
              {page === 'orders' && (
                <OrdersView
                  bookings={data.bookings}
                  today={data.dashboard.today}
                  openOrder={setOrderId}
                  newOrder={() => setManual(true)}
                />
              )}
              {page === 'inventory' && (
                <InventoryView
                  garments={data.garments}
                  edit={(g) => setEditing(g?.id || 'new')}
                  action={garmentAction}
                />
              )}
              {page === 'schedule' && <ScheduleView version={version} edit={setEditing} />}
              {page === 'finance' && (
                <FinanceView
                  finance={data.finance}
                  bookings={data.bookings}
                  openOrder={setOrderId}
                />
              )}
              {page === 'settings' && (
                <SettingsView settings={data.settings} audit={data.audit} refresh={refresh} />
              )}
            </>
          )}
        </main>
        <footer className="admin-footer">
          花山节 · 一套衣服，一份独立排期<span>租金与押金分别记录</span>
        </footer>
      </div>
      {orderId && data && (
        <OrderDetail
          id={orderId}
          version={version}
          garments={data.garments}
          onClose={() => setOrderId(null)}
          refresh={refresh}
        />
      )}
      {editing && data && (
        <GarmentEditor
          garment={data.garments.find((g) => g.id === editing)}
          onClose={() => setEditing(null)}
          refresh={refresh}
        />
      )}
      {manual && data && (
        <ManualBooking
          garments={data.garments}
          settings={data.settings}
          onClose={() => setManual(false)}
          onSuccess={async (b) => {
            setManual(false);
            await refresh();
            setOrderId(b.id);
            toast('门店预约已录入，请核对档期后确认');
          }}
        />
      )}
    </div>
  );
}
function SparkleText() {
  return <span aria-hidden="true">✦</span>;
}
function Login({ onSuccess }: { onSuccess: (u: { username: string }) => void }) {
  const [username, setUsername] = useState('admin'),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-screen">
      <div className="auth-decoration" aria-hidden="true">
        <span>
          花山有约
          <br />
          衣见倾心
        </span>
      </div>
      <div className="auth-card">
        <a href="/" className="brand-link">
          <Brand />
        </a>
        <div className="auth-title">
          <span className="eyebrow">STORE MANAGEMENT</span>
          <h1>打理每一场花山之约</h1>
          <p>使用店主管理账号登录</p>
        </div>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              onSuccess(await post('/api/admin/login', { username, password }));
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="管理员账号">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              maxLength={60}
            />
          </Field>
          <Field label="登录密码">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="请输入管理密码"
              required
              maxLength={200}
            />
          </Field>
          {error && <ErrorBox message={error} />}
          <button className="button button-primary button-full" disabled={busy}>
            {busy ? '正在登录…' : '登录管理后台'}
            <ArrowRight size={18} />
          </button>
        </form>
        <a className="auth-back" href="/">
          返回顾客端
          <ArrowUpRight size={14} />
        </a>
      </div>
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  icon: Icon,
  warning = false,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Shirt;
  warning?: boolean;
}) {
  return (
    <div className={`stat-card ${warning ? 'stat-warning' : ''}`}>
      <div>
        <span>{label}</span>
        <Icon size={18} strokeWidth={1.5} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function DashboardView({
  data,
  openOrder,
  newOrder,
  navigate,
  clean,
}: {
  data: Bundle;
  openOrder: (id: string) => void;
  newOrder: () => void;
  navigate: (page: Page) => void;
  clean: (g: Garment) => void;
}) {
  const { dashboard: d } = data;
  const attention = d.bookings.filter(
    (b) =>
      b.status === 'pending' ||
      (b.status === 'confirmed' && b.startDate <= d.today) ||
      (b.status === 'rented' && b.endDate <= d.today),
  );
  return (
    <>
      <PageHeading
        eyebrow="YOUR STORE, AT A GLANCE"
        title="今天，也有好好相遇"
        description="把待确认、取还与清洗安排在这里。"
      >
        <button className="button button-primary" onClick={newOrder}>
          <Plus size={17} />
          录入门店预约
        </button>
      </PageHeading>
      <div className="stats-grid">
        <Stat
          label="待确认预约"
          value={d.counts.pending}
          detail="确认后为顾客锁定档期"
          icon={ClipboardList}
        />
        <Stat
          label="今日取衣 / 归还"
          value={`${d.counts.pickupToday} / ${d.counts.returnToday}`}
          detail="取还前核对服装及配饰"
          icon={ArrowDownLeft}
        />
        <Stat
          label="正在出租"
          value={d.counts.rented}
          detail={
            d.counts.overdue ? `${d.counts.overdue} 笔已逾期，请及时联系` : '每套服装去向清晰可查'
          }
          icon={Shirt}
          warning={!!d.counts.overdue}
        />
        <Stat
          label="待清洗与检查"
          value={d.counts.cleaning}
          detail="完成后再恢复在店待租"
          icon={ShieldCheck}
        />
      </div>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              门店待办<span>{attention.length}</span>
            </h2>
            <button className="text-button" onClick={() => navigate('orders')}>
              全部订单
              <ArrowRight size={15} />
            </button>
          </div>
          {attention.length ? (
            attention.slice(0, 8).map((b) => (
              <button className="task-row" key={b.id} onClick={() => openOrder(b.id)}>
                <span className={`task-symbol ${b.overdue ? 'danger' : ''}`}>
                  <CalendarDays size={19} />
                </span>
                <span className="task-text">
                  <strong>
                    {b.garmentName}
                    <Badge value={b.status} />
                  </strong>
                  <small>
                    {b.guestName} · {shortDate(b.startDate)}—{shortDate(b.endDate)}
                    {b.overdue ? ' · 已逾期' : ''}
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))
          ) : (
            <Empty title="今天的待办已安排妥当" detail="新的预约和取还任务会显示在这里。" />
          )}
        </section>
        <div className="dashboard-side">
          <section className="panel">
            <div className="panel-heading">
              <h2>清洗与整理</h2>
              <span className="subtle">{d.cleaning.length} 套</span>
            </div>
            {d.cleaning.length ? (
              d.cleaning.map((g) => (
                <div className="cleaning-row" key={g.id}>
                  <span>
                    <strong>{g.name}</strong>
                    <small>
                      {g.sku} ·{' '}
                      {g.cleaningUntil ? `预计 ${shortDate(g.cleaningUntil)}完成` : '等待检查'}
                    </small>
                  </span>
                  <button className="button button-small" onClick={() => clean(g)}>
                    完成检查
                  </button>
                </div>
              ))
            ) : (
              <Empty title="暂无待清洗服装" />
            )}
          </section>
          <section className="finance-summary-card">
            <span className="eyebrow">资金概览</span>
            <div>
              <span>本月实收收入</span>
              <strong>¥{money(d.money.monthRevenue)}</strong>
            </div>
            <div>
              <span>当前代收押金</span>
              <strong>¥{money(d.money.depositHeld)}</strong>
            </div>
            <small>押金不计入收入；扣款与退租金分别记账。</small>
            <button className="text-button" onClick={() => navigate('finance')}>
              查看收款流水
              <ArrowRight size={15} />
            </button>
          </section>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>服装状态一览</h2>
          <button className="text-button" onClick={() => navigate('schedule')}>
            查看排期
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="mini-inventory">
          {data.garments.map((g) => (
            <div key={g.id}>
              <span className={`fabric-dot fabric-${g.tone}`} />
              <span>
                <strong>{g.name}</strong>
                <small>{g.sku}</small>
              </span>
              <Badge value={g.currentStatus || g.state} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
function OrdersView({
  bookings,
  today,
  openOrder,
  newOrder,
}: {
  bookings: Booking[];
  today: string;
  openOrder: (id: string) => void;
  newOrder: () => void;
}) {
  const [filter, setFilter] = useState('all'),
    [search, setSearch] = useState('');
  const rows = bookings.filter(
    (b) =>
      (filter === 'all' || filter === 'overdue'
        ? filter !== 'overdue' || b.overdue
        : b.status === filter) &&
      (!search ||
        (b.orderNo + b.guestName + b.phone + b.garmentName)
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  return (
    <>
      <PageHeading
        eyebrow="RESERVATIONS & RENTALS"
        title="每一笔预约，都有着落"
        description="确认档期、登记收款，以及跟进衣服的每一次取还。"
      >
        <button className="button button-primary" onClick={newOrder}>
          <Plus size={17} />
          录入门店预约
        </button>
      </PageHeading>
      <section className="panel">
        <div className="table-toolbar">
          <div className="filter-tabs" aria-label="订单状态">
            {[
              ['all', '全部订单'],
              ['pending', '待确认'],
              ['confirmed', '待取衣'],
              ['rented', '出租中'],
              ['returned', '待结算'],
              ['overdue', '逾期'],
              ['completed', '已完成'],
              ['cancelled', '已取消'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={filter === key ? 'active' : ''}
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="编号 / 姓名 / 手机 / 服装"
              aria-label="搜索订单"
            />
          </label>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>服装 / 预约编号</th>
                <th>顾客</th>
                <th>租赁日期</th>
                <th>租金 / 押金</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.garmentName}</strong>
                    <small>
                      {b.orderNo}
                      {b.demo ? ' · 示例' : ''}
                    </small>
                  </td>
                  <td>
                    {b.guestName}
                    <small>{b.phone}</small>
                  </td>
                  <td>
                    {shortDate(b.startDate)}—{shortDate(b.endDate)}
                    <small>
                      {rentalDays(b.startDate, b.endDate)} 天 ·{' '}
                      {b.source === 'online' ? '线上预约' : '门店录入'}
                    </small>
                  </td>
                  <td>
                    ¥{money(b.rentalTotal)}
                    <small>押金余额 ¥{money(b.depositBalance)}</small>
                  </td>
                  <td>
                    <Badge value={b.status} />
                    {b.overdue && <small className="text-danger">已逾期</small>}
                  </td>
                  <td>
                    <button className="text-button" onClick={() => openOrder(b.id)}>
                      管理
                      <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty title="暂无符合条件的订单" detail="新预约会出现在这里，也可以手动录入门店预约。" />
        )}
      </section>
    </>
  );
}
function InventoryView({
  garments,
  edit,
  action,
}: {
  garments: Garment[];
  edit: (g?: Garment) => void;
  action: (g: Garment, a: string) => Promise<void>;
}) {
  const [search, setSearch] = useState(''),
    [busy, setBusy] = useState('');
  const rows = garments.filter((g) => (g.name + g.sku + g.category).includes(search));
  return (
    <>
      <PageHeading
        eyebrow="YOUR WARDROBE"
        title="一套盛装，一份独立档案"
        description="管理实拍、尺寸、租金与押金；修改价格不会影响已生成的订单。"
      >
        <button className="button button-primary" onClick={() => edit()}>
          <Plus size={17} />
          新增服装
        </button>
      </PageHeading>
      <section className="panel">
        <div className="table-toolbar">
          <span className="subtle">共 {garments.length} 套 · 每个独立编号对应 1 套实物</span>
          <label className="search-field">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索名称 / 编号 / 分类"
              aria-label="搜索库存"
            />
          </label>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>服装</th>
                <th>分类 / 尺码</th>
                <th>日租金 / 押金</th>
                <th>当前状态</th>
                <th>展示状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <td>
                    <div className="inventory-name">
                      <div className="inventory-thumb">
                        <Artwork garment={g} />
                      </div>
                      <span>
                        <strong>{g.name}</strong>
                        <small>
                          {g.sku}
                          {g.demo ? ' · 示例' : ''}
                        </small>
                      </span>
                    </div>
                  </td>
                  <td>
                    {g.category}
                    <small>{g.size} 码</small>
                  </td>
                  <td>
                    ¥{money(g.dailyPrice)} / 天<small>押金 ¥{money(g.deposit)}</small>
                  </td>
                  <td>
                    <Badge value={g.state} />
                    {g.expectedReturn && (
                      <small className={g.overdue ? 'text-danger' : ''}>
                        {g.overdue ? '逾期未还' : `预计 ${shortDate(g.expectedReturn)}还`}
                      </small>
                    )}
                  </td>
                  <td>
                    <span className={`listed-label ${g.listed ? '' : 'is-hidden'}`}>
                      <span />
                      {g.listed ? '顾客端可见' : '已下架'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="text-button" onClick={() => edit(g)}>
                        编辑
                      </button>
                      {g.state !== 'rented' && (
                        <button
                          className="text-button"
                          disabled={busy === g.id}
                          onClick={async () => {
                            setBusy(g.id);
                            await action(
                              g,
                              g.state === 'cleaning'
                                ? 'clean'
                                : g.state === 'maintenance'
                                  ? 'release'
                                  : 'maintain',
                            );
                            setBusy('');
                          }}
                        >
                          {g.state === 'cleaning'
                            ? '完成清洗'
                            : g.state === 'maintenance'
                              ? '完成维护'
                              : '登记维护'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty title="还没有服装档案" detail="上传第一套服装的实拍，开始安排它的花山之约。">
            <button className="button" onClick={() => edit()}>
              新增服装
            </button>
          </Empty>
        )}
      </section>
    </>
  );
}
interface ScheduleData {
  dates: string[];
  rows: { garment: Garment; days: { date: string; status: string }[] }[];
}
function ScheduleView({ version, edit }: { version: number; edit: (id: string) => void }) {
  const [start, setStart] = useState(todayInChina()),
    [length, setLength] = useState(7);
  const { data, error, loading, reload } = useApi<ScheduleData>(
    `/api/admin/schedule?start=${start}&days=${length}&v=${version}`,
  );
  return (
    <>
      <PageHeading
        eyebrow="ONE OUTFIT, ONE SCHEDULE"
        title="把每一套的档期排清楚"
        description="展示已确认预约、出租及清洗占用。逾期未还或清洗超时的服装会继续锁定。"
      />
      <section className="panel">
        <div className="table-toolbar">
          <div className="schedule-controls">
            <button
              className="icon-button"
              aria-label="上一段日期"
              onClick={() => setStart(addDays(start, -length))}
            >
              <ChevronLeft size={19} />
            </button>
            <input
              type="date"
              aria-label="排期起始日期"
              value={start}
              onChange={(e) => {
                if (e.target.value) setStart(e.target.value);
              }}
            />
            <button
              className="icon-button"
              aria-label="下一段日期"
              onClick={() => setStart(addDays(start, length))}
            >
              <ChevronRight size={19} />
            </button>
            <button className="button button-small" onClick={() => setStart(todayInChina())}>
              回到今天
            </button>
          </div>
          <div className="filter-tabs">
            <button
              className={length === 7 ? 'active' : ''}
              onClick={() => setLength(7)}
              aria-pressed={length === 7}
            >
              7 天
            </button>
            <button
              className={length === 14 ? 'active' : ''}
              onClick={() => setLength(14)}
              aria-pressed={length === 14}
            >
              14 天
            </button>
          </div>
        </div>
        <div className="schedule-legend">
          {['available', 'reserved', 'rented', 'cleaning', 'maintenance'].map((s) => (
            <Badge key={s} value={s} label={s === 'available' ? '空档' : undefined} />
          ))}
        </div>
        {error ? (
          <ErrorBox message={error} retry={reload} />
        ) : loading ? (
          <Spinner text="正在查询服装排期" />
        ) : (
          <div className="table-scroll">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>服装 / 独立编号</th>
                  {data?.dates.map((date) => (
                    <th key={date} className={date === todayInChina() ? 'is-today' : ''}>
                      <span>{shortDate(date)}</span>
                      <small>
                        周
                        {
                          ['日', '一', '二', '三', '四', '五', '六'][
                            new Date(date + 'T00:00:00Z').getUTCDay()
                          ]
                        }
                      </small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((row) => (
                  <tr key={row.garment.id}>
                    <th>
                      <button className="schedule-garment" onClick={() => edit(row.garment.id)}>
                        <strong>{row.garment.name}</strong>
                        <small>{row.garment.sku}</small>
                      </button>
                    </th>
                    {row.days.map((day) => (
                      <td key={day.date}>
                        <span className={`schedule-block block-${day.status}`}>
                          {day.status === 'available'
                            ? '空档'
                            : stateLabels[day.status] || day.status}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.rows.length && <Empty title="暂无可排期的服装" />}
          </div>
        )}
        <p className="panel-footnote">
          空档表示当天没有占用；新预约仍会核对完整租期与其后的清洗时间。待确认申请暂不占用档期。
        </p>
      </section>
    </>
  );
}
function FinanceView({
  finance,
  bookings,
  openOrder,
}: {
  finance: Finance;
  bookings: Booking[];
  openOrder: (id: string) => void;
}) {
  const [kind, setKind] = useState('all');
  const rows = finance.payments.filter((p) => kind === 'all' || p.kind === kind);
  const unsettled = bookings.filter(
    (b) => b.depositBalance > 0 && ['returned', 'cancelled'].includes(b.status),
  );
  function exportCSV() {
    const cell = (value: unknown) =>
      '"' +
      String(value ?? '')
        .replace(/^(\s*[=+@-]|[\t\r\n])/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const csv =
      '\uFEFF' +
      [
        ['时间', '预约编号', '顾客', '服装', '类型', '金额(元)', '方式', '说明'],
        ...rows.map((p) => [
          new Date(p.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
          p.orderNo,
          p.guestName,
          p.garmentName,
          paymentLabels[p.kind],
          (p.amount / 100).toFixed(2),
          p.method,
          p.note,
        ]),
      ]
        .map((row) => row.map(cell).join(','))
        .join('\r\n');
    const link = document.createElement('a'),
      url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.href = url;
    link.download = `花山节-资金流水-${todayInChina()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <PageHeading
        eyebrow="RENT & DEPOSIT"
        title="每一笔收退，都记得清楚"
        description="这里登记线下收付款，不会实际发起微信、支付宝扣款或退款。"
      >
        <button className="button" onClick={exportCSV}>
          <Download size={17} />
          导出流水
        </button>
      </PageHeading>
      <div className="stats-grid finance-stats">
        <Stat
          label="本月实收收入"
          value={`¥${money(finance.totals.monthRevenue)}`}
          detail="租金 + 押金扣款 − 退租金"
          icon={Wallet}
        />
        <Stat
          label="当前代收押金"
          value={`¥${money(finance.totals.depositHeld)}`}
          detail="押金不计为门店收入"
          icon={ShieldCheck}
        />
        <Stat
          label="待处理押金结算"
          value={unsettled.length}
          detail="已归还或取消，仍有押金余额"
          icon={ArrowDownLeft}
        />
      </div>
      {!!unsettled.length && (
        <section className="panel">
          <div className="panel-heading">
            <h2>待退还或结算押金</h2>
          </div>
          {unsettled.map((b) => (
            <button className="task-row" key={b.id} onClick={() => openOrder(b.id)}>
              <span className="task-text">
                <strong>
                  {b.garmentName} · {b.guestName}
                </strong>
                <small>
                  {b.orderNo} · {bookingLabels[b.status]}
                </small>
              </span>
              <strong className="money-value">¥{money(b.depositBalance)}</strong>
              <ChevronRight size={17} />
            </button>
          ))}
        </section>
      )}
      <section className="panel">
        <div className="table-toolbar">
          <h2>资金流水</h2>
          <select aria-label="筛选流水类型" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">全部类型</option>
            {Object.entries(paymentLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>时间 / 预约编号</th>
                <th>服装 / 顾客</th>
                <th>类型</th>
                <th>金额</th>
                <th>方式 / 说明</th>
                <th>订单</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    {new Date(p.createdAt).toLocaleString('zh-CN', {
                      timeZone: 'Asia/Shanghai',
                      hour12: false,
                    })}
                    <small>{p.orderNo}</small>
                  </td>
                  <td>
                    {p.garmentName}
                    <small>{p.guestName}</small>
                  </td>
                  <td>{paymentLabels[p.kind]}</td>
                  <td className={p.kind.endsWith('refund') ? 'text-danger' : 'money-value'}>
                    {p.kind.endsWith('refund') ? '−' : '+'}¥{money(p.amount)}
                  </td>
                  <td>
                    {p.method}
                    <small>{p.note || '—'}</small>
                  </td>
                  <td>
                    <button className="text-button" onClick={() => openOrder(p.bookingId)}>
                      查看
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty title="暂无资金流水" detail="在订单详情中登记收款、退押金或扣款。" />
        )}
      </section>
    </>
  );
}

function OrderDetail({
  id,
  version,
  garments,
  onClose,
  refresh,
}: {
  id: string;
  version: number;
  garments: Garment[];
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const resource = useApi<Booking>(`/api/admin/bookings/${id}?v=${version}`),
    b = resource.data,
    g = garments.find((g) => g.id === b?.garmentId),
    toast = useToast();
  const [form, setForm] = useState<'payment' | 'return' | 'cancel' | 'extend' | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [note, setNote] = useState(''),
    [checked, setChecked] = useState(false),
    [newEnd, setNewEnd] = useState('');
  const [kind, setKind] = useState<PaymentKind>('rent'),
    [amount, setAmount] = useState(''),
    [method, setMethod] = useState('微信');
  async function run(path: string, input: unknown, message: string) {
    setBusy(true);
    setError('');
    try {
      const updated = await post<Booking>(path, input);
      resource.setData(updated);
      setForm(null);
      setNote('');
      setChecked(false);
      toast(message);
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const action = (action: string, input: Record<string, unknown> = {}, message = '订单已更新') =>
    run(`/api/admin/bookings/${id}/action`, { action, ...input }, message);
  function switchForm(next: typeof form) {
    setForm(next);
    setError('');
    setNote('');
    setChecked(false);
    if (next === 'extend' && b) setNewEnd(addDays(b.endDate, 1));
  }
  function paymentAmount(k: PaymentKind) {
    if (!b) return '';
    return String(
      (k === 'rent'
        ? b.rentalTotal - b.rentPaid
        : k === 'deposit'
          ? b.depositRequired - b.depositBalance
          : k === 'rent_refund'
            ? b.rentPaid
            : b.depositBalance) / 100,
    );
  }
  function openPayment() {
    if (!b) return;
    const k: PaymentKind = ['returned', 'cancelled', 'completed'].includes(b.status)
      ? 'deposit_refund'
      : b.rentPaid < b.rentalTotal
        ? 'rent'
        : 'deposit';
    setKind(k);
    setAmount(paymentAmount(k));
    switchForm('payment');
  }
  return (
    <Modal
      title="预约与租赁详情"
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      {resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : !b ? (
        <Spinner />
      ) : (
        <>
          <div className="order-detail-heading">
            <div>
              <span className="eyebrow">
                {b.orderNo}
                {b.demo ? ' · 示例订单' : ''}
              </span>
              <h3>{b.garmentName}</h3>
              <p>
                {b.sku} · {b.source === 'online' ? '顾客在线预约' : '门店录入'}
              </p>
            </div>
            <Badge value={b.status} />
          </div>
          <div className="order-detail-grid">
            <section className="detail-block">
              <h3>顾客与租期</h3>
              <dl className="receipt-details">
                <div>
                  <dt>顾客</dt>
                  <dd>{b.guestName}</dd>
                </div>
                <div>
                  <dt>联系电话</dt>
                  <dd>
                    <a href={`tel:${b.phone}`}>{b.phone}</a>
                  </dd>
                </div>
                <div>
                  <dt>取衣日期</dt>
                  <dd>{b.startDate}</dd>
                </div>
                <div>
                  <dt>还衣日期</dt>
                  <dd>
                    {b.endDate} · 共 {rentalDays(b.startDate, b.endDate)} 天
                  </dd>
                </div>
                <div>
                  <dt>清洗预留</dt>
                  <dd>归还后 {b.cleaningDays} 天</dd>
                </div>
                <div>
                  <dt>预约备注</dt>
                  <dd>{b.note || '无'}</dd>
                </div>
              </dl>
            </section>
            <section className="detail-block">
              <h3>租金与押金</h3>
              <dl className="receipt-details">
                <div>
                  <dt>应收租金</dt>
                  <dd>
                    ¥{money(b.rentalTotal)} <small>（¥{money(b.dailyPrice)}/天）</small>
                  </dd>
                </div>
                <div>
                  <dt>已收租金</dt>
                  <dd>¥{money(b.rentPaid)}</dd>
                </div>
                <div>
                  <dt>待收租金</dt>
                  <dd className={b.rentPaid < b.rentalTotal ? 'text-danger' : ''}>
                    ¥{money(Math.max(0, b.rentalTotal - b.rentPaid))}
                  </dd>
                </div>
                <div>
                  <dt>应收押金</dt>
                  <dd>¥{money(b.depositRequired)}</dd>
                </div>
                <div>
                  <dt>押金余额</dt>
                  <dd>¥{money(b.depositBalance)}</dd>
                </div>
                <div>
                  <dt>已结算扣款</dt>
                  <dd>¥{money(b.depositDeducted)}</dd>
                </div>
              </dl>
            </section>
          </div>
          {(b.inspection || b.cancellationReason) && (
            <div className="order-note">
              <strong>{b.cancellationReason ? '取消说明' : '归还验收记录'}</strong>
              <p>{b.cancellationReason || b.inspection}</p>
            </div>
          )}
          <div className="order-actions">
            {b.status === 'pending' && (
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => void action('confirm', {}, '预约已确认，租期及清洗时间已锁定')}
              >
                <Check size={16} />
                确认并锁定排期
              </button>
            )}
            {['confirmed', 'rented', 'returned', 'cancelled', 'completed'].includes(b.status) && (
              <button className="button" disabled={busy} onClick={openPayment}>
                <Wallet size={16} />
                登记收款 / 退款
              </button>
            )}
            {b.status === 'confirmed' && (
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => void action('pickup', {}, '已登记取衣，服装状态更新为出租中')}
              >
                <Package size={16} />
                登记取衣
              </button>
            )}
            {b.status === 'rented' && (
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => switchForm('return')}
              >
                <ArrowDownLeft size={16} />
                归还验收
              </button>
            )}
            {['confirmed', 'rented'].includes(b.status) && (
              <button className="button" disabled={busy} onClick={() => switchForm('extend')}>
                续租 / 延长租期
              </button>
            )}
            {b.status === 'returned' && (
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => void action('complete', {}, '租金与押金已结清，订单已完成')}
              >
                完成结算
              </button>
            )}
            {['pending', 'confirmed'].includes(b.status) && (
              <button
                className="button button-danger-quiet"
                disabled={busy}
                onClick={() => switchForm('cancel')}
              >
                取消订单
              </button>
            )}
          </div>
          {b.status === 'confirmed' && (
            <p className="panel-footnote">
              取衣前需足额登记租金、押金，并确认服装已完成清洗且在店可取。
            </p>
          )}
          {b.status === 'returned' && (
            <p className="panel-footnote">
              归还后请结算押金；衣服需在“服装管理”或首页完成清洗与检查，才会恢复可取。
            </p>
          )}
          {error && <ErrorBox message={error} />}
          {form && (
            <form
              className="action-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (form === 'payment')
                  void run(
                    `/api/admin/bookings/${id}/payments`,
                    { kind, amount: Math.round(Number(amount) * 100), method, note },
                    '资金流水已登记',
                  );
                else if (form === 'return')
                  void action(
                    'return',
                    { accessoriesChecked: checked, inspection: note },
                    '已完成归还验收，服装进入清洗',
                  );
                else if (form === 'cancel')
                  void action('cancel', { reason: note }, '订单已取消，档期已释放');
                else void action('extend', { endDate: newEnd }, '租期已延长，租金按原日租价更新');
              }}
            >
              <div className="form-section-heading">
                <h3>
                  {
                    {
                      payment: '登记资金流水',
                      return: '归还验收',
                      cancel: '取消订单',
                      extend: '延长租期',
                    }[form]
                  }
                </h3>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => switchForm(null)}
                  aria-label="收起操作表单"
                >
                  <X size={17} />
                </button>
              </div>
              {form === 'payment' && (
                <>
                  <div className="form-grid">
                    <Field label="流水类型">
                      <select
                        value={kind}
                        onChange={(e) => {
                          const k = e.target.value as PaymentKind;
                          setKind(k);
                          setAmount(paymentAmount(k));
                        }}
                      >
                        {Object.entries(paymentLabels)
                          .filter(([k]) =>
                            ['returned', 'cancelled', 'completed'].includes(b.status)
                              ? true
                              : ['rent', 'deposit'].includes(k),
                          )
                          .map(([k, label]) => (
                            <option value={k} key={k}>
                              {label}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="金额（元）">
                      <input
                        type="number"
                        min="0.01"
                        max="1000000"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                    </Field>
                    <Field label="收退方式">
                      <select value={method} onChange={(e) => setMethod(e.target.value)}>
                        {['微信', '支付宝', '现金', '银行转账', '其他'].map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="说明（退款、扣款必填）">
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={500}
                        required={!['rent', 'deposit'].includes(kind)}
                        placeholder="记录实际收退情况或扣款原因"
                      />
                    </Field>
                  </div>
                  <p className="subtle">
                    请在实际完成收付款后登记；此操作只记录流水，不会发起支付。
                  </p>
                </>
              )}
              {form === 'return' && (
                <>
                  <div className="accessory-checklist">
                    <span className="subtle">本套配饰清单</span>
                    <p>{g?.accessories.join('、') || '请核对服装及约定配饰'}</p>
                  </div>
                  <Field label="验收记录">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="服装、头饰和配饰是否齐全，有无污损；如有缺损请在这里说明"
                      maxLength={1000}
                      rows={3}
                    />
                  </Field>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setChecked(e.target.checked)}
                      required
                    />
                    已逐项核对服装及配饰，异常情况已记录。
                  </label>
                </>
              )}
              {form === 'cancel' && (
                <>
                  <p className="subtle">取消后释放排期。已有收款需在流水中另行登记退款。</p>
                  <Field label="取消原因">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      maxLength={500}
                      required
                      placeholder="请记录与顾客协商的取消原因"
                    />
                  </Field>
                </>
              )}
              {form === 'extend' && (
                <>
                  <div className="form-grid">
                    <Field label="原还衣日期">
                      <input value={b.endDate} disabled />
                    </Field>
                    <Field label="新的还衣日期">
                      <input
                        type="date"
                        min={addDays(b.endDate, 1)}
                        value={newEnd}
                        onChange={(e) => setNewEnd(e.target.value)}
                        required
                      />
                    </Field>
                  </div>
                  <p className="subtle">
                    续租按原日租价计算，保存时会检查后续预约及清洗冲突。新的预计租金：¥
                    {money(b.dailyPrice * rentalDays(b.startDate, newEnd || b.endDate))}
                  </p>
                </>
              )}
              <div className="form-actions">
                <button className="button button-primary" disabled={busy}>
                  {busy
                    ? '处理中…'
                    : form === 'payment'
                      ? '确认登记'
                      : form === 'return'
                        ? '登记归还并进入清洗'
                        : form === 'cancel'
                          ? '确认取消订单'
                          : '确认延长租期'}
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => switchForm(null)}
                >
                  收起
                </button>
              </div>
            </form>
          )}
          <section className="order-ledger">
            <h3>资金流水</h3>
            {b.payments?.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>类型</th>
                      <th>金额</th>
                      <th>方式 / 说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.payments.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {new Date(p.createdAt).toLocaleString('zh-CN', {
                            timeZone: 'Asia/Shanghai',
                            hour12: false,
                          })}
                        </td>
                        <td>{paymentLabels[p.kind]}</td>
                        <td>¥{money(p.amount)}</td>
                        <td>
                          {p.method}
                          <small>{p.note}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="subtle">尚未登记收付款。</p>
            )}
          </section>
          <div className="order-timestamps">
            <span>
              创建于 {new Date(b.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
            </span>
            {b.pickedAt && (
              <span>
                已取衣 {new Date(b.pickedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
              </span>
            )}
            {b.returnedAt && (
              <span>
                已归还{' '}
                {new Date(b.returnedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
              </span>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function GarmentEditor({
  garment: g,
  onClose,
  refresh,
}: {
  garment?: Garment;
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    sku: g?.sku || '',
    name: g?.name || '',
    category: g?.category || '节庆盛装',
    size: g?.size || 'M',
    measurements: g?.measurements || '',
    description: g?.description || '',
    accessories: g?.accessories.join('\n') || '上衣\n裙装\n腰带\n头饰',
    dailyPrice: g ? String(g.dailyPrice / 100) : '',
    deposit: g ? String(g.deposit / 100) : '',
    listed: g?.listed ?? true,
    tone: g?.tone || 'indigo',
  });
  const [images, setImages] = useState<string[]>(g?.images || []),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(''),
    toast = useToast();
  const patch = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));
  async function upload(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    setError('');
    try {
      const urls: string[] = [];
      if (files.length + images.length > 8) throw new Error('每套最多上传 8 张实拍');
      for (const file of Array.from(files)) {
        if (
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size > 5 * 1024 * 1024
        )
          throw new Error('请上传小于 5 MB 的 JPG、PNG 或 WebP 图片');
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('读取图片失败'));
          reader.readAsDataURL(file);
        });
        urls.push((await post<{ url: string }>('/api/admin/uploads', { data })).url);
      }
      setImages((current) => [...current, ...urls]);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <Modal
      title={g ? '编辑服装档案' : '新增一套服装'}
      onClose={() => {
        if (!busy && !uploading) onClose();
      }}
      wide
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const payload = {
              ...form,
              dailyPrice: Math.round(Number(form.dailyPrice) * 100),
              deposit: Math.round(Number(form.deposit) * 100),
              accessories: form.accessories
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
              images,
            };
            if (g) await put(`/api/admin/garments/${g.id}`, payload);
            else await post('/api/admin/garments', payload);
            toast(g ? '服装档案已更新' : '新服装已添加');
            await refresh();
            onClose();
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="独立编号 *" hint="每套实物使用唯一编号，支持字母、数字及横线。">
            <input
              value={form.sku}
              onChange={(e) => patch('sku', e.target.value)}
              placeholder="如 MZ-007"
              maxLength={40}
              pattern="[a-zA-Z0-9_-]+"
              required
            />
          </Field>
          <Field label="服装名称 *">
            <input
              value={form.name}
              onChange={(e) => patch('name', e.target.value)}
              maxLength={80}
              required
              placeholder="如 靛蓝刺绣盛装"
            />
          </Field>
          <Field label="服装分类 *">
            <input
              list="garment-categories"
              value={form.category}
              onChange={(e) => patch('category', e.target.value)}
              required
              maxLength={30}
            />
            <datalist id="garment-categories">
              <option>节庆盛装</option>
              <option>日常苗装</option>
              <option>儿童服饰</option>
            </datalist>
          </Field>
          <Field label="尺码 *">
            <input
              value={form.size}
              onChange={(e) => patch('size', e.target.value)}
              required
              maxLength={30}
              placeholder="如 M、L、儿童 120"
            />
          </Field>
          <Field label="日租金（元）*">
            <input
              type="number"
              min="0.01"
              step="0.01"
              max="100000"
              value={form.dailyPrice}
              onChange={(e) => patch('dailyPrice', e.target.value)}
              required
            />
          </Field>
          <Field label="押金（元）*">
            <input
              type="number"
              min="0"
              step="0.01"
              max="1000000"
              value={form.deposit}
              onChange={(e) => patch('deposit', e.target.value)}
              required
            />
          </Field>
          <Field label="具体尺寸" wide>
            <input
              value={form.measurements}
              onChange={(e) => patch('measurements', e.target.value)}
              maxLength={500}
              placeholder="胸围、腰围、衣长、裙长，是否可调节等"
            />
          </Field>
          <Field label="服装介绍" wide>
            <textarea
              value={form.description}
              onChange={(e) => patch('description', e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="介绍服装细节、适合场景与需要留意的地方"
            />
          </Field>
          <Field label="配饰清单（每行一项）">
            <textarea
              value={form.accessories}
              onChange={(e) => patch('accessories', e.target.value)}
              rows={4}
              maxLength={1500}
            />
          </Field>
          <Field label="未上传图片时的示意配色">
            <select value={form.tone} onChange={(e) => patch('tone', e.target.value)}>
              {[
                ['indigo', '靛蓝'],
                ['red', '朱红'],
                ['sage', '草木'],
                ['silver', '银灰'],
                ['ochre', '暖金'],
                ['teal', '青黛'],
              ].map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="upload-section">
          <div className="form-section-heading">
            <h3>服装实拍</h3>
            <small>第一张作为封面 · 最多 8 张 · 每张小于 5 MB</small>
          </div>
          <div className="upload-grid">
            {images.map((url, i) => (
              <div className="upload-photo" key={url}>
                <img src={url} alt={`服装实拍 ${i + 1}`} />
                {i === 0 && <span>封面</span>}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`移除第${i + 1}张图片`}
                  onClick={() => setImages((current) => current.filter((_, n) => n !== i))}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            {images.length < 8 && (
              <label className={`upload-button ${uploading ? 'is-loading' : ''}`}>
                <ImagePlus size={25} />
                <span>{uploading ? '上传中…' : '上传实拍'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={uploading || busy}
                  onChange={(e) => {
                    void upload(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={form.listed}
            onChange={(e) => patch('listed', e.target.checked)}
          />
          在顾客端展示并接受预约
        </label>
        <div className="booking-explainer">
          <ShieldCheck size={18} />
          <p>每个编号对应一套实物。下架会隐藏顾客端展示，已有预约和资金流水仍保留。</p>
        </div>
        {error && <ErrorBox message={error} />}
        <div className="form-actions">
          <button className="button button-primary" disabled={busy || uploading}>
            {busy ? '保存中…' : '保存服装档案'}
          </button>
          <button type="button" className="button" onClick={onClose} disabled={busy || uploading}>
            取消
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ManualBooking({
  garments,
  settings,
  onClose,
  onSuccess,
}: {
  garments: Garment[];
  settings: Settings;
  onClose: () => void;
  onSuccess: (b: Booking) => void;
}) {
  const [id, setId] = useState(garments.find((g) => g.listed)?.id || ''),
    [start, setStart] = useState(todayInChina()),
    [end, setEnd] = useState(todayInChina()),
    [next, setNext] = useState(false);
  const garment = garments.find((g) => g.id === id);
  if (next && garment)
    return (
      <BookingForm
        garment={garment}
        start={start}
        end={end}
        settings={settings}
        admin
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
  return (
    <Modal title="录入门店预约" onClose={onClose}>
      <p className="form-intro">线下预约统一录入同一份排期，避免重复接单。</p>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          setNext(true);
        }}
      >
        <Field label="选择服装">
          <select value={id} onChange={(e) => setId(e.target.value)} required>
            <option value="" disabled>
              请选择服装
            </option>
            {garments
              .filter((g) => g.listed)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.sku} · {g.name} · ¥{money(g.dailyPrice)}/天
                </option>
              ))}
          </select>
        </Field>
        <DateRange
          start={start}
          end={end}
          today={todayInChina()}
          onChange={(a, b) => {
            setStart(a);
            setEnd(b);
          }}
        />
        <p className="subtle">提交和确认时均会检查完整租期及清洗缓冲是否有冲突。</p>
        <button className="button button-primary button-full" disabled={!garment}>
          下一步：填写顾客信息
          <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}

function SettingsView({
  settings,
  audit,
  refresh,
}: {
  settings: Settings;
  audit: Audit[];
  refresh: () => Promise<void>;
}) {
  const [form, setForm] = useState(settings),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    toast = useToast();
  useEffect(() => setForm(settings), [settings]);
  const patch = (key: keyof Settings, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <>
      <PageHeading
        eyebrow="STORE DETAILS & RULES"
        title="让每一次到店，都有准备"
        description="完善顾客可见的联系方式与租赁规则。清洗规则的调整仅用于新预约。"
      />
      <section className="panel settings-panel">
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await put('/api/admin/settings', form);
              toast('门店信息与规则已保存');
              await refresh();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-section-heading">
            <h2>门店信息</h2>
            <span className="subtle">会展示在顾客端</span>
          </div>
          <div className="form-grid">
            <Field label="门店名称">
              <input
                value={form.storeName}
                onChange={(e) => patch('storeName', e.target.value)}
                maxLength={40}
                required
              />
            </Field>
            <Field label="联系电话">
              <input
                value={form.phone}
                onChange={(e) => patch('phone', e.target.value)}
                maxLength={40}
                type="tel"
                placeholder="填写顾客可拨打的门店电话"
              />
            </Field>
            <Field label="门店微信">
              <input
                value={form.wechat}
                onChange={(e) => patch('wechat', e.target.value)}
                maxLength={80}
                placeholder="可选"
              />
            </Field>
            <Field label="营业时间">
              <input
                value={form.hours}
                onChange={(e) => patch('hours', e.target.value)}
                maxLength={120}
                placeholder="如 每天 09:00—20:00"
              />
            </Field>
            <Field label="门店地址" wide>
              <input
                value={form.address}
                onChange={(e) => patch('address', e.target.value)}
                maxLength={200}
                placeholder="填写方便顾客找到的详细地址"
              />
            </Field>
            <Field label="首页介绍" wide>
              <textarea
                value={form.introduction}
                onChange={(e) => patch('introduction', e.target.value)}
                maxLength={300}
                rows={2}
              />
            </Field>
            <Field label="顶部公告" wide>
              <textarea
                value={form.notice}
                onChange={(e) => patch('notice', e.target.value)}
                maxLength={500}
                rows={2}
              />
            </Field>
          </div>
          <div className="form-section-heading">
            <h2>租赁规则</h2>
          </div>
          <div className="form-grid">
            <Field label="归还后预留清洗天数" hint="0—14 天。取还当日均计租金。">
              <input
                type="number"
                min={0}
                max={14}
                step={1}
                value={form.cleaningDays}
                onChange={(e) => patch('cleaningDays', Number(e.target.value))}
                required
              />
            </Field>
            <Field label="约定最晚归还时间">
              <input
                type="time"
                value={form.returnTime}
                onChange={(e) => patch('returnTime', e.target.value)}
                required
              />
            </Field>
            <Field label="顾客租赁须知" wide>
              <textarea
                value={form.rentalRules}
                onChange={(e) => patch('rentalRules', e.target.value)}
                maxLength={3000}
                rows={6}
              />
            </Field>
            <Field
              label="网站备案号"
              wide
              hint="填写实际备案号，顾客端页脚会链接至工信部查询页面。"
            >
              <input
                value={form.icp}
                onChange={(e) => patch('icp', e.target.value)}
                maxLength={80}
                placeholder="填写已核实的网站备案号"
              />
            </Field>
          </div>
          {error && <ErrorBox message={error} />}
          <div className="form-actions">
            <button className="button button-primary" disabled={busy}>
              {busy ? '保存中…' : '保存门店设置'}
            </button>
          </div>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>最近操作记录</h2>
          <span className="subtle">保留最近 100 条供查看</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作</th>
                <th>说明 / 对象</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td>
                    {new Date(a.createdAt).toLocaleString('zh-CN', {
                      timeZone: 'Asia/Shanghai',
                      hour12: false,
                    })}
                  </td>
                  <td>{a.action}</td>
                  <td className="audit-detail">{a.detail || a.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!audit.length && <Empty title="暂无操作记录" />}
      </section>
    </>
  );
}
