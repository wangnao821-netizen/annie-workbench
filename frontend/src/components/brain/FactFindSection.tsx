import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Briefcase,
  Home,
  Scale,
  Car,
  PiggyBank,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  Save,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
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

interface FactFindSectionProps {
  caseId: string;
}

export function FactFindSection({ caseId }: FactFindSectionProps) {
  const showToast = useToastStore((s) => s.showToast);
  const [loading, setLoading] = useState(false);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [confirmingSection, setConfirmingSection] = useState<string | null>(null);

  const [expandedSection, setExpandedSection] = useState<string | null>('employment_history');

  // Local state for each section
  const [statuses, setStatuses] = useState<Record<string, 'pending' | 'confirmed'>>({
    employment_history: 'pending',
    living_history: 'pending',
    solicitor_info: 'pending',
    vehicle_asset: 'pending',
    super_balance: 'pending',
  });

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

  const fetchSections = async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const res = await getFactFind(caseId);
      if (res && res.sections) {
        const sec = res.sections;
        setStatuses({
          employment_history: sec.employment_history?.status || 'pending',
          living_history: sec.living_history?.status || 'pending',
          solicitor_info: sec.solicitor_info?.status || 'pending',
          vehicle_asset: sec.vehicle_asset?.status || 'pending',
          super_balance: sec.super_balance?.status || 'pending',
        });

        if (Array.isArray(sec.employment_history?.data) && sec.employment_history.data.length > 0) {
          setEmploymentHistory(sec.employment_history.data);
        }
        if (Array.isArray(sec.living_history?.data) && sec.living_history.data.length > 0) {
          setLivingHistory(sec.living_history.data);
        }
        if (sec.solicitor_info?.data && typeof sec.solicitor_info.data === 'object') {
          setSolicitorInfo(sec.solicitor_info.data);
        }
        if (sec.vehicle_asset?.data && typeof sec.vehicle_asset.data === 'object') {
          setVehicleAsset(sec.vehicle_asset.data);
        }
        if (sec.super_balance?.data && typeof sec.super_balance.data === 'object') {
          setSuperBalance(sec.super_balance.data);
        }
      }
    } catch (err: any) {
      console.warn('Load Fact Find error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSections();
  }, [caseId]);

  const handleSave = async (section: string) => {
    setSavingSection(section);
    try {
      let dataPayload: any = {};
      if (section === 'employment_history') dataPayload = employmentHistory;
      else if (section === 'living_history') dataPayload = livingHistory;
      else if (section === 'solicitor_info') dataPayload = solicitorInfo;
      else if (section === 'vehicle_asset') dataPayload = vehicleAsset;
      else if (section === 'super_balance') dataPayload = superBalance;

      await updateFactFindSection(caseId, section, dataPayload);
      showToast('success', '已保存草稿');
    } catch (err: any) {
      showToast('error', err?.message || '保存失败');
    } finally {
      setSavingSection(null);
    }
  };

  const handleConfirm = async (section: string) => {
    setConfirmingSection(section);
    try {
      // 1. 先确保数据保存
      let dataPayload: any = {};
      if (section === 'employment_history') dataPayload = employmentHistory;
      else if (section === 'living_history') dataPayload = livingHistory;
      else if (section === 'solicitor_info') dataPayload = solicitorInfo;
      else if (section === 'vehicle_asset') dataPayload = vehicleAsset;
      else if (section === 'super_balance') dataPayload = superBalance;
      await updateFactFindSection(caseId, section, dataPayload);

      // 2. 调用 confirm 端点写入事件并联动清单
      const res = await confirmFactFindSection(caseId, section);
      setStatuses((prev) => ({ ...prev, [section]: 'confirmed' }));
      showToast(
        'success',
        `已确认录入！${res.checklist_updated ? '材料清单对应信息项已自动勾选已收' : ''}`
      );
    } catch (err: any) {
      showToast('error', err?.message || '确认失败');
    } finally {
      setConfirmingSection(null);
    }
  };

  const sectionsList = [
    {
      key: 'employment_history',
      title: '雇主与工作履历',
      icon: Briefcase,
      count: employmentHistory.filter((e) => e.company).length,
    },
    {
      key: 'living_history',
      title: '居住历史',
      icon: Home,
      count: livingHistory.filter((l) => l.address).length,
    },
    {
      key: 'solicitor_info',
      title: '律师 / 过户师信息',
      icon: Scale,
      count: solicitorInfo.company ? 1 : 0,
    },
    {
      key: 'vehicle_asset',
      title: '车辆资产',
      icon: Car,
      count: vehicleAsset.make ? 1 : 0,
    },
    {
      key: 'super_balance',
      title: 'Super 养老金',
      icon: PiggyBank,
      count: superBalance.provider ? 1 : 0,
    },
  ];

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center space-x-2 text-xs text-muted">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
        <span>正在加载 Fact Find 结构化档案...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3" id="fact-find-container">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
          📋 Fact Find 结构化采集 (WO-77)
        </span>
        <span className="text-[11px] text-muted">双轨录入 · 确认后入账本</span>
      </div>

      <div className="space-y-2">
        {sectionsList.map((sec) => {
          const isExpanded = expandedSection === sec.key;
          const status = statuses[sec.key] || 'pending';
          const Icon = sec.icon;

          return (
            <div
              key={sec.key}
              className="rounded-xl border transition-all overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: isExpanded ? 'var(--accent)' : 'var(--border)',
              }}
            >
              {/* Header */}
              <div
                onClick={() => setExpandedSection(isExpanded ? null : sec.key)}
                className="p-3 flex items-center justify-between cursor-pointer select-none hover:opacity-90"
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs"
                    style={{
                      backgroundColor: status === 'confirmed' ? 'var(--green-soft)' : 'var(--bg-subtle)',
                      color: status === 'confirmed' ? 'var(--green)' : 'var(--text-secondary)',
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                    {sec.title}
                  </span>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {status === 'confirmed' ? (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center space-x-1"
                      style={{ backgroundColor: 'var(--green-soft)', color: 'var(--green)' }}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>已确认</span>
                    </span>
                  ) : (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center space-x-1"
                      style={{ backgroundColor: 'var(--amber-soft)', color: 'var(--amber)' }}
                    >
                      <Clock className="w-3 h-3" />
                      <span>待确认</span>
                    </span>
                  )}

                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted" />
                  )}
                </div>
              </div>

              {/* Collapsible Content Form */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="px-3.5 pb-3.5 pt-1 border-t space-y-3 text-xs"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {/* Section 1: Employment History */}
                    {sec.key === 'employment_history' && (
                      <div className="space-y-2.5">
                        {employmentHistory.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg border space-y-2 relative"
                            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
                          >
                            <div className="flex items-center justify-between text-[11px] font-bold text-muted">
                              <span>履历 #{idx + 1}</span>
                              {employmentHistory.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEmploymentHistory(employmentHistory.filter((_, i) => i !== idx))
                                  }
                                  className="text-[var(--red)] hover:opacity-80 p-0.5 cursor-pointer"
                                  title="删除此行"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-muted block mb-0.5">雇主公司名称</label>
                                <input
                                  type="text"
                                  value={item.company}
                                  onChange={(e) => {
                                    const next = [...employmentHistory];
                                    next[idx].company = e.target.value;
                                    setEmploymentHistory(next);
                                  }}
                                  placeholder="如: Atlassian Pty Ltd"
                                  className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted block mb-0.5">职位/头衔</label>
                                <input
                                  type="text"
                                  value={item.position}
                                  onChange={(e) => {
                                    const next = [...employmentHistory];
                                    next[idx].position = e.target.value;
                                    setEmploymentHistory(next);
                                  }}
                                  placeholder="如: Senior Software Engineer"
                                  className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted block mb-0.5">入职时间</label>
                                <input
                                  type="text"
                                  value={item.start_date || ''}
                                  onChange={(e) => {
                                    const next = [...employmentHistory];
                                    next[idx].start_date = e.target.value;
                                    setEmploymentHistory(next);
                                  }}
                                  placeholder="如: 2022-03"
                                  className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted block mb-0.5">离职时间（在职留空）</label>
                                <input
                                  type="text"
                                  value={item.end_date || ''}
                                  onChange={(e) => {
                                    const next = [...employmentHistory];
                                    next[idx].end_date = e.target.value;
                                    setEmploymentHistory(next);
                                  }}
                                  placeholder="如: Current 或 2025-06"
                                  className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() =>
                            setEmploymentHistory([
                              ...employmentHistory,
                              { company: '', position: '', address: '', phone: '', start_date: '', end_date: '' },
                            ])
                          }
                          className="w-full py-1.5 rounded-lg border border-dashed text-xs font-bold flex items-center justify-center space-x-1 hover:opacity-80 cursor-pointer"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>添加一段工作履历</span>
                        </button>
                      </div>
                    )}

                    {/* Section 2: Living History */}
                    {sec.key === 'living_history' && (
                      <div className="space-y-2.5">
                        {livingHistory.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg border space-y-2 relative"
                            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
                          >
                            <div className="flex items-center justify-between text-[11px] font-bold text-muted">
                              <span>居住地址 #{idx + 1}</span>
                              {livingHistory.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setLivingHistory(livingHistory.filter((_, i) => i !== idx))}
                                  className="text-[var(--red)] hover:opacity-80 p-0.5 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            <div className="space-y-2">
                              <div>
                                <label className="text-[10px] text-muted block mb-0.5">居住地址 (包含 Postcode)</label>
                                <input
                                  type="text"
                                  value={item.address}
                                  onChange={(e) => {
                                    const next = [...livingHistory];
                                    next[idx].address = e.target.value;
                                    setLivingHistory(next);
                                  }}
                                  placeholder="如: 12/88 George St, Sydney NSW 2000"
                                  className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] text-muted block mb-0.5">入住日期</label>
                                  <input
                                    type="text"
                                    value={item.start_date || ''}
                                    onChange={(e) => {
                                      const next = [...livingHistory];
                                      next[idx].start_date = e.target.value;
                                      setLivingHistory(next);
                                    }}
                                    placeholder="如: 2021-01"
                                    className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted block mb-0.5">迁出日期 (当前住址留空)</label>
                                  <input
                                    type="text"
                                    value={item.end_date || ''}
                                    onChange={(e) => {
                                      const next = [...livingHistory];
                                      next[idx].end_date = e.target.value;
                                      setLivingHistory(next);
                                    }}
                                    placeholder="如: Current 或 2024-02"
                                    className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() =>
                            setLivingHistory([...livingHistory, { address: '', start_date: '', end_date: '' }])
                          }
                          className="w-full py-1.5 rounded-lg border border-dashed text-xs font-bold flex items-center justify-center space-x-1 hover:opacity-80 cursor-pointer"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>添加一段居住历史</span>
                        </button>
                      </div>
                    )}

                    {/* Section 3: Solicitor Info */}
                    {sec.key === 'solicitor_info' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">律所/过户行名称</label>
                          <input
                            type="text"
                            value={solicitorInfo.company}
                            onChange={(e) => setSolicitorInfo({ ...solicitorInfo, company: e.target.value })}
                            placeholder="如: Apex Legal Conveyancing"
                            className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">联系人姓名</label>
                          <input
                            type="text"
                            value={solicitorInfo.contact_name}
                            onChange={(e) => setSolicitorInfo({ ...solicitorInfo, contact_name: e.target.value })}
                            placeholder="如: Rachel Miller"
                            className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">电子邮箱</label>
                          <input
                            type="email"
                            value={solicitorInfo.email}
                            onChange={(e) => setSolicitorInfo({ ...solicitorInfo, email: e.target.value })}
                            placeholder="rachel@apexlegal.com.au"
                            className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">联系电话</label>
                          <input
                            type="text"
                            value={solicitorInfo.phone}
                            onChange={(e) => setSolicitorInfo({ ...solicitorInfo, phone: e.target.value })}
                            placeholder="02 9876 5432"
                            className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* Section 4: Vehicle Asset */}
                    {sec.key === 'vehicle_asset' && (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">品牌 (Make)</label>
                          <input
                            type="text"
                            value={vehicleAsset.make}
                            onChange={(e) => setVehicleAsset({ ...vehicleAsset, make: e.target.value })}
                            placeholder="如: Tesla / BMW"
                            className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">车型 (Model)</label>
                          <input
                            type="text"
                            value={vehicleAsset.model}
                            onChange={(e) => setVehicleAsset({ ...vehicleAsset, model: e.target.value })}
                            placeholder="如: Model Y / X5"
                            className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">预估价值 ($)</label>
                          <input
                            type="number"
                            value={vehicleAsset.value || ''}
                            onChange={(e) =>
                              setVehicleAsset({ ...vehicleAsset, value: parseFloat(e.target.value) || 0 })
                            }
                            placeholder="如: 65000"
                            className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* Section 5: Super Balance */}
                    {sec.key === 'super_balance' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">养老金机构 (Provider)</label>
                          <input
                            type="text"
                            value={superBalance.provider}
                            onChange={(e) => setSuperBalance({ ...superBalance, provider: e.target.value })}
                            placeholder="如: AustralianSuper / Hostplus"
                            className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">养老金余额 ($)</label>
                          <input
                            type="number"
                            value={superBalance.balance || ''}
                            onChange={(e) =>
                              setSuperBalance({ ...superBalance, balance: parseFloat(e.target.value) || 0 })
                            }
                            placeholder="如: 185000"
                            className="w-full px-2 py-1.5 rounded border text-xs bg-[var(--bg-card)] border-[var(--border)] focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* Actions bar for this section */}
                    <div className="flex items-center justify-end space-x-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                      <button
                        type="button"
                        onClick={() => handleSave(sec.key)}
                        disabled={savingSection === sec.key}
                        className="px-3 py-1 rounded-lg border text-xs font-bold flex items-center space-x-1 hover:opacity-85 cursor-pointer disabled:opacity-50"
                        style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      >
                        {savingSection === sec.key ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Save className="w-3 h-3 text-muted" />
                        )}
                        <span>暂存草稿</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleConfirm(sec.key)}
                        disabled={confirmingSection === sec.key}
                        className="px-3 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 hover:opacity-90 cursor-pointer shadow-xs disabled:opacity-50"
                        style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
                      >
                        {confirmingSection === sec.key ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        <span>确认录入</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
