import { useState } from 'react';
import { motion } from 'motion/react';
import { Database, Server, ShieldCheck, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

export function Migration() {
  const [toast, setToast] = useState<string | null>(null);

  const handleOpenTool = () => {
    setToast('迁移工具接口对接中 TODO(WO-12)');
    setTimeout(() => setToast(null), 3000);
  };

  const steps = [
    {
      num: '01',
      title: '旧库备份 (Data Backup)',
      desc: '自动导出既有数据库完整快照，包含贷款案件主表、全量邮件及历史归档文件。',
      icon: Database,
    },
    {
      num: '02',
      title: '结构转换与迁移 (ETL Migration)',
      desc: '清洗与映射存量客户数据，填充金融敏感字段校验及补齐关联案件流水号。',
      icon: Server,
    },
    {
      num: '03',
      title: '一致性校验 (Consistency Check)',
      desc: '核对贷款金额、LVR 及客户文件 MD5 校验和，确保无丢件及数据完整性。',
      icon: ShieldCheck,
    },
  ];

  return (
    <div
      className="flex-1 p-4 md:p-8 space-y-6 overflow-y-auto no-scrollbar max-w-4xl mx-auto w-full"
      style={{ backgroundColor: 'var(--bg-app)' }}
      id="page-migration"
    >
      {/* 头部标题 */}
      <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs" style={{ backgroundColor: 'var(--accent)' }}>
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              数据迁移 (Data Migration)
            </h1>
            <p className="text-xs text-muted">
              实现旧系统（如传统 CRM/Excel/VBA）向 Vera 工作台的一键迁移
            </p>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleOpenTool}
          className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm flex items-center space-x-1.5 cursor-pointer hover:opacity-90"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <span>查看迁移工具</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </motion.button>
      </div>

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="p-3.5 rounded-2xl border bg-amber-500/10 border-amber-500/20 text-amber-600 text-xs flex items-center space-x-2 font-mono font-semibold"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{toast}</span>
        </motion.div>
      )}

      {/* 三步指南卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.num}
              className="p-5 rounded-2xl border flex flex-col justify-between space-y-4"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-purple-500/10 text-purple-600">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-mono font-bold text-muted">STEP {step.num}</span>
                </div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {step.title}
                </h3>
                <p className="text-xs text-muted leading-relaxed">
                  {step.desc}
                </p>
              </div>

              <div className="pt-2 border-t flex items-center space-x-1 text-[11px] font-mono text-emerald-600 font-semibold" style={{ borderColor: 'var(--border)' }}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>规范已适配</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
