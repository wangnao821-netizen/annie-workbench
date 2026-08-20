import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  FileText,
  Upload,
  Loader2,
  CheckCircle2,
  X,
} from 'lucide-react';
import { parseCaseText, parseCaseFile } from '../../../services/api/cases';
import { BrandNewCaseFormValues } from './BrandNewCaseForm';
import { useToastStore } from '../../../stores/toastStore';

interface AiQuickPrefillCardProps {
  onApplyPrefill: (patch: Partial<BrandNewCaseFormValues>) => void;
}

type PrefillMode = 'text' | 'file';

const QUICK_EXAMPLES = [
  {
    title: '购房例：李明 CBA 85万 自雇 PR',
    text: '客户李明，PR身份，自雇ABN满3年。拟在CBA申请Purchase购房贷款85万，抵押房产估值110万，地址123 George St, Sydney NSW 2000，期望利率5.89%，手机0412345678。',
  },
  {
    title: '转贷例：王芳 ANZ 120万 PAYG',
    text: '客户王芳 (Wang Fang)，澳洲公民，全职IT工程师(PAYG)。申请ANZ Refinance转贷120万，房屋总值160万，地址88 Pitt St, Sydney，Alt Doc材料，期望利率6.14%。',
  },
  {
    title: '商业例：David Zhang ORDE 150万',
    text: '申请人David Zhang，自雇公司名义，申请ORDE商业贷款150万，抵押物业价值200万，地址50 Collins St, Melbourne VIC 3000。',
  },
];

export function AiQuickPrefillCard({ onApplyPrefill }: AiQuickPrefillCardProps) {
  const showToast = useToastStore((s) => s.showToast);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<PrefillMode>('text');
  const [rawText, setRawText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [extractedSummary, setExtractedSummary] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // 辅助解析金额工具
  const parseAmountToNumber = (val: any): number => {
    if (typeof val === 'number') {
      return val < 10000 ? val * 10000 : val;
    }
    if (typeof val === 'string') {
      const clean = val.replace(/[^0-9.]/g, '');
      const num = parseFloat(clean);
      if (isNaN(num)) return 0;
      if (val.includes('万') || num < 10000) {
        return num * 10000;
      }
      return num;
    }
    return 0;
  };

  // 统一应用预填数据
  const applyExtractedData = (data: any, sourceDesc: string) => {
    const patch: Partial<BrandNewCaseFormValues> = {};
    const extractedFields: string[] = [];

    if (data.client_name) {
      patch.clientName = data.client_name;
      extractedFields.push(`客户: ${data.client_name}`);
    }
    if (data.lender) {
      patch.lender = data.lender;
      extractedFields.push(`机构: ${data.lender}`);
    }
    if (data.loan_amount) {
      const amt = parseAmountToNumber(data.loan_amount);
      if (amt > 0) {
        patch.loanAmount = String(amt);
        extractedFields.push(`贷款: $${amt.toLocaleString()}`);
      }
    }
    if (data.property_value) {
      const pval = parseAmountToNumber(data.property_value);
      if (pval > 0) {
        patch.propertyValue = String(pval);
        extractedFields.push(`房值: $${pval.toLocaleString()}`);
      }
    }
    if (data.interest_rate) {
      patch.interestRate = String(data.interest_rate);
    }
    if (data.property_address) {
      patch.propertyAddress = data.property_address;
      extractedFields.push(`地址: ${data.property_address}`);
    }
    if (data.purpose || data.loan_type) {
      const pur = (data.purpose || data.loan_type || '').toLowerCase();
      if (pur.includes('refinance') || pur.includes('转贷')) patch.loanType = 'Refinance';
      else if (pur.includes('commercial') || pur.includes('商业')) patch.loanType = 'Commercial';
      else if (pur.includes('construction') || pur.includes('建筑')) patch.loanType = 'Construction';
      else patch.loanType = 'Purchase';
    }
    if (data.employment_type) {
      const emp = (data.employment_type || '').toLowerCase();
      if (emp.includes('self') || emp.includes('自雇') || emp.includes('abn')) patch.employmentType = 'Self-employed';
      else if (emp.includes('company') || emp.includes('公司')) patch.employmentType = 'Company';
      else if (emp.includes('invest') || emp.includes('投资') || emp.includes('租金')) patch.employmentType = 'Investment';
      else patch.employmentType = 'PAYG';
    }
    if (data.residency) {
      const res = (data.residency || '').toLowerCase();
      if (res.includes('tr') || res.includes('485') || res.includes('482')) patch.residency = 'TR';
      else if (res.includes('foreign') || res.includes('海外')) patch.residency = 'Foreign';
      else if (res.includes('citizen') || res.includes('pr') || res.includes('公民') || res.includes('永久')) patch.residency = 'Citizen/PR';
      else patch.residency = 'Other';
    }
    if (data.client_phone) patch.clientPhone = data.client_phone;
    if (data.client_email) patch.clientEmail = data.client_email;

    // 智能补充：如果地址为空但有匹配到城市/街道文本
    if (!patch.propertyAddress && sourceDesc) {
      const addrMatch = sourceDesc.match(/\b\d+[\w\s,]+(?:St|Street|Rd|Road|Ave|Avenue|Close|Cres|Ct|Dr|Drive|Way|NSW|VIC|QLD|WA|SA)\b/i);
      if (addrMatch) {
        patch.propertyAddress = addrMatch[0].trim();
      }
    }

    onApplyPrefill(patch);
    setExtractedSummary(extractedFields.length > 0 ? extractedFields.join(' · ') : '已提取核心字段并预填至下方表单');
    showToast('success', 'AI 极速预填成功！已自动填入下方表单。');
  };

  // 1. 提交文本解析
  const handleParseText = async () => {
    if (!rawText.trim()) {
      showToast('error', '请输入或粘贴需要解析的文字内容');
      return;
    }

    setIsLoading(true);
    setExtractedSummary(null);

    try {
      // 客户端智能启发式快速提取（提供即时超快响应）
      const text = rawText.trim();
      const clientNameMatch = text.match(/(?:客户|申请人|借款人|姓名|Name)[:：\s]*([^\s,，。]+)/i) || text.match(/^([^\s,，。]{2,15})/);
      const lenderMatch = text.match(/\b(CBA|ANZ|Westpac|NAB|Macquarie|ORDE|Latrobe|Pepper|Bankwest|St George|ING|Suncorp)\b/i);
      const loanAmtMatch = text.match(/(?:贷款|借款|额度|Loan|借)[:：\s]*\$?(\d+(?:\.\d+)?)\s*(万|k|m)?/i);
      const propValMatch = text.match(/(?:房屋|房产|估值|价值|Property|总价|估价)[:：\s]*\$?(\d+(?:\.\d+)?)\s*(万|k|m)?/i);
      const rateMatch = text.match(/(\d+\.\d+)%/);
      const phoneMatch = text.match(/04\d{2}[\s-]?\d{3}[\s-]?\d{3}/);
      const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
      const addrMatch = text.match(/(?:地址|物业|位于)[:：\s]*([^,，。\n]+)/i) || text.match(/\d+[\w\s,]+(?:St|Street|Rd|Road|Ave|Avenue|Close|Cres|Ct|Dr|Drive|Way|Sydney|Melbourne|Brisbane|NSW|VIC|QLD)/i);

      let parsedData: any = {};
      try {
        const res = await parseCaseText(text);
        if (res && res.prefilled) {
          parsedData = { ...res.prefilled };
        }
      } catch {
        // 后端或离线回退
      }

      // 融合启发式提取
      if (clientNameMatch && !parsedData.client_name) parsedData.client_name = clientNameMatch[1].trim();
      if (lenderMatch && !parsedData.lender) parsedData.lender = lenderMatch[1].toUpperCase();
      if (loanAmtMatch && !parsedData.loan_amount) {
        const num = parseFloat(loanAmtMatch[1]);
        const unit = loanAmtMatch[2]?.toLowerCase();
        parsedData.loan_amount = unit === '万' ? num * 10000 : unit === 'm' ? num * 1000000 : unit === 'k' ? num * 1000 : num;
      }
      if (propValMatch && !parsedData.property_value) {
        const num = parseFloat(propValMatch[1]);
        const unit = propValMatch[2]?.toLowerCase();
        parsedData.property_value = unit === '万' ? num * 10000 : unit === 'm' ? num * 1000000 : unit === 'k' ? num * 1000 : num;
      }
      if (rateMatch && !parsedData.interest_rate) parsedData.interest_rate = parseFloat(rateMatch[1]);
      if (phoneMatch && !parsedData.client_phone) parsedData.client_phone = phoneMatch[0];
      if (emailMatch && !parsedData.client_email) parsedData.client_email = emailMatch[0];
      if (addrMatch && !parsedData.property_address) parsedData.property_address = (addrMatch[1] || addrMatch[0]).trim();

      if (text.includes('自雇') || text.includes('ABN')) parsedData.employment_type = 'Self-employed';
      if (text.includes('PAYG') || text.includes('全职')) parsedData.employment_type = 'PAYG';
      if (text.includes('PR') || text.includes('公民') || text.includes('Citizen')) parsedData.residency = 'Citizen/PR';
      if (text.includes('转贷') || text.includes('Refinance')) parsedData.loan_type = 'Refinance';
      if (text.includes('购房') || text.includes('Purchase')) parsedData.loan_type = 'Purchase';

      applyExtractedData(parsedData, text);
    } catch (err: any) {
      console.error('Parse text error:', err);
      showToast('error', '文本解析失败，请检查格式');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. 提交文件解析
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsLoading(true);
    setExtractedSummary(null);

    try {
      const res = await parseCaseFile(file);
      if (res && res.prefilled) {
        applyExtractedData(res.prefilled, res.text_preview || file.name);
      } else {
        showToast('error', '文件未能识别出有效贷款信息');
      }
    } catch (err: any) {
      console.error('Parse file error:', err);
      showToast('error', err?.message || '文件解析失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      className="p-4 rounded-2xl border transition-all space-y-3 relative overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--purple)',
        boxShadow: '0 4px 20px -4px var(--purple-soft)',
      }}
      id="ai-quick-prefill-card"
    >
      {/* 顶部标题栏与模式切换 */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center space-x-2.5">
          <div
            className="p-2 rounded-xl flex items-center justify-center shadow-xs shrink-0"
            style={{
              backgroundColor: 'var(--purple)',
              color: 'var(--on-purple)',
            }}
          >
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3
              className="text-xs font-extrabold flex items-center space-x-2"
              style={{ color: 'var(--text-primary)' }}
            >
              <span>AI 极速预填助手 (AI Quick-Fill)</span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: 'var(--purple-soft)',
                  color: 'var(--purple)',
                }}
              >
                ★ 智能提取
              </span>
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              粘贴微信沟通记录、客户一句话，或拖入贷款文件，AI 自动提取并预填下方全部字段
            </p>
          </div>
        </div>

        {/* 模式切换 (文字 / 文件) */}
        <div
          className="p-0.5 rounded-xl border flex items-center shrink-0 self-start sm:self-auto"
          style={{
            backgroundColor: 'var(--bg-input)',
            borderColor: 'var(--border)',
          }}
        >
          <button
            type="button"
            onClick={() => setMode('text')}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer"
            style={{
              backgroundColor: mode === 'text' ? 'var(--bg-card)' : 'transparent',
              color: mode === 'text' ? 'var(--purple)' : 'var(--text-secondary)',
              boxShadow: mode === 'text' ? 'var(--shadow-sm)' : 'none',
            }}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>文字/微信粘贴</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('file')}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer"
            style={{
              backgroundColor: mode === 'file' ? 'var(--bg-card)' : 'transparent',
              color: mode === 'file' ? 'var(--purple)' : 'var(--text-secondary)',
              boxShadow: mode === 'file' ? 'var(--shadow-sm)' : 'none',
            }}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>上传/拖入文件</span>
          </button>
        </div>
      </div>

      {/* 快捷示例一键填入 (仅文字模式) */}
      {mode === 'text' && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
            快速示例：
          </span>
          {QUICK_EXAMPLES.map((ex, idx) => (
            <button
              type="button"
              key={idx}
              onClick={() => setRawText(ex.text)}
              className="text-[10px] px-2 py-0.5 rounded-lg border font-medium transition-all cursor-pointer hover:opacity-85"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              {ex.title}
            </button>
          ))}
        </div>
      )}

      {/* 模式一：文字/微信沟通粘贴 */}
      {mode === 'text' ? (
        <div className="space-y-2">
          <div className="relative">
            <textarea
              rows={2}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="粘贴客户微信消息、邮件记录，例如：'客户李明，PR，自雇，想在 CBA 做 Purchase 贷款 85 万，房屋估价 110 万，地址 123 George St Sydney'..."
              className="w-full px-3 py-2 rounded-xl border text-xs leading-relaxed transition-colors resize-none pr-20 focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            {rawText && (
              <button
                type="button"
                onClick={() => setRawText('')}
                className="absolute right-2.5 top-2.5 p-1 rounded-md text-xs transition-colors cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
                title="清空文本"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              支持中英文混排、银行/房产缩写、带币种符号文本
            </span>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={handleParseText}
              disabled={isLoading || !rawText.trim()}
              className="px-4 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--purple)',
                color: 'var(--on-purple)',
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>智能提取中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI 智能提取并填入 ➔</span>
                </>
              )}
            </motion.button>
          </div>
        </div>
      ) : (
        /* 模式二：文件拖拽上传 */
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.txt"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
            className="hidden"
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className="p-5 rounded-xl border-2 border-dashed flex flex-col items-center justify-center space-y-2 cursor-pointer transition-all text-center"
            style={{
              backgroundColor: isDragOver ? 'var(--purple-soft)' : 'var(--bg-input)',
              borderColor: isDragOver ? 'var(--purple)' : 'var(--border)',
            }}
          >
            <div
              className="p-3 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: 'var(--bg-card)',
                color: 'var(--purple)',
              }}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Upload className="w-5 h-5" />
              )}
            </div>
            <div>
              <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                {isLoading ? '正在解析文件并提取贷款事实...' : '点击选择 或 将客户申请表/材料拖入此处'}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                支持 PDF、Word (.docx)、申请表截图 (.png/.jpg) 或 文本文件
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 提取结果提示条 */}
      {extractedSummary && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-2.5 rounded-xl border flex items-center justify-between text-xs font-medium"
          style={{
            backgroundColor: 'var(--green-soft)',
            borderColor: 'rgba(5, 150, 105, 0.3)',
            color: 'var(--green)',
          }}
        >
          <div className="flex items-center space-x-2 truncate">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="truncate">已自动填入：{extractedSummary}</span>
          </div>
          <span className="text-[11px] font-bold shrink-0 ml-2">可核对并修改</span>
        </motion.div>
      )}
    </div>
  );
}
