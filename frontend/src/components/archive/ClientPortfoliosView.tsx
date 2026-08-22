import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Search,
  Building2,
  Landmark,
  Calendar,
  ChevronDown,
  ChevronUp,
  MapPin,
  Sparkles,
  RefreshCw,
  ExternalLink,
  DollarSign,
} from 'lucide-react';
import { getArchivePortfolio } from '../../services/api/cases';
import { ClientPortfolioItem } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

export function ClientPortfoliosView() {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState<ClientPortfolioItem[]>([]);
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});

  const fetchPortfolio = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getArchivePortfolio(searchQuery);
      if (res.ok) {
        setClients(res.clients || []);
      }
    } catch (err) {
      console.error('Fetch portfolio error:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const toggleExpand = (clientName: string) => {
    setExpandedClients((prev) => ({
      ...prev,
      [clientName]: !prev[clientName],
    }));
  };

  const handleOpenCase = (caseId: string, clientName: string) => {
    window.dispatchEvent(new CustomEvent('open-case-detail', { detail: caseId }));
    showToast('info', `正在载入 ${clientName} (${caseId}) 档案全景详情...`);
  };

  return (
    <div className="space-y-4" id="client-portfolios-container">
      {/* 搜索与控制条 */}
      <div
        className="p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div className="relative w-full sm:flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索客户姓名、机构、名下抵押房产地址..."
            className="w-full pl-9.5 pr-4 py-2 rounded-xl border text-xs outline-none transition-all"
            style={{
              backgroundColor: 'var(--bg-panel)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            id="portfolio-search-input"
          />
        </div>

        <div className="flex items-center space-x-2 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
          <span className="text-xs font-mono text-muted">
            共 <strong className="text-primary font-bold">{clients.length}</strong> 位管理客户
          </span>
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.96 }}
            onClick={fetchPortfolio}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 cursor-pointer hover:opacity-80 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--bg-panel)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </motion.button>
        </div>
      </div>

      {/* 客户资产卡片列表 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="p-5 rounded-2xl border animate-pulse space-y-3"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
              }}
            >
              <div className="h-4 bg-[var(--bg-subtle-strong)] rounded w-1/4" />
              <div className="h-3 bg-[var(--bg-subtle)] rounded w-1/2" />
              <div className="h-10 bg-[var(--bg-subtle)] rounded-xl w-full" />
            </div>
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div
          className="p-12 rounded-2xl border flex flex-col items-center justify-center text-center space-y-2.5"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
          }}
        >
          <Building2 className="w-10 h-10 text-muted" />
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            未找到匹配的客户终生资产档案
          </p>
          <p className="text-xs text-muted max-w-sm">请尝试搜索其他客户名称或清空关键词</p>
        </div>
      ) : (
        <div className="space-y-3.5" id="portfolio-client-list">
          {clients.map((client) => {
            const isExpanded = !!expandedClients[client.client_name];
            return (
              <motion.div
                key={client.client_name}
                className="rounded-2xl border transition-all overflow-hidden"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: isExpanded ? 'var(--accent)' : 'var(--border)',
                  boxShadow: 'var(--shadow-card)',
                }}
                id={`client-portfolio-card-${client.client_name}`}
              >
                {/* 客户资产大卡片头部 */}
                <div
                  onClick={() => toggleExpand(client.client_name)}
                  className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  {/* 左侧：客户姓名与名下房产 */}
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 shadow-xs"
                      style={{
                        backgroundColor: 'var(--accent-soft)',
                        color: 'var(--accent)',
                      }}
                    >
                      {client.client_name.slice(-2)}
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap">
                        <h3
                          className="text-sm font-extrabold tracking-tight"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {client.client_name}
                        </h3>

                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border)] flex items-center space-x-1 font-mono">
                          <span>🏠</span>
                          <span>{client.total_properties_count} 套抵押物业</span>
                        </span>

                        {client.active_opportunities_count > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--red-soft, rgba(239,68,68,0.15))] text-[var(--red, #ef4444)] border border-[var(--red, #ef4444)] flex items-center space-x-1">
                            <Sparkles className="w-3 h-3" />
                            <span>{client.latest_opportunity_title || '活跃商机'}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-muted">
                        <span className="flex items-center space-x-1 font-bold text-primary">
                          <DollarSign className="w-3.5 h-3.5 text-[var(--accent)]" />
                          <span>
                            总贷额: $
                            {client.total_loan_amount >= 1000000
                              ? `${(client.total_loan_amount / 1000000).toFixed(2)}M`
                              : `${(client.total_loan_amount / 10000).toFixed(0)}万`}
                          </span>
                        </span>

                        {client.primary_lender && (
                          <>
                            <span>•</span>
                            <span className="flex items-center space-x-1">
                              <Landmark className="w-3 h-3" />
                              <span>主力机构: {client.primary_lender}</span>
                            </span>
                          </>
                        )}

                        {client.latest_settlement_date && (
                          <>
                            <span>•</span>
                            <span className="flex items-center space-x-1">
                              <Calendar className="w-3 h-3" />
                              <span>最新交割: {client.latest_settlement_date}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 右侧：展开操作提示 */}
                  <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
                    <span className="text-xs font-medium text-muted">
                      {isExpanded ? '收起案卷明细' : '展开名下案卷'}
                    </span>
                    <div className="p-1 rounded-lg bg-[var(--bg-subtle)] text-muted">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </div>

                {/* 展开的房产案卷明细 */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t px-4 sm:px-6 py-4 space-y-3"
                      style={{
                        backgroundColor: 'var(--bg-subtle)',
                        borderColor: 'var(--border)',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted flex items-center space-x-1">
                          <Building2 className="w-3.5 h-3.5" />
                          <span>抵押房产与放款事实明细 ({client.cases_summary.length})</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {client.cases_summary.map((cs) => (
                          <div
                            key={cs.case_id}
                            className="p-3.5 rounded-xl border space-y-2 transition-all hover:border-[var(--accent)]"
                            style={{
                              backgroundColor: 'var(--bg-card)',
                              borderColor: 'var(--border)',
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5 min-w-0">
                                <span className="text-[10px] font-mono text-muted">
                                  {cs.case_id}
                                </span>
                                {cs.property_address && (
                                  <p
                                    className="text-xs font-bold truncate flex items-center space-x-1"
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    <MapPin className="w-3 h-3 text-[var(--accent)] shrink-0" />
                                    <span className="truncate">{cs.property_address}</span>
                                  </p>
                                )}
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--green-soft)] text-[var(--green)] shrink-0">
                                {cs.stage}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-[var(--border)] text-xs font-mono">
                              <div className="flex items-center space-x-2 text-muted">
                                <span className="font-bold text-primary">{cs.lender}</span>
                                <span>•</span>
                                <span>
                                  $
                                  {cs.loan_amount
                                    ? cs.loan_amount >= 10000
                                      ? `${(cs.loan_amount / 10000).toFixed(0)}万`
                                      : cs.loan_amount.toLocaleString()
                                    : '0'}
                                </span>
                                {cs.interest_rate && (
                                  <>
                                    <span>•</span>
                                    <span>{cs.interest_rate}</span>
                                  </>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleOpenCase(cs.case_id, client.client_name)}
                                className="text-xs font-bold text-[var(--accent)] flex items-center space-x-1 cursor-pointer hover:underline"
                              >
                                <span>查看事实</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
