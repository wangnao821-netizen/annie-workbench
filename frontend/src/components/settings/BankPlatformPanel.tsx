import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Landmark, RefreshCw, CheckCircle2, Info, Save } from 'lucide-react';

import { getBanks, getPlatforms, updateBankPlatforms } from '../../services/api/banks';
import { BankItem, PlatformItem } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

export function BankPlatformPanel() {
  const reduced = useReducedMotion();
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [platforms, setPlatforms] = useState<PlatformItem[]>([]);
  const [bankSelectedPlatforms, setBankSelectedPlatforms] = useState<Record<string, string[]>>({});
  const [savingBankKeys, setSavingBankKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [banksRes, platformsRes] = await Promise.all([getBanks(), getPlatforms()]);
      const fetchedBanks = banksRes.banks || [];
      const fetchedPlatforms = platformsRes.platforms || [];
      
      setBanks(fetchedBanks);
      setPlatforms(fetchedPlatforms);

      // Initialize selected platforms mapping
      const initialMap: Record<string, string[]> = {};
      fetchedBanks.forEach((b) => {
        initialMap[b.key] = b.platforms || [];
      });
      setBankSelectedPlatforms(initialMap);
    } catch (err: any) {
      setError(err?.detail || err?.message || '读取银行与平台数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleBankPlatform = (bankKey: string, platformKey: string) => {
    setBankSelectedPlatforms((prev) => {
      const current = prev[bankKey] || [];
      if (current.includes(platformKey)) {
        if (current.length <= 1) {
          useToastStore.getState().showToast('info', '至少需保留 1 个可用平台');
          return prev;
        }
        return { ...prev, [bankKey]: current.filter((p) => p !== platformKey) };
      } else {
        return { ...prev, [bankKey]: [...current, platformKey] };
      }
    });
  };

  const handleSaveConfirm = async (bank: BankItem) => {
    const selected = bankSelectedPlatforms[bank.key] || bank.platforms || [];
    if (savingBankKeys.has(bank.key)) return;

    setSavingBankKeys((prev) => new Set(prev).add(bank.key));
    try {
      const updated = await updateBankPlatforms(bank.key, selected, true);
      
      setBanks((prev) =>
        prev.map((b) =>
          b.key === bank.key
            ? { ...b, platforms: updated.platforms || selected, vera_confirmed: true }
            : b
        )
      );

      useToastStore
        .getState()
        .showToast('success', `${bank.display_name} 银行×平台可用性已成功保存确认`);
    } catch (err: any) {
      useToastStore
        .getState()
        .showToast('error', `${bank.display_name} 保存失败: ${err?.detail || err?.message || '未知错误'}`);
    } finally {
      setSavingBankKeys((prev) => {
        const next = new Set(prev);
        next.delete(bank.key);
        return next;
      });
    }
  };

  const tierABanks = banks.filter((b) => b.tier === 'full');
  const tierBBanks = banks.filter((b) => b.tier !== 'full');

  const renderBankRow = (b: BankItem) => {
    const currentSelected = bankSelectedPlatforms[b.key] || b.platforms || [];
    const isSaving = savingBankKeys.has(b.key);

    return (
      <tr key={b.key} className="hover:bg-[var(--bg-subtle)] transition-colors">
        <td className="py-2.5 px-4 font-bold text-primary">
          {b.display_name} <span className="text-[11px] text-muted font-normal ml-1">({b.name_zh || b.key})</span>
        </td>
        <td className="py-2.5 px-4">
          <span className="px-2 py-0.5 rounded text-xs font-mono font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            {b.type || 'Bank'}
          </span>
        </td>
        <td className="py-2.5 px-4">
          {b.adi ? (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-[var(--green-soft)] text-[var(--green)]">
              ADI 持牌
            </span>
          ) : (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-muted">
              非 ADI
            </span>
          )}
        </td>
        <td className="py-2.5 px-4">
          {b.has_calculator ? (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-[var(--purple-soft)] text-[var(--purple)] dark:text-[var(--purple)]">
              ✓ 计算器
            </span>
          ) : (
            <span className="text-[11px] text-muted font-mono">-</span>
          )}
        </td>
        <td className="py-2.5 px-4">
          <div className="flex flex-wrap gap-1.5 items-center">
            {platforms.map((p) => {
              const isSelected = currentSelected.includes(p.key);
              return (
                <motion.button
                  key={p.key}
                  whileTap={reduced ? undefined : { scale: 0.95 }}
                  onClick={() => toggleBankPlatform(b.key, p.key)}
                  className={`px-2 py-0.5 rounded text-xs font-mono font-medium border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--yellow-soft)] border-[var(--yellow-soft)] text-[var(--yellow)] dark:text-[var(--yellow)] font-bold shadow-2xs'
                      : 'bg-[var(--bg-subtle)] border-[var(--border)] text-muted/60 hover:text-muted hover:border-[var(--yellow-soft)]'
                  }`}
                  title={isSelected ? '点击取消勾选平台' : '点击关联此平台'}
                  id={`platform-chip-${b.key}-${p.key}`}
                >
                  {isSelected ? `✓ ${p.display_name}` : `+ ${p.display_name}`}
                </motion.button>
              );
            })}
          </div>
        </td>
        <td className="py-2.5 px-4 text-right">
          <div className="flex items-center justify-end space-x-2">
            {b.vera_confirmed ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-[var(--green-soft)] text-[var(--green)] inline-flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3 text-[var(--green)]" />
                <span>已确认</span>
              </span>
            ) : (
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-[var(--bg-subtle-strong)] text-muted inline-flex items-center space-x-1">
                <Info className="w-3 h-3 text-muted" />
                <span>待确认</span>
              </span>
            )}

            <motion.button
              whileTap={reduced ? undefined : { scale: 0.95 }}
              onClick={() => handleSaveConfirm(b)}
              disabled={isSaving}
              className="px-2.5 py-1 rounded-lg text-xs font-bold border transition-all flex items-center space-x-1 bg-[var(--yellow-soft)] text-[var(--yellow)] hover:bg-[var(--yellow-soft)] dark:text-[var(--yellow)] border-[var(--yellow-soft)] cursor-pointer disabled:opacity-50"
              id={`save-bank-btn-${b.key}`}
              title="确认当前平台绑定并保存"
            >
              {isSaving ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              <span>保存确认</span>
            </motion.button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6" id="bank-platform-panel">
      {/* Top Banner & Explanation */}
      <div className="rounded-2xl p-5 border shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-[var(--yellow-soft)] text-[var(--yellow)] flex-shrink-0 mt-0.5">
            <Landmark className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                银行与递交平台可用性总览 (Banks & Platforms Directory)
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-[var(--green-soft)] text-[var(--green)] font-bold">
                WO-25 可确认
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              💡 银行×平台可用性可在此确认 (WO-25)，确认结果持久保存。点击行内平台 Chip 增删绑定，点击「保存确认」锁定对接状态。
            </p>
          </div>
        </div>

        <motion.button
          whileTap={reduced ? undefined : { scale: 0.95 }}
          onClick={fetchData}
          disabled={loading}
          className="px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center space-x-1.5 hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer self-start md:self-auto flex-shrink-0"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          id="bank-refresh-btn"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>刷新列表</span>
        </motion.button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-muted rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--yellow)]" />
          <span>加载银行与递交平台数据中…</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-[var(--red-soft)] border border-[var(--red-soft)] text-[var(--red)] text-xs">
          {error}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Tier A Banks */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-extrabold text-primary">A 层核心银行 / ADI 机构 ({tierABanks.length} 家)</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-[var(--yellow-soft)] text-[var(--yellow)] font-bold">
                Priority Tier A
              </span>
            </div>

            <div className="rounded-2xl border overflow-hidden shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b text-muted font-bold" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-app)' }}>
                      <th className="py-2.5 px-4">银行显示名</th>
                      <th className="py-2.5 px-4">机构类型</th>
                      <th className="py-2.5 px-4">ADI 资质</th>
                      <th className="py-2.5 px-4">计算器支持</th>
                      <th className="py-2.5 px-4">可用递交平台</th>
                      <th className="py-2.5 px-4 text-right">人工确认与操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {tierABanks.map((b) => renderBankRow(b))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Section 2: Tier B / Other Banks */}
          {tierBBanks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-extrabold text-primary">B 层 / 区域银行与特约机构 ({tierBBanks.length} 家)</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-muted font-bold">
                  Regional Tier B
                </span>
              </div>

              <div className="rounded-2xl border overflow-hidden shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b text-muted font-bold" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-app)' }}>
                        <th className="py-2.5 px-4">银行显示名</th>
                        <th className="py-2.5 px-4">机构类型</th>
                        <th className="py-2.5 px-4">ADI 资质</th>
                        <th className="py-2.5 px-4">计算器支持</th>
                        <th className="py-2.5 px-4">可用递交平台</th>
                        <th className="py-2.5 px-4 text-right">人工确认与操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {tierBBanks.map((b) => renderBankRow(b))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
