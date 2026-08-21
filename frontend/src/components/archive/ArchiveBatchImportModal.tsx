import { useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  FolderArchive,
  HardDriveDownload,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  RefreshCw,
  CheckSquare,
  Square,
  Calendar,
  Percent,
  Landmark,
  ArrowRight,
  Loader2,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { scanArchiveFolder, batchImportArchive } from '../../services/api/cases';
import { pickNativeDirectory } from '../../services/folderPicker';
import { useToastStore } from '../../stores/toastStore';
import { ArchiveCaseItem, ArchiveScanResponse } from '../../types/api';

interface ArchiveBatchImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ArchiveBatchImportModal({
  open,
  onClose,
  onSuccess,
}: ArchiveBatchImportModalProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);

  const [folderPath, setFolderPath] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<ArchiveScanResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // 执行扫描
  const handleExecuteScan = useCallback(
    async (targetPath?: string) => {
      const pathToScan = (targetPath !== undefined ? targetPath : folderPath).trim();
      if (!pathToScan) {
        showToast('info', '请先选择或输入历史客户案卷目录');
        return;
      }

      setFolderPath(pathToScan);
      setIsScanning(true);
      setScanError(null);

      try {
        const res = await scanArchiveFolder(pathToScan);
        if (!res.ok && res.message) {
          setScanError(res.message);
          setScanResult(null);
          setSelectedPaths(new Set());
        } else {
          setScanResult(res);
          // 默认自动勾选符合归档条件的案卷
          const defaultSelected = new Set<string>();
          res.cases.forEach((c) => {
            if (c.eligible && !c.in_workbench && !c.already_archived) {
              defaultSelected.add(c.folder_path);
            }
          });
          setSelectedPaths(defaultSelected);
        }
      } catch (err: any) {
        console.error('Archive scan error:', err);
        setScanError(err?.message || '扫描历史目录失败，请检查路径权限');
        setScanResult(null);
      } finally {
        setIsScanning(false);
      }
    },
    [folderPath, showToast]
  );

  // 原生系统文件夹选择器
  const handleBrowseNative = async () => {
    try {
      const selected = await pickNativeDirectory();
      if (selected && selected.trim()) {
        const clean = selected.trim();
        setFolderPath(clean);
        handleExecuteScan(clean);
      }
    } catch (err) {
      console.warn('Native picker canceled or failed:', err);
    }
  };

  // 切换单个勾选
  const handleToggleSelect = (item: ArchiveCaseItem) => {
    if (!item.eligible || item.in_workbench || item.already_archived) return;

    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(item.folder_path)) {
        next.delete(item.folder_path);
      } else {
        next.add(item.folder_path);
      }
      return next;
    });
  };

  // 全选 / 全不选符合资格项
  const handleToggleSelectAll = () => {
    if (!scanResult) return;
    const eligibleItems = scanResult.cases.filter(
      (c) => c.eligible && !c.in_workbench && !c.already_archived
    );
    const isAllSelected = eligibleItems.every((c) => selectedPaths.has(c.folder_path));

    if (isAllSelected) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(eligibleItems.map((c) => c.folder_path)));
    }
  };

  // 立即批量归档
  const handleBatchImport = async () => {
    if (!scanResult || selectedPaths.size === 0) return;

    const itemsToImport = scanResult.cases
      .filter((c) => selectedPaths.has(c.folder_path))
      .map((c) => ({
        folder_path: c.folder_path,
        client_name: c.client_name || scanResult.client_name || '客户',
        lender: c.lender,
        loan_amount: c.loan_amount,
        property_address: c.property_address,
        settlement_date: c.settlement_date,
        interest_rate: c.interest_rate,
        status: c.status || 'settled',
      }));

    setIsImporting(true);
    try {
      const res = await batchImportArchive({ items: itemsToImport });
      showToast('success', `已成功归档 ${res.imported_count} 个案卷，并自动提炼沉淀至知识库！`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Batch import error:', err);
      showToast('error', err?.message || '批量归档入库失败，请重试');
    } finally {
      setIsImporting(false);
    }
  };

  if (!open) return null;

  const eligibleCases = scanResult?.cases.filter(
    (c) => c.eligible && !c.in_workbench && !c.already_archived
  ) || [];
  const inWorkbenchCount = scanResult?.cases.filter((c) => c.in_workbench).length || 0;
  const alreadyArchivedCount = scanResult?.cases.filter((c) => c.already_archived).length || 0;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden select-none"
        id="archive-batch-import-modal"
      >
        {/* 背景遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.48)',
            backdropFilter: 'blur(16px) saturate(160%)',
          }}
        />

        {/* 弹窗主体 */}
        <motion.div
          initial={{ opacity: 0, scale: reduced ? 1 : 0.96, y: reduced ? 0 : 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: reduced ? 1 : 0.96, y: reduced ? 0 : 12 }}
          transition={{ type: 'spring', damping: 26, stiffness: 360 }}
          className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-overlay)',
          }}
        >
          {/* 1. 顶部 Header 栏 */}
          <div
            className="px-6 py-4 border-b flex items-center justify-between shrink-0"
            style={{
              backgroundColor: 'var(--surface-translucent)',
              borderColor: 'var(--border)',
              backdropFilter: 'blur(20px) saturate(180%)',
            }}
          >
            <div className="flex items-center space-x-3">
              <div
                className="p-2.5 rounded-2xl flex items-center justify-center shadow-xs"
                style={{
                  backgroundColor: 'var(--accent-soft)',
                  color: 'var(--accent)',
                }}
              >
                <HardDriveDownload className="w-5 h-5" />
              </div>
              <div>
                <h2
                  className="text-base font-extrabold tracking-tight flex items-center space-x-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span>批量导入历史客户案卷</span>
                  <span
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold"
                    style={{
                      backgroundColor: 'var(--bg-panel)',
                      color: 'var(--text-secondary)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    WO-57
                  </span>
                </h2>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  直通本地历史客户目录，智能提取已放款事实并自动防冲突隔离在办案卷
                </p>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onClose}
              className="p-2 rounded-xl transition-colors cursor-pointer hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
              aria-label="关闭"
              id="archive-import-close-btn"
            >
              <X className="w-5 h-5" />
            </motion.button>
          </div>

          {/* 2. 目录选择与搜索栏 */}
          <div
            className="px-6 py-3.5 border-b shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
            style={{
              backgroundColor: 'var(--bg-panel)',
              borderColor: 'var(--border)',
            }}
          >
            <div className="flex-1 relative flex items-center">
              <FolderOpen
                className="w-4 h-4 absolute left-3 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleExecuteScan();
                }}
                placeholder="输入或选择历史客户目录 (如 D:\EverStones_Historical_Clients\Yingkun CHEN)"
                className="w-full pl-9 pr-3 py-2 rounded-xl border text-xs outline-none transition-all"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
                id="archive-import-path-input"
              />
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={handleBrowseNative}
                className="px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 cursor-pointer hover:opacity-90"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
                id="archive-browse-native-btn"
              >
                <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                <span>浏览目录</span>
              </motion.button>


              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => handleExecuteScan()}
                disabled={isScanning || !folderPath.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--on-accent)',
                }}
                id="archive-start-scan-btn"
              >
                {isScanning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>{isScanning ? '扫描中...' : '开始扫描'}</span>
              </motion.button>
            </div>
          </div>

          {/* 3. 主体内容区 (可滚动) */}
          <div
            className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar"
            style={{ backgroundColor: 'var(--bg-app)' }}
          >
            {/* 错误提示 */}
            {scanError && (
              <div
                className="p-4 rounded-2xl border flex items-center justify-between text-xs"
                style={{
                  backgroundColor: 'var(--red-soft, rgba(239, 68, 68, 0.1))',
                  borderColor: 'var(--red-soft, rgba(239, 68, 68, 0.2))',
                  color: 'var(--red, #ef4444)',
                }}
              >
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{scanError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleExecuteScan()}
                  className="font-bold underline cursor-pointer"
                >
                  重试
                </button>
              </div>
            )}

            {/* 状态 A: 初始空状态引导 */}
            {!scanResult && !isScanning && (
              <div
                className="rounded-3xl border p-8 flex flex-col items-center justify-center text-center space-y-5"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                }}
              >
                <div
                  className="w-16 h-16 rounded-3xl flex items-center justify-center shadow-md"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    color: 'var(--accent)',
                  }}
                >
                  <FolderArchive className="w-8 h-8" />
                </div>

                <div className="space-y-1.5 max-w-md">
                  <h3
                    className="text-base font-extrabold tracking-tight"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    点击选择历史客户根目录
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    系统将自动穿透子目录识别结案历史案卷，智能提取放款事实与利率信息
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl text-left">
                  <div
                    className="p-3.5 rounded-2xl border flex items-start space-x-3"
                    style={{
                      backgroundColor: 'var(--bg-panel)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    <Calendar className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                        放款交割日提取
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        自动识别 Final Settlement 凭据与完成日期
                      </p>
                    </div>
                  </div>

                  <div
                    className="p-3.5 rounded-2xl border flex items-start space-x-3"
                    style={{
                      backgroundColor: 'var(--bg-panel)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    <Percent className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                        定案利率与机构抓取
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        自动抓取银行批复利率、产品结构与贷款金额
                      </p>
                    </div>
                  </div>

                  <div
                    className="p-3.5 rounded-2xl border flex items-start space-x-3"
                    style={{
                      backgroundColor: 'var(--bg-panel)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--amber, #f59e0b)' }} />
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                        在办案卷严格防冲突
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        自动检测当前正在工作台推进中的案卷并做隔离保护
                      </p>
                    </div>
                  </div>

                  <div
                    className="p-3.5 rounded-2xl border flex items-start space-x-3"
                    style={{
                      backgroundColor: 'var(--bg-panel)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    <FileText className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                        全量材料索引沉淀
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        保留历史申贷全套资料，供未来转贷或二套房调阅
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* 状态 B: 扫描加载骨架 */}
            {isScanning && (
              <div className="space-y-3">
                <div
                  className="p-4 rounded-2xl border animate-pulse space-y-2.5"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="h-4 bg-[var(--bg-subtle-strong)] rounded-md w-1/4" />
                  <div className="h-3 bg-[var(--bg-subtle)] rounded-md w-1/2" />
                </div>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="p-4 rounded-2xl border animate-pulse space-y-3"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-4 bg-[var(--bg-subtle-strong)] rounded-md w-1/3" />
                      <div className="h-4 bg-[var(--bg-subtle)] rounded-md w-20" />
                    </div>
                    <div className="h-3 bg-[var(--bg-subtle)] rounded-md w-3/4" />
                  </div>
                ))}
              </div>
            )}

            {/* 状态 C: 扫描结果展示 */}
            {scanResult && !isScanning && (
              <div className="space-y-4" id="archive-scan-results-container">
                {/* 统计与全选栏 */}
                <div
                  className="p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className="p-2 rounded-xl flex items-center justify-center font-bold text-xs"
                      style={{
                        backgroundColor: 'var(--accent-soft)',
                        color: 'var(--accent)',
                      }}
                    >
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div>
                      <h4
                        className="text-sm font-extrabold tracking-tight"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        客户主体：{scanResult.client_name || '未命名客户'}
                      </h4>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        扫描识别到 {scanResult.total_found} 个子案卷 · 可归档入库{' '}
                        <strong className="text-[var(--accent)] font-bold">
                          {scanResult.eligible_count}
                        </strong>{' '}
                        个
                        {inWorkbenchCount > 0 && (
                          <span className="ml-2 text-[var(--amber, #f59e0b)] font-medium">
                            (工作台在办过滤 {inWorkbenchCount} 个)
                          </span>
                        )}
                        {alreadyArchivedCount > 0 && (
                          <span className="ml-2 text-[var(--text-muted)]">
                            (已在档案库 {alreadyArchivedCount} 个)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {eligibleCases.length > 0 && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={handleToggleSelectAll}
                      className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 cursor-pointer shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-panel)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {eligibleCases.every((c) => selectedPaths.has(c.folder_path)) ? (
                        <>
                          <CheckSquare className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                          <span>取消全选</span>
                        </>
                      ) : (
                        <>
                          <Square className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                          <span>全选可归档案卷</span>
                        </>
                      )}
                    </motion.button>
                  )}
                </div>

                {/* 案卷卡片流 */}
                <div className="space-y-3">
                  {scanResult.cases.map((item, idx) => {
                    const isSelected = selectedPaths.has(item.folder_path);
                    const isEligible = item.eligible && !item.in_workbench && !item.already_archived;

                    return (
                      <div
                        key={idx}
                        onClick={() => handleToggleSelect(item)}
                        className={`p-4 rounded-2xl border transition-all ${
                          isEligible ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'
                        }`}
                        style={{
                          backgroundColor: isSelected
                            ? 'var(--accent-soft)'
                            : 'var(--bg-card)',
                          borderColor: isSelected
                            ? 'var(--accent)'
                            : item.in_workbench
                            ? 'var(--amber, #f59e0b)'
                            : 'var(--border)',
                        }}
                        id={`archive-case-item-${idx}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          {/* 左侧：勾选框 + 信息 */}
                          <div className="flex items-start space-x-3 min-w-0 flex-1">
                            <div className="pt-0.5 shrink-0">
                              {item.in_workbench ? (
                                <AlertTriangle
                                  className="w-4 h-4"
                                  style={{ color: 'var(--amber, #f59e0b)' }}
                                />
                              ) : item.already_archived ? (
                                <CheckCircle2
                                  className="w-4 h-4"
                                  style={{ color: 'var(--text-muted)' }}
                                />
                              ) : isSelected ? (
                                <CheckSquare
                                  className="w-4 h-4"
                                  style={{ color: 'var(--accent)' }}
                                />
                              ) : (
                                <Square
                                  className="w-4 h-4"
                                  style={{ color: 'var(--text-muted)' }}
                                />
                              )}
                            </div>

                            <div className="space-y-2 flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h5
                                  className="text-sm font-extrabold tracking-tight truncate"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {item.property_address || item.dir_name}
                                </h5>

                                {/* 状态与过滤标签 */}
                                {item.in_workbench && (
                                  <span
                                    className="px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center space-x-1 border"
                                    style={{
                                      backgroundColor: 'var(--amber-soft, rgba(245, 158, 11, 0.12))',
                                      borderColor: 'var(--amber, #f59e0b)',
                                      color: 'var(--amber, #f59e0b)',
                                    }}
                                  >
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>⚠️ 当前正在工作台推进中·已自动过滤</span>
                                  </span>
                                )}

                                {item.already_archived && (
                                  <span
                                    className="px-2.5 py-0.5 rounded-full text-[11px] font-medium border"
                                    style={{
                                      backgroundColor: 'var(--bg-panel)',
                                      borderColor: 'var(--border)',
                                      color: 'var(--text-muted)',
                                    }}
                                  >
                                    已在档案库
                                  </span>
                                )}

                                {isEligible && (
                                  <span
                                    className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border"
                                    style={{
                                      backgroundColor: 'var(--green-soft, rgba(34, 197, 94, 0.1))',
                                      borderColor: 'var(--green, #22c55e)',
                                      color: 'var(--green, #22c55e)',
                                    }}
                                  >
                                    符合归档标准
                                  </span>
                                )}
                              </div>

                              {/* 贷款要素事实 */}
                              <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs">
                                <span
                                  className="flex items-center space-x-1 font-semibold"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  <Landmark className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                                  <span>{item.lender || 'CBA'}</span>
                                  <span className="font-bold">
                                    ${((item.loan_amount || 0) >= 10000
                                      ? (item.loan_amount || 0)
                                      : (item.loan_amount || 0) * 10000
                                    ).toLocaleString()}
                                  </span>
                                </span>

                                {item.settlement_date && (
                                  <span
                                    className="flex items-center space-x-1"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span>放款交割日: {item.settlement_date}</span>
                                  </span>
                                )}

                                {item.interest_rate && (
                                  <span
                                    className="flex items-center space-x-1"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    <Percent className="w-3.5 h-3.5" />
                                    <span>利率: {item.interest_rate}</span>
                                  </span>
                                )}

                                <span
                                  className="flex items-center space-x-1"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>{item.file_count || 0} 个材料文件</span>
                                </span>
                              </div>

                              {/* 本地目录路径提示 */}
                              <p
                                className="text-[11px] truncate font-mono"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                路径: {item.folder_path}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 4. 底栏操作 Footer */}
          <div
            className="px-6 py-4 border-t flex items-center justify-between shrink-0"
            style={{
              backgroundColor: 'var(--surface-translucent)',
              borderColor: 'var(--border)',
              backdropFilter: 'blur(20px) saturate(180%)',
            }}
          >
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {selectedPaths.size > 0 ? (
                <span>
                  已选择{' '}
                  <strong className="text-[var(--accent)] font-bold">
                    {selectedPaths.size}
                  </strong>{' '}
                  个历史案卷准备入库
                </span>
              ) : (
                <span>请扫描并勾选符合归档条件的案卷</span>
              )}
            </div>

            <div className="flex items-center space-x-3">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-panel)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                取消
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={handleBatchImport}
                disabled={isImporting || selectedPaths.size === 0}
                className="px-5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md"
                style={{
                  backgroundColor: 'var(--accent-strong, var(--accent))',
                  color: 'var(--on-accent-strong, #ffffff)',
                }}
                id="archive-confirm-batch-import-btn"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在批量入库中...</span>
                  </>
                ) : (
                  <>
                    <span>立即归档选中案卷 ({selectedPaths.size})</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
