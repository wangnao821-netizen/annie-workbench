import { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Tag, Calendar, User, ExternalLink } from 'lucide-react';

interface KnowledgeItem {
  id: string;
  title: string;
  category: string;
  date: string;
  authorCase: string;
  content: string;
  tags: string[];
}

const MOCK_KNOWLEDGE: KnowledgeItem[] = [
  {
    id: 'k-1',
    title: 'CBA 补件与 OS 条件高效清除技巧',
    category: '银行政策',
    date: '2026-08-01',
    authorCase: 'PERSON_1 案件实战',
    content: 'CBA 补件通常需要 3 个工作日确认。对于自雇人士补充会计师确认信 (Accountant Letter)，可直接在邮件中附带 ABN 注册时间与 GST 注册截屏，提高 Underwriter 一次性通过率。',
    tags: ['CBA', 'OS条件', '会计师信'],
  },
  {
    id: 'k-2',
    title: 'ANZ 18个月 ABN 拒信快速转案 SOP',
    category: '转案策略',
    date: '2026-07-28',
    authorCase: 'PERSON_2 案件总结',
    content: 'ANZ 对自雇 ABN 注册时间硬性要求 24 个月。当遭遇 18 个月 ABN 拒绝时，可以立即整合 12 个月 BAS 报表转批 CBA，CBA 允许配合会计师信审批。',
    tags: ['ANZ', '自雇ABN', 'CBA转案'],
  },
  {
    id: 'k-3',
    title: '海外父母赠予资金 (Gift Fund) 完整合规路径',
    category: '风控合规',
    date: '2026-07-20',
    authorCase: 'PERSON_3 案件实战',
    content: '澳洲四大行针对海外父母赠予款要求严密证据链：① 双方签署的标准 Gift Letter；② 海外银行汇出凭证；③ 澳洲收款账户 3 个月流水（需有进账记录与余额）。',
    tags: ['赠予资金', '资金路径', '合规风控'],
  },
  {
    id: 'k-4',
    title: 'ATO NOA 应税收入与工资单交叉比对规范',
    category: '材料核验',
    date: '2026-07-15',
    authorCase: 'PERSON_4 案件经验',
    content: '比对 Notice of Assessment (NOA) 与 Payslip 时，重点关注 Taxable Income 及 Salary Sacrifice 字段。若差异超过 $100，需要求客户提供雇主 HR 扣减说明信。',
    tags: ['NOA', '工资单比对', '收入核算'],
  },
];

const FILTER_TAGS = ['全部', 'CBA', 'ANZ', 'NAB', 'Westpac', '收入', '清单', '合规', '转案'];

export function GlobalExperienceTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('全部');

  const filtered = MOCK_KNOWLEDGE.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesQuery = item.title.toLowerCase().includes(q) || item.content.toLowerCase().includes(q) || item.tags.some((t) => t.toLowerCase().includes(q));
    const matchesTag = selectedTag === '全部' || item.tags.includes(selectedTag) || item.category.includes(selectedTag);
    return matchesQuery && matchesTag;
  });

  return (
    <div className="space-y-4" id="global-experience-tab">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 搜索团队全局经验库 (关键词/银行/类型)..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border text-xs outline-none bg-transparent shadow-2xs"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            id="experience-search"
          />
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
          {FILTER_TAGS.map((tag) => (
            <motion.button
              key={tag}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelectedTag(tag)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                selectedTag === tag ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-card)] border border-[var(--border)] text-secondary'
              }`}
            >
              {tag}
            </motion.button>
          ))}
        </div>
      </div>

      <p className="text-[11px] font-mono text-muted">
        TODO(WO-03/后端): 需要全局经验库 GET /api/knowledge 端点
      </p>

      <div className="space-y-3">
        {filtered.map((item) => (
          <motion.div
            key={item.id}
            whileHover={{ y: -1 }}
            className="p-4 rounded-2xl border space-y-2.5 transition-transform duration-100"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold" style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    {item.category}
                  </span>
                  <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
                </div>
                <div className="flex items-center space-x-3 text-[11px] font-mono text-muted">
                  <span className="flex items-center space-x-1"><Calendar className="w-3 h-3 text-amber-500" /><span>{item.date}</span></span>
                  <span>•</span>
                  <span className="flex items-center space-x-1"><User className="w-3 h-3 text-blue-500" /><span>{item.authorCase}</span></span>
                </div>
              </div>
              <button className="text-muted hover:text-primary p-1 cursor-pointer">
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>"{item.content}"</p>
            <div className="flex items-center space-x-1.5 pt-1">
              <Tag className="w-3 h-3 text-muted" />
              {item.tags.map((t, idx) => (
                <span key={idx} className="text-[10px] font-mono px-2 py-0.5 rounded-lg border" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  #{t}
                </span>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
