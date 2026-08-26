import { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Loader2,
  FileCheck2,
} from 'lucide-react';
import {
  getFactFind,
  updateFactFindSection,
  confirmFactFindSection,
} from '../../services/api/cases';
import { useToastStore } from '../../stores/toastStore';
import {
  EmploymentHistoryItem,
  LivingHistoryItem,
  SolicitorInfo,
  VehicleAsset,
  SuperBalance,
} from '../../types/api';

export const FACT_FIND_SECTION_MAP: Record<string, string> = {
  employment_history: 'employment_history',
  living_history: 'living_history',
  solicitor_info: 'solicitor_info',
  vehicle_asset_info: 'vehicle_asset',
  vehicle_asset: 'vehicle_asset',
  super_statement: 'super_balance',
  super_balance: 'super_balance',
};

export interface FactFindSingleCardProps {
  caseId: string;
  sectionKey: string;
  title?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onConfirmed?: () => void;
}

export function FactFindSingleCard({
  caseId,
  sectionKey,
  onConfirmed,
}: FactFindSingleCardProps) {
  const showToast = useToastStore((s) => s.showToast);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<'pending' | 'confirmed'>('pending');

  const [employmentHistory, setEmploymentHistory] = useState<EmploymentHistoryItem[]>([
    { company: '', position: '', address: '', phone: '', start_date: '', end_date: '' },
  ]);
  const [livingHistory, setLivingHistory] = useState<LivingHistoryItem[]>([
    { address: '', start_date: '', end_date: '' },
  ]);
  const [solicitorInfo, setSolicitorInfo] = useState<SolicitorInfo>({
    company: '',
    contact_name: '',
    email: '',
    phone: '',
  });
  const [vehicleAsset, setVehicleAsset] = useState<VehicleAsset>({
    make: '',
    model: '',
    value: 0,
  });
  const [superBalance, setSuperBalance] = useState<SuperBalance>({
    provider: '',
    balance: 0,
  });

  const loadData = async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const res = await getFactFind(caseId);
      if (res && res.sections && res.sections[sectionKey]) {
        const sec = res.sections[sectionKey];
        setStatus(sec.status || 'pending');
        if (sectionKey === 'employment_history' && Array.isArray(sec.data) && sec.data.length > 0) {
          setEmploymentHistory(sec.data);
        } else if (sectionKey === 'living_history' && Array.isArray(sec.data) && sec.data.length > 0) {
          setLivingHistory(sec.data);
        } else if (sectionKey === 'solicitor_info' && sec.data && typeof sec.data === 'object') {
          setSolicitorInfo(sec.data);
        } else if (sectionKey === 'vehicle_asset' && sec.data && typeof sec.data === 'object') {
          setVehicleAsset(sec.data);
        } else if (sectionKey === 'super_balance' && sec.data && typeof sec.data === 'object') {
          setSuperBalance(sec.data);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [caseId, sectionKey]);

  const getDataPayload = () => {
    if (sectionKey === 'employment_history') return employmentHistory;
    if (sectionKey === 'living_history') return livingHistory;
    if (sectionKey === 'solicitor_info') return solicitorInfo;
    if (sectionKey === 'vehicle_asset') return vehicleAsset;
    if (sectionKey === 'super_balance') return superBalance;
    return {};
  };

  const handleSaveDraft = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSaving(true);
    try {
      await updateFactFindSection(caseId, sectionKey, getDataPayload());
      showToast('success', '已暂存草稿');
    } catch (err: any) {
      showToast('error', err?.message || '暂存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setConfirming(true);
    try {
      await updateFactFindSection(caseId, sectionKey, getDataPayload());
      const res = await confirmFactFindSection(caseId, sectionKey);
      setStatus('confirmed');
      showToast(
        'success',
        `已确认录入！${res.checklist_updated ? '清单已自动勾选完成' : ''}`
      );
      window.dispatchEvent(new CustomEvent('checklist_updated', { detail: { caseId } }));
      window.dispatchEvent(new CustomEvent('case_facts_updated', { detail: { caseId } }));
      if (onConfirmed) onConfirmed();
    } catch (err: any) {
      showToast('error', err?.message || '确认录入失败');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div
      className="mt-2 p-3 rounded-xl border space-y-3 bg-[var(--bg-app)] text-xs"
      style={{ borderColor: 'var(--border)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {loading ? (
        <div className="py-2 flex items-center justify-center space-x-2 text-muted text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
          <span>加载中...</span>
        </div>
      ) : (
        <>
          {/* Section 1: 雇主与工作履历 */}
          {sectionKey === 'employment_history' && (
            <div className="space-y-3">
              {employmentHistory.map((item, idx) => (
                <div key={idx} className="p-2.5 rounded-lg border bg-[var(--bg-card)] space-y-2" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between text-[11px] font-bold text-muted pb-1 border-b" style={{ borderColor: 'var(--border)' }}>
                    <span>履历 #{idx + 1}</span>
                    {employmentHistory.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEmploymentHistory((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-red-500 hover:text-red-600 flex items-center space-x-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>删除</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-muted mb-0.5">雇主公司名称</label>
                      <input
                        type="text"
                        value={item.company}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEmploymentHistory((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, company: val } : it))
                          );
                        }}
                        placeholder="如：Atlassian Pty Ltd"
                        className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted mb-0.5">职位/头衔</label>
                      <input
                        type="text"
                        value={item.position}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEmploymentHistory((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, position: val } : it))
                          );
                        }}
                        placeholder="如：Senior Software Engineer"
                        className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted mb-0.5">入职时间</label>
                      <input
                        type="text"
                        value={item.start_date}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEmploymentHistory((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, start_date: val } : it))
                          );
                        }}
                        placeholder="如：2022-03"
                        className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted mb-0.5">离职时间（在职留空）</label>
                      <input
                        type="text"
                        value={item.end_date}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEmploymentHistory((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, end_date: val } : it))
                          );
                        }}
                        placeholder="如：Current 或 2025-06"
                        className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setEmploymentHistory((prev) => [
                    ...prev,
                    { company: '', position: '', address: '', phone: '', start_date: '', end_date: '' },
                  ])
                }
                className="w-full py-1.5 rounded-lg border border-dashed text-xs font-semibold text-muted hover:text-primary hover:border-[var(--green)] flex items-center justify-center space-x-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>＋ 添加一段工作履历</span>
              </button>
            </div>
          )}

          {/* Section 2: 居住历史 */}
          {sectionKey === 'living_history' && (
            <div className="space-y-3">
              {livingHistory.map((item, idx) => (
                <div key={idx} className="p-2.5 rounded-lg border bg-[var(--bg-card)] space-y-2" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between text-[11px] font-bold text-muted pb-1 border-b" style={{ borderColor: 'var(--border)' }}>
                    <span>住址 #{idx + 1}</span>
                    {livingHistory.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLivingHistory((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-red-500 hover:text-red-600 flex items-center space-x-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>删除</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="block text-[10px] text-muted mb-0.5">居住地址 (Address)</label>
                      <input
                        type="text"
                        value={item.address}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLivingHistory((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, address: val } : it))
                          );
                        }}
                        placeholder="如：123 George St, Sydney NSW 2000"
                        className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-muted mb-0.5">入住时间</label>
                        <input
                          type="text"
                          value={item.start_date}
                          onChange={(e) => {
                            const val = e.target.value;
                            setLivingHistory((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, start_date: val } : it))
                            );
                          }}
                          placeholder="如：2021-01"
                          className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-muted mb-0.5">搬出时间（现住留空）</label>
                        <input
                          type="text"
                          value={item.end_date}
                          onChange={(e) => {
                            const val = e.target.value;
                            setLivingHistory((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, end_date: val } : it))
                            );
                          }}
                          placeholder="如：Current"
                          className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setLivingHistory((prev) => [
                    ...prev,
                    { address: '', start_date: '', end_date: '' },
                  ])
                }
                className="w-full py-1.5 rounded-lg border border-dashed text-xs font-semibold text-muted hover:text-primary hover:border-[var(--green)] flex items-center justify-center space-x-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>＋ 添加一段居住历史</span>
              </button>
            </div>
          )}

          {/* Section 3: 律师/过户师 */}
          {sectionKey === 'solicitor_info' && (
            <div className="p-2.5 rounded-lg border bg-[var(--bg-card)] space-y-2" style={{ borderColor: 'var(--border)' }}>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-muted mb-0.5">律所/过户行名称</label>
                  <input
                    type="text"
                    value={solicitorInfo.company}
                    onChange={(e) => setSolicitorInfo({ ...solicitorInfo, company: e.target.value })}
                    placeholder="如：ABC Legal Services"
                    className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted mb-0.5">负责律师姓名</label>
                  <input
                    type="text"
                    value={solicitorInfo.contact_name}
                    onChange={(e) => setSolicitorInfo({ ...solicitorInfo, contact_name: e.target.value })}
                    placeholder="如：John Smith"
                    className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted mb-0.5">律师联系邮箱</label>
                  <input
                    type="email"
                    value={solicitorInfo.email}
                    onChange={(e) => setSolicitorInfo({ ...solicitorInfo, email: e.target.value })}
                    placeholder="如：solicitor@abclegal.com.au"
                    className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted mb-0.5">律师联系电话</label>
                  <input
                    type="text"
                    value={solicitorInfo.phone}
                    onChange={(e) => setSolicitorInfo({ ...solicitorInfo, phone: e.target.value })}
                    placeholder="如：02 9876 5432"
                    className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 4: 车辆资产 */}
          {sectionKey === 'vehicle_asset' && (
            <div className="p-2.5 rounded-lg border bg-[var(--bg-card)] space-y-2" style={{ borderColor: 'var(--border)' }}>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-muted mb-0.5">品牌 (Make)</label>
                  <input
                    type="text"
                    value={vehicleAsset.make}
                    onChange={(e) => setVehicleAsset({ ...vehicleAsset, make: e.target.value })}
                    placeholder="如：Toyota"
                    className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted mb-0.5">车型 (Model)</label>
                  <input
                    type="text"
                    value={vehicleAsset.model}
                    onChange={(e) => setVehicleAsset({ ...vehicleAsset, model: e.target.value })}
                    placeholder="如：RAV4 2022"
                    className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted mb-0.5">预估净值 ($)</label>
                  <input
                    type="number"
                    value={vehicleAsset.value || ''}
                    onChange={(e) => setVehicleAsset({ ...vehicleAsset, value: parseFloat(e.target.value) || 0 })}
                    placeholder="如：35000"
                    className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)] font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 5: Super 养老金 */}
          {sectionKey === 'super_balance' && (
            <div className="p-2.5 rounded-lg border bg-[var(--bg-card)] space-y-2" style={{ borderColor: 'var(--border)' }}>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-muted mb-0.5">养老金机构 (Super Fund)</label>
                  <input
                    type="text"
                    value={superBalance.provider}
                    onChange={(e) => setSuperBalance({ ...superBalance, provider: e.target.value })}
                    placeholder="如：AustralianSuper"
                    className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted mb-0.5">当前账户余额 ($)</label>
                  <input
                    type="number"
                    value={superBalance.balance || ''}
                    onChange={(e) => setSuperBalance({ ...superBalance, balance: parseFloat(e.target.value) || 0 })}
                    placeholder="如：120000"
                    className="w-full p-1.5 rounded-md border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)] font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 操作栏 */}
          <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[10px] font-mono text-muted">
              {status === 'confirmed' ? '🟢 已确认入账' : '⏳ 待确认'}
            </span>

            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || confirming}
                className="px-2.5 py-1 rounded-md border text-[11px] font-semibold text-muted hover:text-primary cursor-pointer transition-colors bg-[var(--bg-card)]"
                style={{ borderColor: 'var(--border)' }}
              >
                {saving ? '保存中...' : '暂存草稿'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving || confirming}
                className="px-3 py-1 rounded-md text-[11px] font-bold text-white bg-[var(--green)] hover:opacity-90 cursor-pointer shadow-2xs"
              >
                {confirming ? '录入中...' : '✓ 确认录入'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 只读 Fact Find 摘要面板（专用于客户全景 CasePanorama，无冗余输入框）
 */
export function ReadOnlyFactFindSummary({ caseId }: { caseId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const res = await getFactFind(caseId);
      setData(res?.sections || null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener('case_facts_updated', handleUpdate);
    window.addEventListener('checklist_updated', handleUpdate);
    return () => {
      window.removeEventListener('case_facts_updated', handleUpdate);
      window.removeEventListener('checklist_updated', handleUpdate);
    };
  }, [caseId]);

  if (loading || !data) return null;

  const empSec = data.employment_history;
  const livingSec = data.living_history;
  const solSec = data.solicitor_info;
  const vehSec = data.vehicle_asset;
  const supSec = data.super_balance;

  const hasAnyConfirmed = [empSec, livingSec, solSec, vehSec, supSec].some(
    (s) => s && s.status === 'confirmed'
  );

  if (!hasAnyConfirmed) return null;

  return (
    <div
      className="p-3.5 rounded-2xl border space-y-2.5"
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
      id="readonly-fact-find-summary"
    >
      <div className="flex items-center justify-between pb-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
        <h4 className="text-xs font-extrabold flex items-center space-x-1.5" style={{ color: 'var(--text-primary)' }}>
          <FileCheck2 className="w-3.5 h-3.5 text-[var(--green)]" />
          <span>客户已确认背景信息 (Fact Find)</span>
        </h4>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--green-soft)] text-[var(--green)]">
          已同步
        </span>
      </div>

      <div className="space-y-1.5 text-xs">
        {empSec && empSec.status === 'confirmed' && Array.isArray(empSec.data) && empSec.data[0]?.company && (
          <div className="flex items-start space-x-2">
            <span className="text-muted shrink-0 text-[11px]">💼 雇主履历:</span>
            <span className="font-semibold text-[var(--text-primary)]">
              {empSec.data.map((e: any) => `${e.company} (${e.position || '员工'})`).join('；')}
            </span>
          </div>
        )}

        {livingSec && livingSec.status === 'confirmed' && Array.isArray(livingSec.data) && livingSec.data[0]?.address && (
          <div className="flex items-start space-x-2">
            <span className="text-muted shrink-0 text-[11px]">🏠 居住历史:</span>
            <span className="font-semibold text-[var(--text-primary)]">
              {livingSec.data.map((l: any) => l.address).join('；')}
            </span>
          </div>
        )}

        {solSec && solSec.status === 'confirmed' && solSec.data?.company && (
          <div className="flex items-start space-x-2">
            <span className="text-muted shrink-0 text-[11px]">⚖️ 律师信息:</span>
            <span className="font-semibold text-[var(--text-primary)]">
              {solSec.data.company} {solSec.data.contact_name ? `· ${solSec.data.contact_name}` : ''} {solSec.data.phone ? `(${solSec.data.phone})` : ''}
            </span>
          </div>
        )}

        {vehSec && vehSec.status === 'confirmed' && vehSec.data?.make && (
          <div className="flex items-start space-x-2">
            <span className="text-muted shrink-0 text-[11px]">🚗 车辆资产:</span>
            <span className="font-semibold text-[var(--text-primary)]">
              {vehSec.data.make} {vehSec.data.model} (${vehSec.data.value?.toLocaleString() || 0})
            </span>
          </div>
        )}

        {supSec && supSec.status === 'confirmed' && supSec.data?.provider && (
          <div className="flex items-start space-x-2">
            <span className="text-muted shrink-0 text-[11px]">🪙 养老金:</span>
            <span className="font-semibold text-[var(--text-primary)]">
              {supSec.data.provider} (${supSec.data.balance?.toLocaleString() || 0})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function FactFindSection({ caseId }: { caseId: string }) {
  // 保持兼容旧调用的全量卡片
  return (
    <div className="space-y-2">
      {['employment_history', 'living_history', 'solicitor_info', 'vehicle_asset', 'super_balance'].map((sec) => (
        <FactFindSingleCard key={sec} caseId={caseId} sectionKey={sec} />
      ))}
    </div>
  );
}
