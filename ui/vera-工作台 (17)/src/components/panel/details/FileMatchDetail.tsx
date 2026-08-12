import { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Clock, FileCheck, FileText } from 'lucide-react';
import { TaskItem, FileMatchResult, ChecklistItemType } from '../../../types';
import { FileMatchItem } from './FileMatchItem';
import { ChecklistPanel } from './ChecklistPanel';
import { FileFieldsPanel, FieldItem } from './FileFieldsPanel';
import { FilePreviewPanel } from './FilePreviewPanel';
import { useToastStore } from '../../../stores/toastStore';

interface FileMatchDetailProps {
  task: TaskItem;
}

const INITIAL_MATCH_RESULTS: FileMatchResult[] = [
  {
    id: "fm-1",
    filename: "Payslip_Jul.pdf",
    status: "matched",
    targetChecklistLabel: "最新工资单",
    extractedInfo: "Payslip_Jul.pdf · 雇主: Tech Corp · 税后: $7,450",
  },
  {
    id: "fm-2",
    filename: "NOA_2025.pdf",
    status: "matched",
    targetChecklistLabel: "2025 NOA",
    extractedInfo: "NOA_2025.pdf · 应税收入: $120,000",
  },
  {
    id: "fm-3",
    filename: "scan_003.pdf",
    status: "unmatched",
    aiSuggestion: "身份证明",
    aiConfidence: 47,
  },
  {
    id: "fm-4",
    filename: "Payslip_Jul.pdf vs Application",
    status: "discrepancy",
    discrepancyText: "Payslip 税后 $7,450 vs 申请表 $7,500 — 差异 $50 (需要核实是否有预提养老金或税费小额扣除)",
  },
];

const MOCK_EXTRACTED_FILES: { fileId: string; filename: string; docType: string; fields: FieldItem[] }[] = [
  {
    fileId: "fm-1",
    filename: "Payslip_Jul.pdf",
    docType: "Payslip",
    fields: [
      { label: "材料日期", value: "2026-07-25", fieldType: "date", confidence: 95 },
      { label: "税前收入", value: "8333", fieldType: "currency", confidence: 92 },
      { label: "税后收入", value: "7450", fieldType: "currency", confidence: 90 },
      { label: "养老金", value: "916", fieldType: "currency", confidence: 88 },
    ],
  },
  {
    fileId: "fm-2",
    filename: "NOA_2025.pdf",
    docType: "TaxReturn",
    fields: [
      { label: "应税收入", value: "120000", fieldType: "currency", confidence: 94 },
      { label: "净租金收入", value: "18500", fieldType: "currency", confidence: 75 },
      { label: "折旧扣除", value: "4200", fieldType: "currency", confidence: 85 },
    ],
  },
  {
    fileId: "fm-3",
    filename: "scan_003.pdf",
    docType: "Passport",
    fields: [
      { label: "材料日期", value: "2026-01-10", fieldType: "date", confidence: 68 },
      { label: "护照号码", value: "E882910**", fieldType: "text", confidence: 72 },
      { label: "材料有效性", value: "2032-05-20", fieldType: "date", confidence: 88 },
    ],
  },
];

const INITIAL_CHECKLIST_ITEMS: ChecklistItemType[] = [
  {
    id: "cl-1",
    label: "有效护照",
    category: "required",
    checked: true,
  },
  {
    id: "cl-2",
    label: "最新 2 期工资单",
    category: "required",
    checked: true,
    fileMatched: "Payslip_Jul.pdf",
  },
  {
    id: "cl-3",
    label: "雇佣确认信 (含试用期说明)",
    category: "required",
    checked: true,
  },
  {
    id: "cl-4",
    label: "近 3 个月银行流水",
    category: "required",
    checked: true,
  },
  {
    id: "cl-5",
    label: "购房合同",
    category: "required",
    checked: true,
  },
  {
    id: "cl-6",
    label: "赠予信",
    category: "ai_suggested",
    checked: true,
    reason: "首付含 $15 万海外父母赠予",
  },
  {
    id: "cl-7",
    label: "赠予资金到账流水",
    category: "ai_suggested",
    checked: true,
    reason: "需证明资金路径",
  },
  {
    id: "cl-8",
    label: "试用期雇主确认",
    category: "ai_suggested",
    checked: false,
    reason: "CBA 可能要求，建议先准备",
  },
];

export function FileMatchDetail({ task }: FileMatchDetailProps) {
  const [matchResults, setMatchResults] = useState<FileMatchResult[]>(INITIAL_MATCH_RESULTS);
  const [checklistItems, setChecklistItems] = useState<ChecklistItemType[]>(INITIAL_CHECKLIST_ITEMS);
  const [previewFile, setPreviewFile] = useState<{ filename: string; docType: string } | null>(null);
  const showToast = useToastStore((s) => s.showToast);

  const handleManualMatch = (fileId: string, label: string) => {
    setMatchResults((prev) =>
      prev.map((item) =>
        item.id === fileId
          ? {
              ...item,
              status: "matched",
              targetChecklistLabel: label,
              extractedInfo: `${item.filename} · 已手动关联到「${label}」`,
            }
          : item
      )
    );
    showToast('success', `已成功将文件关联到「${label}」`);
    // TODO(WO-03): POST /api/files/{id}/match
  };

  const handleMarkIrrelevant = (fileId: string) => {
    setMatchResults((prev) => prev.filter((item) => item.id !== fileId));
    showToast('info', '已将该文件标记为无关文件并忽略');
    // TODO(WO-03): POST /api/files/{id}/mark-irrelevant
  };

  const handleReclassify = (fileId: string, newDocType: string) => {
    showToast('info', `已将文件 (${fileId}) 重新分类为 ${newDocType}`);
    // TODO(WO-03): POST /api/files/${fileId}/reclassify
  };

  const handleToggleChecklistItem = (id: string) => {
    setChecklistItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item))
    );
  };

  const handleAddChecklistItem = (label: string, category: "required" | "ai_suggested" | "optional") => {
    const newItem: ChecklistItemType = {
      id: `cl-custom-${Date.now()}`,
      label,
      category,
      checked: true,
    };
    setChecklistItems((prev) => [...prev, newItem]);
  };

  const handleConfirmAll = () => {
    showToast('success', `✅ 已确认匹配文件并更新 ${task.caseName || 'PERSON_1'} 递交清单状态`);
    // TODO(WO-03): POST /api/files/confirm-all
  };

  const handleSnooze = () => {
    showToast('info', '⏭ 已暂存稍后处理');
    // TODO(WO-03): POST /api/files/snooze
  };

  const checklistOptionLabels = checklistItems.map((i) => i.label);

  return (
    <div className="space-y-6" id="file-match-detail-view">
      {/* 1. File Matching Results Header & List */}
      <div className="rounded-2xl p-5 border space-y-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2">
            <FileCheck className="w-4 h-4" style={{ color: 'var(--green)' }} />
            <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              📎 智能文件自动匹配结果
            </h3>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: 'var(--green-soft)', color: 'var(--green)' }}>
            自动匹配成功 2 项
          </span>
        </div>

        {/* Match Items List */}
        <div className="space-y-2.5">
          {matchResults.map((item) => (
            <div key={item.id}>
              <FileMatchItem
                item={item}
                checklistOptions={checklistOptionLabels}
                onManualMatch={handleManualMatch}
                onMarkIrrelevant={handleMarkIrrelevant}
                onReclassify={handleReclassify}
                onPreviewClick={(fname) => {
                  const found = MOCK_EXTRACTED_FILES.find((f) => f.filename === fname);
                  setPreviewFile({ filename: fname, docType: found?.docType || 'Document' });
                }}
              />
            </div>
          ))}
        </div>

        {/* Actions for Match Confirm */}
        <div className="flex items-center space-x-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleConfirmAll}
            className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer text-white shadow-xs"
            style={{ backgroundColor: 'var(--accent)' }}
            id="file-match-confirm-all-btn"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>✅ 全部确认并保存</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleSnooze}
            className="px-3 py-2 rounded-xl text-xs font-medium flex items-center space-x-1.5 cursor-pointer border"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            id="file-match-snooze-btn"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>⏭ 稍后处理</span>
          </motion.button>
        </div>
      </div>

      {/* 2. Extracted Fields Cards Section */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-purple-500" />
          <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            📄 AI 关键字段智能提取与核对
          </h3>
          <span className="text-[10px] font-mono text-muted">({MOCK_EXTRACTED_FILES.length} 份关键文件)</span>
        </div>

        <div className="space-y-3">
          {MOCK_EXTRACTED_FILES.map((extracted) => (
            <FileFieldsPanel
              key={extracted.fileId}
              fileId={extracted.fileId}
              filename={extracted.filename}
              docType={extracted.docType}
              fields={extracted.fields}
              onPreviewClick={() =>
                setPreviewFile({ filename: extracted.filename, docType: extracted.docType })
              }
            />
          ))}
        </div>
      </div>

      {/* 3. Submission Checklist Panel */}
      <ChecklistPanel
        items={checklistItems}
        onToggleItem={handleToggleChecklistItem}
        onAddItem={handleAddChecklistItem}
      />

      {/* 4. File Preview Drawer */}
      {previewFile && (
        <FilePreviewPanel
          filename={previewFile.filename}
          docType={previewFile.docType}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
