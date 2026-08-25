import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  Check,
  ExternalLink,
  Loader2,
  Briefcase,
  Home,
  Scale,
  Car,
  PiggyBank,
  CheckCircle2,
} from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useToastStore } from '../../stores/toastStore';
import {
  updateFactFindSection,
  confirmFactFindSection,
} from '../../services/api/cases';

interface FactFindConfirmCardProps {
  payload: {
    case_id: string;
    section: string;
    data: any;
    confirm_required?: boolean;
  };
}

export function FactFindConfirmCard({ payload }: FactFindConfirmCardProps) {
  // support direct or flow-wrapped payload
  const effectivePayload = (payload as any)?.card?.payload || payload;
  const { case_id: caseId, section, data } = effectivePayload;
  const setRightDeckTab = useUiStore((s) => s.setRightDeckTab);
  const showToast = useToastStore((s) => s.showToast);

  const [confirmed, setConfirmed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const sectionMap: Record<string, { title: string; icon: any }> = {
    employment_history: { title: '雇主与工作履历', icon: Briefcase },
    living_history: { title: '居住历史', icon: Home },
    solicitor_info: { title: '律师 / 过户师信息', icon: Scale },
    vehicle_asset: { title: '车辆资产', icon: Car },
    super_balance: { title: 'Super 养老金', icon: PiggyBank },
  };

  const currentSec = sectionMap[section] || { title: section, icon: Sparkles };
  const Icon = currentSec.icon;

  const handleConfirm = async () => {
    if (submitting || confirmed) return;
    setSubmitting(true);
    try {
      await updateFactFindSection(caseId, section, data);
      const res = await confirmFactFindSection(caseId, section);
      setConfirmed(true);
      showToast(
        'success',
        `Fact Find [${currentSec.title}] 已确认录入！${res.checklist_updated ? '材料清单已同步勾选已收' : ''}`
      );
    } catch (err: any) {
      showToast('error', err?.message || '确认录入失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPanorama = () => {
    setRightDeckTab('panorama');
    showToast('info', '已打开右栏全景面板，您可在 Fact Find 区微调字段');
  };

  if (dismissed) {
    return (
      <div className="p-2 rounded-xl border text-xs text-muted italic bg-[var(--bg-subtle)] border-[var(--border)]">
        已放弃本次 Fact Find 提炼草稿
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-3.5 rounded-2xl border space-y-3 shadow-xs"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: confirmed ? 'var(--green-soft)' : 'var(--purple-soft)',
      }}
      id={`fact-find-confirm-card-${section}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 min-w-0">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
            style={{
              backgroundColor: confirmed ? 'var(--green-soft)' : 'var(--purple-soft)',
              color: confirmed ? 'var(--green)' : 'var(--purple)',
            }}
          >
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-extrabold text-xs" style={{ color: 'var(--text-primary)' }}>
              Fact Find 口述提取 · {currentSec.title}
            </span>
            <p className="text-[10px] text-muted">
              Annie 已从对话中识别结构化内容，确认后将持久化至案件档案并联动清单
            </p>
          </div>
        </div>

        {confirmed && (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center space-x-1 shrink-0"
            style={{ backgroundColor: 'var(--green-soft)', color: 'var(--green)' }}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>已确认入库</span>
          </span>
        )}
      </div>

      {/* Extracted Data Preview Area */}
      <div
        className="p-2.5 rounded-xl border text-xs space-y-1.5 font-mono select-text"
        style={{
          backgroundColor: 'var(--bg-subtle)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        {Array.isArray(data) ? (
          <div className="space-y-1.5">
            {data.map((row: any, idx: number) => (
              <div
                key={idx}
                className="p-1.5 rounded border bg-[var(--bg-card)] border-[var(--border)] text-[11px]"
              >
                <div className="font-bold text-[var(--accent)] mb-1">项 #{idx + 1}</div>
                {Object.entries(row).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-[10px]">
                    <span className="text-muted">{k}:</span>
                    <span className="font-medium truncate max-w-[200px]">{String(v || '—')}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : typeof data === 'object' && data !== null ? (
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {Object.entries(data).map(([k, v]) => (
              <div key={k} className="p-1 rounded bg-[var(--bg-card)] border border-[var(--border)]">
                <span className="text-[10px] text-muted block">{k}</span>
                <span className="font-bold truncate block">{String(v || '—')}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-muted">{String(data)}</div>
        )}
      </div>

      {/* Action Buttons */}
      {!confirmed && (
        <div className="flex items-center justify-end space-x-2 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="px-2.5 py-1 text-xs text-muted hover:text-[var(--text-primary)] cursor-pointer"
          >
            放弃
          </button>

          <button
            type="button"
            onClick={handleOpenPanorama}
            className="px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center space-x-1 hover:opacity-85 cursor-pointer"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <ExternalLink className="w-3 h-3 text-muted" />
            <span>在全景中修改</span>
          </button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="px-3.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1.5 hover:opacity-90 cursor-pointer shadow-xs disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {submitting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            <span>确认录入</span>
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}
