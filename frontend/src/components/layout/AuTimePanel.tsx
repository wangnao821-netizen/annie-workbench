import { useState, useEffect } from 'react';
import { Calendar, Globe, Sun, ArrowRight, Briefcase } from 'lucide-react';
import { HolidaysResponse, HolidayItem, getHolidays } from '../../services/api/holidays';
import { useTaskStore } from '../../stores/taskStore';
import { useCaseStore } from '../../stores/caseStore';
import { ViewId } from '../../types/navigation';

interface AuTimePanelProps {
  onNavigate?: (v: ViewId) => void;
}

interface DayHoliday {
  state: string;
  name: string;
}

export function AuTimePanel({ onNavigate }: AuTimePanelProps) {
  const [data, setData] = useState<HolidaysResponse | null>(null);
  const [now, setNow] = useState(new Date());

  const { tasks } = useTaskStore();
  const { cases } = useCaseStore();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    getHolidays().then(setData).catch(() => setData(null));
  }, []);

  const formatTz = (tz: string) => {
    try {
      return new Intl.DateTimeFormat('en-AU', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now);
    } catch {
      return '—';
    }
  };

  const getHour = (tz: string) => {
    try {
      return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now), 10);
    } catch {
      return 0;
    }
  };

  const cbHour = getHour('Australia/Sydney');
  const bjHour = getHour('Asia/Shanghai');
  const cbIn = cbHour >= 9 && cbHour < 17;
  const bjIn = bjHour >= 9 && bjHour < 17;

  let overlapText = '非办公';
  if (cbIn && bjIn) overlapText = '中澳均在办公';
  else if (cbIn) overlapText = '仅堪培拉在办公';
  else if (bjIn) overlapText = '仅北京在办公';

  const dlsActive = data?.dls?.sydney?.dls_active ?? false;

  // Calendar setup
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0 is Sun
  const startOffset = (firstDay + 6) % 7; // Mon=0, Sun=6
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const getDayHolidays = (d: number): DayHoliday[] => {
    if (!data) return [];
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const list: DayHoliday[] = [];

    ['ACT', 'NSW', 'QLD'].forEach((st) => {
      const item = data.upcoming?.find((u: HolidayItem) => u.date === dateStr && (u.state === st || u.state === 'ALL'));
      if (item) list.push({ state: st, name: item.name });
    });

    if (data.china) {
      const cnItem = data.china.find((c: HolidayItem) => c.date === dateStr);
      if (cnItem) {
        list.push({ state: 'CN', name: cnItem.name });
      }
    }

    return list;
  };

  const daysUntilNext = data?.next ? Math.max(0, Math.ceil((new Date(data.next.date + 'T00:00:00').getTime() - new Date(year, month, now.getDate()).getTime()) / 86400000)) : null;

  // Section A: Next Bank Working Day calculation
  const todayWeekday = now.getDay();
  const isWeekend = todayWeekday === 0 || todayWeekday === 6;
  const todayStates = data?.today || {};
  const restingState = Object.values(todayStates).find((st) => !st.is_working_day);
  const isTodayResting = isWeekend || !!restingState;

  let nextWorkDayText = '';
  if (isTodayResting) {
    const restReason = restingState?.holiday_name || (isWeekend ? '周末' : '休息日');
    const holidayDates = new Set<string>();
    if (data?.upcoming) {
      data.upcoming.forEach((u) => holidayDates.add(u.date));
    }
    if (data?.today) {
      Object.values(data.today).forEach((t) => {
        if (!t.is_working_day && t.date) holidayDates.add(t.date);
      });
    }

    let foundDate: Date | null = null;
    for (let i = 1; i <= 30; i++) {
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const wd = target.getDay();
      if (wd >= 1 && wd <= 5) {
        const yyyy = target.getFullYear();
        const mm = String(target.getMonth() + 1).padStart(2, '0');
        const dd = String(target.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        if (!holidayDates.has(dateStr)) {
          foundDate = target;
          break;
        }
      }
    }

    if (foundDate) {
      const weekdaysCN = ['日', '一', '二', '三', '四', '五', '六'];
      const m = foundDate.getMonth() + 1;
      const d = foundDate.getDate();
      const w = weekdaysCN[foundDate.getDay()];
      nextWorkDayText = `今日休息（${restReason}）→ 下一个工作日 ${m}/${d} 周${w}`;
    }
  }

  // Section B: Today's business summary
  const todoCount = tasks ? tasks.length : 0;
  const nowMs = now.getTime();
  const sevenDaysMs = 7 * 86400000;
  const financeNearCount = (cases || []).filter((c) => {
    const dStr = c.financeDeadline || c.deadline;
    if (!dStr) return false;
    const dMs = new Date(dStr + 'T00:00:00').getTime();
    const diff = dMs - nowMs;
    return diff >= -86400000 && diff <= sevenDaysMs;
  }).length;

  // Section C: China Long Holiday Countdown
  let chinaCountdownText = '—';
  if (data?.next_china) {
    const chinaDate = new Date(data.next_china.date + 'T00:00:00');
    const nowZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysChina = Math.max(0, Math.ceil((chinaDate.getTime() - nowZero.getTime()) / 86400000));
    const m1 = data.next_china.date.slice(5).replace('-', '/');
    let str = `距 ${data.next_china.name}（${m1}）还有 ${daysChina} 天`;

    if (data?.china && data.china.length > 1) {
      const c2 = data.china[1];
      const m2 = c2.date.slice(5).replace('-', '/');
      str += ` · ${c2.name} ${m2}`;
    }
    chinaCountdownText = str;
  }

  return (
    <div className="w-80 p-3 rounded-2xl border shadow-2xl text-xs space-y-2.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }} id="au-time-panel">
      {/* Header & Timezones */}
      <div className="space-y-1.5 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between text-[11px] font-bold text-primary">
          <span className="flex items-center space-x-1"><Globe className="w-3.5 h-3.5 text-[var(--accent)]" /><span className="whitespace-nowrap">中澳跨国实时时区</span></span>
          <span className="text-[11px] text-muted font-normal whitespace-nowrap">{overlapText}</span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-center">
          <div className="p-1 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-soft)] whitespace-nowrap">
            <div className="text-[11px] text-[var(--accent)] font-bold whitespace-nowrap">堪培拉/悉尼</div>
            <div className="text-xs font-black font-mono text-[var(--accent)] whitespace-nowrap">{formatTz('Australia/Sydney')}</div>
          </div>
          <div className="p-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] whitespace-nowrap">
            <div className="text-[11px] text-muted font-medium flex items-center justify-center space-x-0.5 whitespace-nowrap">
              <span>布里斯班</span>
              <span className="text-[11px] text-[var(--yellow)] font-normal whitespace-nowrap" title="不实行夏令时">(无夏令时)</span>
            </div>
            <div className="text-xs font-bold font-mono text-primary whitespace-nowrap">{formatTz('Australia/Brisbane')}</div>
          </div>
          <div className="p-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] whitespace-nowrap">
            <div className="text-[11px] text-muted font-medium whitespace-nowrap">北京</div>
            <div className="text-xs font-bold font-mono text-primary whitespace-nowrap">{formatTz('Asia/Shanghai')}</div>
          </div>
        </div>
      </div>

      {/* Section A: Next Bank Working Day Notice (When today is resting) */}
      {isTodayResting && nextWorkDayText && (
        <div className="p-1.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-soft)] text-[11px] text-[var(--accent)] font-bold flex items-center space-x-1">
          <span className="truncate">{nextWorkDayText}</span>
        </div>
      )}

      {/* DLS & Bank Working Status */}
      <div className="space-y-1 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span className="flex items-center space-x-1"><Sun className="w-3 h-3 text-[var(--yellow)] flex-shrink-0" /><span className="whitespace-nowrap">{dlsActive ? '悉尼夏令时 (AEDT, UTC+11, 差北京3h)' : '悉尼标准时 (AEST, UTC+10, 差北京2h)'}</span></span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-[11px]">
          {['ACT', 'NSW', 'QLD'].map((st) => {
            const info = data?.today?.[st];
            const isWork = info?.is_working_day ?? true;
            return (
              <div key={st} className="flex items-center justify-between p-1 rounded-lg bg-[var(--bg-subtle)] px-1.5">
                <span className="font-bold text-muted">{st}</span>
                <span className={isWork ? 'text-[var(--green)] font-bold whitespace-nowrap' : 'text-[var(--red)] font-bold truncate max-w-[50px] whitespace-nowrap'} title={info?.holiday_name || '休息日'}>
                  {isWork ? '工作日' : info?.holiday_name || '休息'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mini Calendar (Compressed) */}
      <div className="space-y-1 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between text-xs font-bold text-primary">
          <span className="flex items-center space-x-1"><Calendar className="w-3 h-3 text-[var(--accent)]" /><span>{year}年 {month + 1}月日历</span></span>
          <div className="flex items-center space-x-1 text-[11px]">
            <span className="flex items-center space-x-0.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--mark-act)]" /><span>ACT</span></span>
            <span className="flex items-center space-x-0.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--mark-nsw)]" /><span>NSW</span></span>
            <span className="flex items-center space-x-0.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--mark-qld)]" /><span>QLD</span></span>
            <span className="flex items-center space-x-0.5" title="中国长假首日"><span className="w-1.5 h-1.5 rounded-full bg-[var(--mark-cn)]" /><span>中国</span></span>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-muted font-bold gap-0.5">
          {['一', '二', '三', '四', '五', '六', '日'].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] gap-0.5 font-mono">
          {Array.from({ length: startOffset }).map((_, i) => <div key={`empty-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1;
            const isToday = d === now.getDate();
            const hList = getDayHolidays(d);
            const titleText = hList.length > 0 ? hList.map((h) => `${h.name}（${h.state}）`).join('\n') : undefined;
            const statesPresent = hList.map((h) => h.state);

            return (
              <div
                key={d}
                title={titleText}
                className={`p-0 rounded flex flex-col items-center justify-center min-h-[18px] relative ${
                  isToday ? 'bg-[var(--accent)] text-[var(--on-accent)] font-black shadow-xs' : 'hover:bg-[var(--bg-subtle)] text-primary'
                }`}
              >
                <span>{d}</span>
                {hList.length > 0 && (
                  <div className="flex space-x-0.5 absolute bottom-0.2">
                    {statesPresent.includes('ACT') && <span className="w-1 h-1 rounded-full bg-[var(--mark-act)]" />}
                    {statesPresent.includes('NSW') && <span className="w-1 h-1 rounded-full bg-[var(--mark-nsw)]" />}
                    {statesPresent.includes('QLD') && <span className="w-1 h-1 rounded-full bg-[var(--mark-qld)]" />}
                    {statesPresent.includes('CN') && <span className="w-1 h-1 rounded-full bg-[var(--mark-cn)]" />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Next Holiday Countdown & Fixed 4 Upcoming List */}
      <div className="space-y-1 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        {data?.next && (
          <div className="p-1 rounded-xl bg-[var(--yellow-soft)] border border-[var(--yellow-soft)] text-[11px] text-[var(--yellow)] font-bold flex items-center justify-between px-2">
            <span className="truncate">距 {data.next.name} ({data.next.date})</span>
            <span className="flex-shrink-0 font-mono text-xs ml-1">还有 {daysUntilNext ?? '—'} 天</span>
          </div>
        )}
        <div className="text-xs font-bold text-muted flex items-center justify-between pt-0.5">
          <span>即将到来假期</span>
          <span>{data?.upcoming?.length || 0} 个</span>
        </div>
        <div className="space-y-1">
          {(data?.upcoming || []).slice(1, 5).map((h: HolidayItem, idx: number) => (
            <div key={idx} className="flex items-center justify-between text-[11px] p-1 rounded-lg bg-[var(--bg-subtle)]">
              <div className="flex items-center space-x-1.5 truncate min-w-0">
                <span className="font-mono text-muted text-[11px] flex-shrink-0">{h.date.slice(5)}</span>
                <span className="font-semibold text-primary truncate" title={h.name}>{h.name}</span>
              </div>
              <span className="px-1 py-0.2 text-[11px] font-mono font-bold rounded bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-soft)] flex-shrink-0 ml-1">
                {h.state}
              </span>
            </div>
          ))}
          {(!data?.upcoming || data.upcoming.length <= 1) && (
            <div className="text-center text-muted text-[11px] py-0.5">— 暂无更多近期假期 —</div>
          )}
        </div>
      </div>

      {/* Section C: China Long Holiday Countdown */}
      <div className="p-1.5 rounded-xl bg-[var(--red-soft)] border border-[var(--red-soft)] text-[11px] text-[var(--red)] font-medium flex items-center justify-between">
        <div className="flex items-center space-x-1 truncate min-w-0">
          <span className="truncate font-semibold">{chinaCountdownText}</span>
        </div>
      </div>

      {/* Section B: Today's Business Summary (Clickable) */}
      <button
        type="button"
        onClick={() => onNavigate?.('home')}
        className="w-full text-left p-1.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-soft)] hover:opacity-90 transition-colors text-[11px] text-[var(--accent)] font-medium flex items-center justify-between cursor-pointer"
        title="点击跳转至今日工作台"
      >
        <div className="flex items-center space-x-1 truncate min-w-0">
          <Briefcase className="w-3 h-3 text-[var(--accent)] flex-shrink-0" />
          <span className="truncate font-semibold">
            今日待办 {todoCount} 件 · 7 天内 Finance 截止 {financeNearCount} 案
          </span>
        </div>
        <ArrowRight className="w-3 h-3 text-[var(--accent)] flex-shrink-0 ml-1" />
      </button>
    </div>
  );
}
