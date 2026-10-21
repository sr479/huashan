import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { X, Check, AlertCircle, Loader2, Mountain, CalendarDays } from 'lucide-react';
import { stateLabels, bookingLabels } from '../shared/utils';
import type { Garment } from '../shared/types';

const ToastContext = createContext<(message: string, error?: boolean) => void>(() => {});
type ToastMessage = { message: string; error?: boolean };
const ToastMessageContext = createContext<{ toast: ToastMessage | null; dismiss: () => void }>({
  toast: null,
  dismiss: () => {},
});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <ToastContext.Provider value={(message, error) => setToast({ message, error })}>
      <ToastMessageContext.Provider value={{ toast, dismiss: () => setToast(null) }}>
        {children}
        <ToastDisplay />
      </ToastMessageContext.Provider>
    </ToastContext.Provider>
  );
}
function ToastDisplay({ inline = false }: { inline?: boolean }) {
  const { toast, dismiss } = useContext(ToastMessageContext);
  return toast ? (
    <div
      className={`toast ${inline ? 'toast-in-modal' : 'toast-global'} ${toast.error ? 'toast-error' : ''}`}
      role={toast.error ? 'alert' : 'status'}
    >
      {toast.error ? <AlertCircle size={18} /> : <Check size={18} />}
      <span>{toast.message}</span>
      <button type="button" className="icon-button" onClick={dismiss} aria-label="关闭提示">
        <X size={16} />
      </button>
    </div>
  ) : null;
}
export const useToast = () => useContext(ToastContext);
export function Brand({ small = false, name = '花山节' }: { small?: boolean; name?: string }) {
  return (
    <span className={`brand ${small ? 'brand-small' : ''}`}>
      <span className="brand-mark">山</span>
      <span>
        <strong>{name}</strong>
        <small>苗族服饰 · 到店租赁</small>
      </span>
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    label = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      aria-labelledby={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <h2 id={label}>{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭窗口">
          <X size={21} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
      <ToastDisplay inline />
    </dialog>
  );
}
export function Spinner({ text = '正在加载' }: { text?: string }) {
  return (
    <div className="loading" role="status">
      <Loader2 size={24} className="spin" />
      <span>{text}</span>
    </div>
  );
}
export function Empty({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Mountain size={32} strokeWidth={1} />
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {children}
    </div>
  );
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={20} />
      <span>{message}</span>
      {retry && (
        <button type="button" className="button button-small" onClick={retry}>
          重新加载
        </button>
      )}
    </div>
  );
}
export function Badge({ value, label }: { value: string; label?: string }) {
  return (
    <span className={`badge badge-${value}`}>
      {label || bookingLabels[value] || stateLabels[value] || value}
    </span>
  );
}
export function Field({
  label,
  children,
  hint,
  wide,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? 'field-wide' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Artwork({
  garment,
  hero = false,
}: {
  garment?: Pick<Garment, 'images' | 'name' | 'tone' | 'demo'>;
  hero?: boolean;
}) {
  const id = useId().replaceAll(':', '');
  if (garment?.images[0])
    return (
      <div className="garment-art real-photo">
        <img src={garment.images[0]} alt={garment.name} loading="lazy" />
      </div>
    );
  return (
    <div className={`garment-art art-${garment?.tone || 'indigo'} ${hero ? 'art-hero' : ''}`}>
      <div className="art-halo" />
      <div className="art-ornament art-ornament-left" />
      <div className="art-ornament art-ornament-right" />
      <svg viewBox="0 0 300 330" aria-hidden="true" className="garment-drawing">
        <defs>
          <pattern id={`weave-${id}`} width="22" height="22" patternUnits="userSpaceOnUse">
            <path
              d="M11 2 20 11 11 20 2 11Z M11 7 15 11 11 15 7 11Z"
              fill="none"
              stroke="var(--art-thread)"
              strokeWidth="1"
            />
          </pattern>
          <linearGradient id={`silk-${id}`} x1="0" x2="1">
            <stop stopColor="var(--art-fabric)" />
            <stop offset=".5" stopColor="var(--art-highlight)" />
            <stop offset="1" stopColor="var(--art-fabric)" />
          </linearGradient>
        </defs>
        <path
          d="M114 45 85 54 37 103 62 139 97 112 100 172 73 282Q150 311 227 282L200 172 203 112 238 139 263 103 215 54 186 45 170 60 130 60Z"
          fill={`url(#silk-${id})`}
          stroke="var(--art-thread)"
          strokeWidth="1.2"
        />
        <path d="M116 46 131 82 150 99 169 82 184 46 169 60 131 60Z" fill="var(--art-shadow)" />
        <path
          d="m116 46 17 38 17 15 17-15 17-38"
          fill="none"
          stroke="var(--art-thread)"
          strokeWidth="5"
        />
        <path
          d="M85 66 49 104 65 124 97 98ZM215 66 251 104 235 124 203 98Z"
          fill={`url(#weave-${id})`}
        />
        <path d="M103 129 197 129 197 159 103 159Z" fill={`url(#weave-${id})`} opacity=".9" />
        <path d="M101 163H199L202 178H98Z" fill="var(--art-thread)" opacity=".8" />
        <path d="m100 190-18 72q68 24 136 0l-18-72" fill={`url(#weave-${id})`} />
        {[108, 129, 150, 171, 192].map((x, i) => (
          <path
            key={x}
            d={`M${x} 184 ${x + (i - 2) * 8} 282`}
            stroke="var(--art-thread)"
            opacity=".35"
            fill="none"
          />
        ))}
        <path
          d="M78 272Q150 298 222 272M76 280Q150 307 224 280"
          stroke="var(--art-thread)"
          fill="none"
          strokeWidth="2"
        />
        <circle cx="150" cy="113" r="10" fill="var(--art-thread)" />
        <circle cx="150" cy="113" r="6" stroke="var(--art-fabric)" fill="none" />
        <path d="M143 122v10m7-10v14m7-14v10" stroke="var(--art-thread)" strokeWidth="2" />
      </svg>
      {hero ? (
        <div className="art-caption">
          <span>绣一身山色</span>
          <small>赴一场花山</small>
        </div>
      ) : (
        <small className="art-placeholder">
          {garment?.demo ? '示例插画 · 待替换实拍' : '待上传服装实拍'}
        </small>
      )}
    </div>
  );
}
export function DateRange({
  start,
  end,
  today,
  onChange,
}: {
  start: string;
  end: string;
  today: string;
  onChange: (start: string, end: string) => void;
}) {
  return (
    <div className="date-range">
      <CalendarDays size={20} className="date-icon" />
      <Field label="取衣日期">
        <input
          aria-label="取衣日期"
          type="date"
          value={start}
          min={today}
          onChange={(e) => {
            if (e.target.value)
              onChange(e.target.value, end < e.target.value ? e.target.value : end);
          }}
        />
      </Field>
      <span className="date-divider">—</span>
      <Field label="还衣日期">
        <input
          aria-label="还衣日期"
          type="date"
          value={end}
          min={start}
          onChange={(e) => {
            if (e.target.value) onChange(start, e.target.value);
          }}
        />
      </Field>
    </div>
  );
}
