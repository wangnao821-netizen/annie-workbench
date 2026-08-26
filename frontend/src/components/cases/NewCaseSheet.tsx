import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  X,
  Sparkles,
  HardDrive,
  UserPlus,
  ArrowRight,
  Loader2,
  FolderTree,
  RotateCcw,
} from 'lucide-react';
import { CaseInfo, useCaseStore } from '../../stores/caseStore';
import { useUiStore } from '../../stores/uiStore';
import { mapCaseResponse } from '../../services/caseMapper';
import { createCase, scaffoldCaseFolder } from '../../services/api/cases';
import { pickNativeDirectory } from '../../services/folderPicker';
import { useToastStore } from '../../stores/toastStore';
import { BrandNewCaseForm, BrandNewCaseFormValues } from './newCase/BrandNewCaseForm';
import { FolderTopologyScanner } from './FolderTopologyScanner';

export interface NewCaseSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: (caseInfo: CaseInfo) => void;
}

export type DualTrackMode = 'brand_new' | 'batch_migration';

const LOCAL_STORAGE_PARENT_PATH_KEY = 'everstones_scaffold_parent_path';

const INITIAL_FORM_VALUES: BrandNewCaseFormValues = {
  clientName: '',
  residency: 'Citizen/PR',
  employmentType: 'Self-employed',
  clientPhone: '',
  clientEmail: '',

  lender: 'CBA',
  loanType: 'Purchase',
  docType: 'Alt Doc',
  loanAmount: '850000',
  interestRate: '5.89',

  propertyAddress: '',
  propertyValue: '1100000',

  autoScaffold: true,
  parentPath: typeof window !== 'undefined' ? (localStorage.getItem(LOCAL_STORAGE_PARENT_PATH_KEY) || '') : '',
};

export function NewCaseSheet({ open, onClose, onCreated }: NewCaseSheetProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);
  const { setCurrentCase, fetchCases } = useCaseStore();

  const [activeTrack, setActiveTrack] = useState<DualTrackMode>('brand_new');
  const [formValues, setFormValues] = useState<BrandNewCaseFormValues>(INITIAL_FORM_VALUES);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 初始化读取上次记忆的父目录
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPath = localStorage.getItem(LOCAL_STORAGE_PARENT_PATH_KEY);
      if (savedPath) {
        setFormValues((prev) => ({ ...prev, parentPath: savedPath }));
      }
    }
  }, []);

  // 快捷重置表单
  const handleResetForm = () => {
    const savedPath = localStorage.getItem(LOCAL_STORAGE_PARENT_PATH_KEY) || 'D:\\EverStones_Clients';
    setFormValues({ ...INITIAL_FORM_VALUES, parentPath: savedPath });
    setFieldErrors({});
  };

  // 浏览父目录
  const handleBrowseParentPath = async () => {
    try {
      const selectedPath = await pickNativeDirectory('选择客户档案与案卷父目录');
      if (selectedPath) {
        setFormValues((prev) => ({ ...prev, parentPath: selectedPath }));
        localStorage.setItem(LOCAL_STORAGE_PARENT_PATH_KEY, selectedPath);
      }
    } catch (err) {
      console.error('Pick folder error:', err);
    }
  };

  // 提交新建案件 (通道一)
  const handleSubmitBrandNewCase = async () => {
    // 1. 必填字段校验
    if (!formValues.clientName.trim()) {
      setFieldErrors({ clientName: true });
      showToast('error', '请填写借款人客户姓名');
      return;
    }

    if (!formValues.parentPath || !formValues.parentPath.trim()) {
      setFieldErrors({ parentPath: true });
      showToast('error', '新建案件必须选择或指定客户档案文件夹目录');
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      let finalFolderPath = '';
      const loanAmountNum = parseFloat(formValues.loanAmount.replace(/[^0-9.]/g, '')) || 0;
      const propertyValueNum = parseFloat(formValues.propertyValue.replace(/[^0-9.]/g, '')) || 0;
      const interestRateNum = parseFloat(formValues.interestRate.replace(/[^0-9.]/g, '')) || 5.89;

      // 2. 如果开启了自动创建目录脚手架
      if (formValues.autoScaffold && formValues.parentPath) {
        const cleanType = formValues.loanType || 'Purchase';
        const cleanLender = formValues.lender || 'CBA';
        const cleanAddr = formValues.propertyAddress || 'Main Property';
        const caseFolderName = `1. ${cleanType} - ${cleanLender} - ${cleanAddr}`;

        try {
          const scaffoldRes = await scaffoldCaseFolder({
            parent_path: formValues.parentPath,
            client_name: formValues.clientName.trim(),
            case_name: caseFolderName,
            create_subdirs: true,
          });

          if (scaffoldRes && scaffoldRes.case_folder) {
            finalFolderPath = scaffoldRes.case_folder;
          }
          // 记忆父路径
          localStorage.setItem(LOCAL_STORAGE_PARENT_PATH_KEY, formValues.parentPath);
        } catch (scaffoldErr) {
          console.warn('Scaffold folder call warning:', scaffoldErr);
          // 即使本地目录创建有告警，仍然允许建案并记录规划路径
          finalFolderPath = `${formValues.parentPath.replace(/[\\/]+$/, '')}\\${formValues.clientName.trim()}\\${caseFolderName}`;
        }
      }

      // 3. 调用后端创建案件接口
      const createRes = await createCase({
        client_name: formValues.clientName.trim(),
        lender: formValues.lender || 'CBA',
        loan_amount: loanAmountNum,
        property_value: propertyValueNum,
        interest_rate: interestRateNum,
        loan_type: formValues.loanType,
        doc_type: formValues.docType,
        property_address: formValues.propertyAddress,
        residency: formValues.residency,
        employment_type: formValues.employmentType,
        client_phone: formValues.clientPhone,
        client_email: formValues.clientEmail,
        folder_path: finalFolderPath,
        folder_mode: formValues.autoScaffold ? 'auto' : 'manual',
      });

      const mappedCase = mapCaseResponse(createRes);

      showToast('success', `案件【${mappedCase.clientName}】已成功创建！`);

      // 4. 同步至 Store 与界面
      useUiStore.getState().setWelcomeCaseId(mappedCase.caseId);
      setCurrentCase(mappedCase);
      await fetchCases();
      onCreated(mappedCase);

      // 5. 立即广播跳转事件直达主工作区（中栏 AI 聊天 + 右栏材料清单）
      useUiStore.getState().setRightDeckTab('checklist');
      window.dispatchEvent(
        new CustomEvent('open-case-brain', { detail: mappedCase.caseId })
      );

      // 6. 清理并关闭
      handleResetForm();
      onClose();
    } catch (err: any) {
      console.error('Create case error:', err);
      showToast('error', err?.message || '新建案件失败，请检查网络或后端服务');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 通道二：批量迁移完成回调
  const handleBatchMigrationComplete = async (importedCount: number, activeCaseId?: string) => {
    showToast('success', `成功批量导入 ${importedCount} 个案卷！`);
    await fetchCases();
    if (activeCaseId) {
      window.dispatchEvent(
        new CustomEvent('open-case-detail', { detail: activeCaseId })
      );
    }
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden select-none"
        id="new-case-sheet-modal"
      >
        {/* 背景遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(12px) saturate(160%)',
          }}
        />

        {/* 弹窗主体卡片 */}
        <motion.div
          initial={{ opacity: 0, scale: reduced ? 1 : 0.96, y: reduced ? 0 : 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: reduced ? 1 : 0.96, y: reduced ? 0 : 12 }}
          transition={{ type: 'spring', damping: 26, stiffness: 360 }}
          className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden"
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
                className="p-2.5 rounded-2xl flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--accent-soft)',
                  color: 'var(--accent)',
                }}
              >
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2
                  className="text-base font-extrabold tracking-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  新建案件 / 建档工作台
                </h2>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  极简录入标准案卷 或 一键迁移存量客户多房产拓扑
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {activeTrack === 'brand_new' && (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={handleResetForm}
                  className="px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors flex items-center space-x-1 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-panel)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                  title="重置表单"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>重置</span>
                </motion.button>
              )}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={onClose}
                className="p-2 rounded-xl transition-colors cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </motion.button>
            </div>
          </div>

          {/* 2. 双通道顶部切换 Segmented Control */}
          <div
            className="px-6 pt-3 pb-3 shrink-0 border-b"
            style={{
              backgroundColor: 'var(--bg-panel)',
              borderColor: 'var(--border)',
            }}
          >
            <div
              className="p-1 rounded-2xl border grid grid-cols-2 gap-1.5 relative"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
              }}
            >
              {/* 通道一：全新录入 */}
              <button
                type="button"
                onClick={() => setActiveTrack('brand_new')}
                className="relative py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 z-10 cursor-pointer"
                style={{
                  color: activeTrack === 'brand_new' ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <UserPlus className="w-4 h-4" />
                <span>全新客户 / 案件录入 (Brand New Case)</span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-extrabold hidden sm:inline-block"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    color: 'var(--accent)',
                  }}
                >
                  ★ 推荐 / 主入口
                </span>
                {activeTrack === 'brand_new' && (
                  <motion.div
                    layoutId="track-segmented-indicator"
                    className="absolute inset-0 rounded-xl border shadow-sm -z-10"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--accent)',
                    }}
                    transition={{ type: 'spring', damping: 28, stiffness: 380 }}
                  />
                )}
              </button>

              {/* 通道二：存量迁移 */}
              <button
                type="button"
                onClick={() => setActiveTrack('batch_migration')}
                className="relative py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 z-10 cursor-pointer"
                style={{
                  color: activeTrack === 'batch_migration' ? 'var(--purple)' : 'var(--text-secondary)',
                }}
              >
                <HardDrive className="w-4 h-4" />
                <span>存量案卷批量迁移 (Batch Legacy Migration)</span>
                {activeTrack === 'batch_migration' && (
                  <motion.div
                    layoutId="track-segmented-indicator"
                    className="absolute inset-0 rounded-xl border shadow-sm -z-10"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--purple)',
                    }}
                    transition={{ type: 'spring', damping: 28, stiffness: 380 }}
                  />
                )}
              </button>
            </div>
          </div>

          {/* 3. 主体表单 / 扫描区域 (Scrollable) */}
          <div
            className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar"
            style={{ backgroundColor: 'var(--bg-app)' }}
          >
            {activeTrack === 'brand_new' ? (
              <BrandNewCaseForm
                values={formValues}
                onChange={(patch) =>
                  setFormValues((prev) => ({ ...prev, ...patch }))
                }
                onBrowseParentPath={handleBrowseParentPath}
                errors={fieldErrors}
              />
            ) : (
              <div className="space-y-3" id="batch-migration-embedded-scanner">
                <FolderTopologyScanner
                  onClose={onClose}
                  onImportComplete={handleBatchMigrationComplete}
                />
              </div>
            )}
          </div>

          {/* 4. 底栏操作 Footer (仅在通道一时展示，通道二自身带导入操作) */}
          {activeTrack === 'brand_new' && (
            <div
              className="px-6 py-4 border-t flex items-center justify-between shrink-0"
              style={{
                backgroundColor: 'var(--surface-translucent)',
                borderColor: 'var(--border)',
                backdropFilter: 'blur(20px) saturate(180%)',
              }}
            >
              <div className="text-xs">
                {formValues.autoScaffold && (
                  <span
                    className="flex items-center space-x-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <FolderTree className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                    <span>建案将自动同步 11 级标准本地工作目录</span>
                  </span>
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
                  onClick={handleSubmitBrandNewCase}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md"
                  style={{
                    backgroundColor: 'var(--accent-strong, var(--accent))',
                    color: 'var(--on-accent-strong, #ffffff)',
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在建档中...</span>
                    </>
                  ) : (
                    <>
                      <span>立即创建并进入案件</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
