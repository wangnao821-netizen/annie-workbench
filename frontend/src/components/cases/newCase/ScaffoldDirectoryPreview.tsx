import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Folder,
  FolderTree,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  HardDrive,
  Sparkles,
} from 'lucide-react';

interface ScaffoldDirectoryPreviewProps {
  autoScaffold: boolean;
  onToggleAutoScaffold: (enabled: boolean) => void;
  parentPath: string;
  onChangeParentPath: (path: string) => void;
  onBrowseParentPath: () => void;
  clientName: string;
  loanType: string;
  lender: string;
  propertyAddress: string;
}

export const STANDARD_SUBDIRS = [
  { id: '1', name: '1. ID & Application', desc: '身份证明与初始申请表' },
  { id: '2', name: '2. Income & Financials', desc: '收入证明、工资单与财务报表' },
  { id: '3', name: '3. Bank Statements', desc: '银行活期流水与负债账单' },
  { id: '4', name: '4. Property & Valuation', desc: '购房合同/产权与估价报告' },
  { id: '5', name: '5. Send to Lender', desc: '递交银行原始归档包' },
  { id: '6', name: '6. Approval & Conditions', desc: '银行批复函与 OS 补件通知' },
  { id: '7', name: '7. Loan Documents', desc: '正式贷款合同与客户签署件' },
  { id: '8', name: '8. Settlement', desc: '交割结算单与律师函件' },
  { id: '9', name: '9. Commission', desc: '佣金结算明细与发票' },
  { id: '10', name: '10. Post-Settlement', desc: '贷后跟踪与定浮利率调整' },
  { id: '11', name: '11. Correspondence', desc: '银行与客户重要邮件备忘' },
];

export function ScaffoldDirectoryPreview({
  autoScaffold,
  onToggleAutoScaffold,
  parentPath,
  onChangeParentPath,
  onBrowseParentPath,
  clientName,
  loanType,
  lender,
  propertyAddress,
}: ScaffoldDirectoryPreviewProps) {
  const [expandedSubdirs, setExpandedSubdirs] = useState(false);

  const cleanClient = (clientName || '客户名').trim();
  const cleanType = (loanType || 'Purchase').trim();
  const cleanLender = (lender || 'CBA').trim();
  const cleanAddr = (propertyAddress || 'Security Property').trim();
  const normalizedParent = (parentPath || 'C:\\Annie_Clients').replace(/[\\/]+$/, '');

  const generatedCaseFolderName = `1. ${cleanType} - ${cleanLender} - ${cleanAddr}`;
  const fullPreviewPath = `${normalizedParent}\\${cleanClient}\\${generatedCaseFolderName}`;

  return (
    <div
      className="p-4 rounded-2xl border transition-all space-y-3.5"
      style={{
        backgroundColor: 'var(--bg-panel)',
        borderColor: autoScaffold ? 'var(--accent)' : 'var(--border)',
      }}
      id="directory-scaffolding-card"
    >
      {/* 标题与开关 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div
            className="p-2 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: 'var(--accent-soft)',
              color: 'var(--accent)',
            }}
          >
            <FolderTree className="w-4 h-4" />
          </div>
          <div>
            <h3
              className="text-xs font-bold flex items-center space-x-2"
              style={{ color: 'var(--text-primary)' }}
            >
              <span>本地工作目录自动脚手架</span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold"
                style={{
                  backgroundColor: 'var(--green-soft)',
                  color: 'var(--green)',
                }}
              >
                标准 11 级案卷结构
              </span>
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              一键在本地或云同步网盘生成标准的客户与贷款案卷层级目录
            </p>
          </div>
        </div>

        {/* 优雅 Switch */}
        <label className="flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoScaffold}
            onChange={(e) => onToggleAutoScaffold(e.target.checked)}
            className="sr-only peer"
          />
          <div
            className="w-10 h-5.5 rounded-full peer relative transition-colors duration-200 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all after:duration-200 peer-checked:after:translate-x-4.5"
            style={{
              backgroundColor: autoScaffold ? 'var(--accent)' : 'var(--border)',
            }}
          />
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {autoScaffold ? '已开启' : '已关闭'}
          </span>
        </label>
      </div>

      {autoScaffold && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-3 pt-2 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          {/* 父目录选择 */}
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold flex items-center justify-between"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="flex items-center space-x-1.5">
                <HardDrive className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                <span>客户档案根目录 (Parent Directory)</span>
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                自动记住上次选择
              </span>
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={parentPath}
                onChange={(e) => onChangeParentPath(e.target.value)}
                placeholder="例如 D:\EverStones_Clients"
                className="flex-1 px-3 py-2 rounded-xl border text-xs font-mono transition-colors"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={onBrowseParentPath}
                className="px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 transition-colors shrink-0 cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
                id="brand-new-case-browse-parent-btn"
              >
                <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                <span>更改 / 浏览</span>
              </motion.button>
            </div>
          </div>

          {/* 实时动态路径预览 */}
          <div
            className="p-3 rounded-xl border space-y-1.5"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              borderColor: 'var(--border)',
            }}
          >
            <div className="flex items-center justify-between text-[11px]">
              <span
                className="font-medium flex items-center space-x-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                <span>实时规划案卷路径：</span>
              </span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                建案后即刻完成初始化
              </span>
            </div>
            <div
              className="font-mono text-xs break-all leading-relaxed flex items-start space-x-2 p-2.5 rounded-lg border"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                color: 'var(--accent)',
              }}
            >
              <Folder className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
              <span className="font-semibold">{fullPreviewPath}\</span>
            </div>
          </div>

          {/* 11个标准子文件夹折叠面板 */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              borderColor: 'var(--border)',
            }}
          >
            <button
              type="button"
              onClick={() => setExpandedSubdirs(!expandedSubdirs)}
              className="w-full px-3 py-2 text-xs flex items-center justify-between transition-colors text-left"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="flex items-center space-x-1.5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
                <span>将自动创建 11 个标准子文件夹</span>
              </span>
              <span
                className="flex items-center space-x-1 text-[11px] font-semibold"
                style={{ color: 'var(--accent)' }}
              >
                <span>{expandedSubdirs ? '收起目录清单' : '展开查看 11 项清单'}</span>
                {expandedSubdirs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            </button>

            {expandedSubdirs && (
              <div
                className="p-3 pt-2 grid grid-cols-1 md:grid-cols-2 gap-2 border-t text-[11px] font-mono"
                style={{ borderColor: 'var(--border)' }}
              >
                {STANDARD_SUBDIRS.map((subdir) => (
                  <div
                    key={subdir.id}
                    className="p-2 rounded-lg border flex items-start space-x-2"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    <Folder className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                    <div className="min-w-0">
                      <div className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {subdir.name}
                      </div>
                      <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                        {subdir.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
