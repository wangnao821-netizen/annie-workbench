import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  FileSpreadsheet,
  Cpu,
  ShieldAlert,
  Clock,
  Sparkles,
} from 'lucide-react';
import { ApiError } from '../../services/http';
import {
  getCalculatorProfiles,
  uploadCalculatorProfile,
  applyCalculatorProfile,
  rollbackCalculatorProfile,
} from '../../services/api/calculator';
import {
  CalculatorProfileInfo,
  CalculatorUploadResult,
} from '../../types/api';

import { useToastStore } from '../../stores/toastStore';

export function CalculatorManager() {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);

  const [profiles, setProfiles] = useState<CalculatorProfileInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<CalculatorUploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Apply state
  const [applying, setApplying] = useState<boolean>(false);

  // Rollback state
  const [rollbackBank, setRollbackBank] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<boolean>(false);

  const fetchProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCalculatorProfiles();
      setProfiles(data);
    } catch (err: any) {
      setError(err?.detail || err?.message || '获取计算器档案失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 20 * 1024 * 1024) {
        showToast('error', '文件大小不可超过 20MB');
        return;
      }
      setSelectedFile(file);
      setUploadResult(null);
      setUploadError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const result = await uploadCalculatorProfile(selectedFile);
      setUploadResult(result);
      showToast('success', `文件分析完成，检测到 ${result.changed_count} 处变更`);
    } catch (err: any) {
      const detail = err instanceof ApiError ? err.detail : err?.message || '上传分析失败';
      setUploadError(detail);
      showToast('error', `上传失败: ${detail}`);
    } finally {
      setUploading(false);
    }
  };

  const handleApply = async () => {
    if (!uploadResult) return;
    setApplying(true);
    try {
      await applyCalculatorProfile(uploadResult.bank, uploadResult.source_hash);
      showToast('success', `${uploadResult.bank} 计算器更新已部署应用于 ${uploadResult.detected_version}`);
      setUploadResult(null);
      setSelectedFile(null);
      await fetchProfiles();
    } catch (err: any) {
      const detail = err instanceof ApiError ? err.detail : err?.message || '更新应用失败';
      showToast('error', `应用失败 (409/Smoke Error): ${detail}`);
    } finally {
      setApplying(false);
    }
  };

  const handleRollback = async (bank: string) => {
    setRollingBack(true);
    try {
      const res = await rollbackCalculatorProfile(bank);
      showToast('success', `${bank} 计算器已成功回滚至 ${res.rolled_back_to}`);
      setRollbackBank(null);
      await fetchProfiles();
    } catch (err: any) {
      const detail = err instanceof ApiError ? err.detail : err?.message || '版本回滚失败';
      showToast('error', `回滚失败: ${detail}`);
    } finally {
      setRollingBack(false);
    }
  };

  const formatVal = (v: any) => {
    if (v === null || v === undefined) return '-';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.length > 25 ? `${s.slice(0, 25)}…` : s;
  };

  return (
    <div className="space-y-6" id="calculator-manager-panel">
      {/* Banner */}
      <div className="rounded-2xl p-5 border shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-[var(--purple-soft)] text-[var(--purple)] flex-shrink-0 mt-0.5">
            <Cpu className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                银行 Servicing 计算器模型管理 (WO-21 Calculator Profiles)
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-[var(--purple-soft)] text-[var(--purple)] font-bold">
                Agent Powered
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              支持上传 6 大主流银行 Excel (.xlsm/.xlsx) 或 YAML/JSON 规则引擎文件。系统会自动解析 Formula/Rates 差异，执行 Smoke 测试并可平滑回滚。
            </p>
          </div>
        </div>

        <motion.button
          whileTap={reduced ? undefined : { scale: 0.95 }}
          onClick={fetchProfiles}
          disabled={loading}
          className="px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center space-x-1.5 hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer self-start md:self-auto flex-shrink-0"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          id="calc-refresh-profiles-btn"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>刷新档案列表</span>
        </motion.button>
      </div>

      {/* Upload & Inspect Section */}
      <div className="rounded-2xl p-6 border space-y-4 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <Upload className="w-4 h-4 text-[var(--purple)]" />
          <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            上传与模型变更比对 (Upload & Smoke Diff Inspection)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="md:col-span-2 space-y-2">
            <label className="text-xs text-muted block font-medium">选择计算器文件 (.xlsm, .xlsx, .yaml, .yml, .json, ≤20MB)</label>
            <div className="flex items-center space-x-3">
              <input
                type="file"
                accept=".xlsm,.xlsx,.yaml,.yml,.json"
                onChange={handleFileChange}
                className="text-xs text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[var(--purple-soft)] file:text-[var(--purple)] dark:file:text-[var(--purple)] hover:file:bg-[var(--purple-soft)] cursor-pointer w-full"
                id="calc-file-input"
              />
            </div>
          </div>

          <motion.button
            whileTap={reduced ? undefined : { scale: 0.96 }}
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer disabled:opacity-40 flex items-center justify-center space-x-2"
            style={{ backgroundColor: 'var(--accent)' }}
            id="calc-upload-submit-btn"
          >
            {uploading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>分析对比中…</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                <span>上传并分析版本 Diff</span>
              </>
            )}
          </motion.button>
        </div>

        {/* Upload Error Banner */}
        {uploadError && (
          <div className="p-3 rounded-xl bg-[var(--red-soft)] border border-[var(--red-soft)] text-[var(--red)] dark:text-[var(--red)] text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        {/* Upload Diff Inspection Card */}
        {uploadResult && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl border space-y-4 bg-[var(--purple-soft)] dark:bg-[var(--purple-soft)] border-[var(--purple-soft)]"
            id="calc-diff-result-panel"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 border-[var(--purple-soft)]">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-[var(--purple)]" />
                <span className="font-extrabold text-xs text-primary">
                  {uploadResult.bank} 计算器检测完成
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-[var(--purple-soft)] text-[var(--purple)] dark:text-[var(--purple)] font-bold">
                  {uploadResult.current_version} ➔ {uploadResult.detected_version}
                </span>
              </div>
              <span className="text-xs font-bold text-[var(--purple)] dark:text-[var(--purple)]">
                共 {uploadResult.changed_count} 项修改
              </span>
            </div>

            {/* Warning or Review Note */}
            {(uploadResult.needs_review || uploadResult.is_new_bank || uploadResult.review_note) && (
              <div className="p-3 rounded-lg bg-[var(--yellow-soft)] border border-[var(--yellow-soft)] text-[var(--yellow)] text-xs flex items-start space-x-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold block">需要审核确认提示:</span>
                  <p>{uploadResult.review_note || '包含未确认的银行模型调整或新增档案，部署前请核对差异。'}</p>
                </div>
              </div>
            )}

            {/* Diff Table */}
            {uploadResult.diff && uploadResult.diff.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-muted block">核心规则与参数变更列表 (Parameter Diff):</span>
                <div className="overflow-x-auto rounded-lg border bg-[var(--bg-subtle)] border-[var(--purple-soft)]">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--purple-soft)] text-muted font-bold">
                        <th className="py-2 px-3">规则路径 (Path)</th>
                        <th className="py-2 px-3">原版本值 (Old Value)</th>
                        <th className="py-2 px-3">新版本值 (New Value)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--purple-soft)]">
                      {uploadResult.diff.map((item, idx) => (
                        <tr key={idx} className="hover:bg-[var(--purple-soft)]">
                          <td className="py-1.5 px-3 font-mono text-[var(--purple)] dark:text-[var(--purple)] font-bold">{item.path}</td>
                          <td className="py-1.5 px-3 text-[var(--red)] font-mono">{formatVal(item.old)}</td>
                          <td className="py-1.5 px-3 text-[var(--green)] font-mono font-bold">{formatVal(item.new)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Apply Action Bar */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-muted">
                点击确认后将执行自动 Smoke 自动化测试并生效版本
              </span>
              <motion.button
                whileTap={reduced ? undefined : { scale: 0.95 }}
                onClick={handleApply}
                disabled={applying}
                className="px-4 py-2 rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center space-x-1.5 disabled:opacity-40"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
                id="calc-apply-btn"
              >
                {applying ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>执行 Smoke 测试并生效…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>确认应用更新 (Apply Profile)</span>
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Profiles Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            当前活跃计算器档案 ({profiles.length} 家支持)
          </h3>
          {error && <span className="text-xs text-[var(--red)]">{error}</span>}
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-muted rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--purple)]" />
            <span>读取计算器模型档案中…</span>
          </div>
        ) : profiles.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
            暂无已配置的计算器档案
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((p, idx) => (
              <motion.div
                key={p.bank || idx}
                whileHover={reduced ? undefined : { y: -1 }}
                className="p-4 rounded-2xl border space-y-3 shadow-2xs flex flex-col justify-between"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-primary flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-[var(--green)]"></span>
                      <span>{p.bank}</span>
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-[var(--green-soft)] text-[var(--green)] font-bold">
                      v{p.version}
                    </span>
                  </div>

                  <p className="text-xs text-secondary font-medium line-clamp-1">{p.name}</p>

                  <div className="text-[11px] text-muted space-y-1 font-mono pt-1">
                    {p.source_file && (
                      <div className="flex items-center space-x-1.5 truncate">
                        <FileSpreadsheet className="w-3 h-3 text-[var(--purple)] flex-shrink-0" />
                        <span className="truncate">{p.source_file}</span>
                      </div>
                    )}
                    {p.effective_date && (
                      <div className="flex items-center space-x-1.5">
                        <Clock className="w-3 h-3 text-[var(--yellow)] flex-shrink-0" />
                        <span>生效日期: {p.effective_date}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Rollback Section */}
                <div className="pt-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-[11px] text-muted font-mono">
                    {p.status === 'active' ? '● 引擎连通中' : p.status}
                  </span>

                  {rollbackBank === p.bank ? (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleRollback(p.bank)}
                        disabled={rollingBack}
                        className="px-2 py-1 rounded text-xs font-bold bg-[var(--red)] text-white cursor-pointer disabled:opacity-40"
                      >
                        {rollingBack ? '回滚中…' : '确认'}
                      </button>
                      <button
                        onClick={() => setRollbackBank(null)}
                        className="px-2 py-1 rounded text-xs font-bold border hover:bg-[var(--bg-subtle)] cursor-pointer text-muted"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRollbackBank(p.bank)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold border hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer text-muted flex items-center space-x-1"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>版本回滚</span>
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
