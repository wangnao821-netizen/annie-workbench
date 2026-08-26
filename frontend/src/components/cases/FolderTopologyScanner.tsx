import { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertTriangle, Users } from 'lucide-react';
import {
  FolderTopologyScanResponse,
  ClientTopologyMeta,
  CaseSubfolderMeta,
  BatchTopologyImportItem,
  TopologyScanSummary,
} from '../../types/api';
import { scanFolderTopology, batchTopologyImport } from '../../services/api/cases';
import { useCaseStore } from '../../stores/caseStore';
import { useToastStore } from '../../stores/toastStore';
import { TopologyScanHeader } from './topology/TopologyScanHeader';
import { TopologySummaryStats, ClientFilterCategory } from './topology/TopologySummaryStats';
import { ClientAccordionCard } from './topology/ClientAccordionCard';
import { TopologyImportActionBar } from './topology/TopologyImportActionBar';

interface FolderTopologyScannerProps {
  initialFolderPath?: string;
  onClose?: () => void;
  onImportComplete?: (importedCount: number, activeCaseId?: string) => void;
}

export function FolderTopologyScanner({
  initialFolderPath = '',
  onClose,
  onImportComplete,
}: FolderTopologyScannerProps) {
  const [folderPath, setFolderPath] = useState(initialFolderPath);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<FolderTopologyScanResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Filters and UI states
  const [activeCategory, setActiveCategory] = useState<ClientFilterCategory>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [expandedClientNames, setExpandedClientNames] = useState<Set<string>>(new Set());

  // Selected folder paths
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Import states & Progress
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importProgressText, setImportProgressText] = useState('');

  // Normalize scan results to always have clients list
  const normalizedClients: ClientTopologyMeta[] = useMemo(() => {
    if (!scanResult) return [];

    if (scanResult.clients && scanResult.clients.length > 0) {
      return scanResult.clients;
    }

    // Fallback for single-client scan
    if (scanResult.cases && scanResult.cases.length > 0) {
      const clientName = scanResult.client_name || '客户主体';
      const category: 'multi_case' | 'single_case' =
        scanResult.cases.length > 1 ? 'multi_case' : 'single_case';
      return [
        {
          client_name: clientName,
          client_category: category,
          cases: scanResult.cases,
        },
      ];
    }

    return [];
  }, [scanResult]);

  // Derived overall cases
  const allCases: CaseSubfolderMeta[] = useMemo(() => {
    return normalizedClients.flatMap((c) => c.cases);
  }, [normalizedClients]);

  // Derived summary
  const summary: TopologyScanSummary = useMemo(() => {
    if (scanResult?.summary) return scanResult.summary;

    const multiCount = normalizedClients.filter((c) => c.client_category === 'multi_case').length;
    const singleCount = normalizedClients.filter((c) => c.client_category === 'single_case').length;
    const leadCount = normalizedClients.filter((c) => c.client_category === 'lead').length;
    const recActiveCount = allCases.filter((c) => c.is_recommended_active).length;

    return {
      total_clients: normalizedClients.length,
      multi_case_clients: multiCount,
      single_case_clients: singleCount,
      lead_clients: leadCount,
      total_cases: allCases.length,
      recommended_active_cases: recActiveCount,
    };
  }, [scanResult, normalizedClients, allCases]);

  // Execute folder scan
  const performScan = async (targetPath: string) => {
    if (!targetPath || !targetPath.trim()) {
      setScanResult(null);
      setScanError(null);
      return;
    }

    setScanning(true);
    setScanError(null);
    try {
      const res = await scanFolderTopology(targetPath);
      if (!res.ok) {
        setScanError(res.message || '未能识别客户大根目录拓扑，请检查路径是否正确');
        setScanResult(null);
      } else {
        setScanResult(res);

        // Compute clients
        const clientsList =
          res.clients && res.clients.length > 0
            ? res.clients
            : [
                {
                  client_name: res.client_name || '客户主体',
                  client_category: (res.cases?.length || 0) > 1 ? 'multi_case' : 'single_case',
                  cases: res.cases || [],
                } as ClientTopologyMeta,
              ];

        // 默认勾选策略：
        // 1. 活跃且推荐案卷 (active/onhold + is_recommended_active) -> 默认勾选
        // 2. 历史结案 (settled) / 终止 (closed) -> 默认不勾选
        // 3. 潜客 (lead) -> 默认不勾选
        const defaultSelected = new Set<string>();
        const defaultExpanded = new Set<string>();

        clientsList.forEach((cl) => {
          let hasRecActive = false;
          cl.cases.forEach((cs) => {
            if (cs.is_recommended_active && cs.status !== 'settled' && cs.status !== 'closed' && cs.status !== 'lead') {
              defaultSelected.add(cs.folder_path);
              hasRecActive = true;
            } else if (cs.status === 'active' && !cl.cases.some((other) => other.is_recommended_active)) {
              defaultSelected.add(cs.folder_path);
              hasRecActive = true;
            }
          });
          // 智能折叠策略：默认仅展开包含推荐活跃主案的客户卡片，历史已结案与潜客默认折叠，保持首屏清爽不卡顿
          if (hasRecActive) {
            defaultExpanded.add(cl.client_name);
          }
        });

        setSelectedPaths(defaultSelected);
        setExpandedClientNames(defaultExpanded);
        setActiveCategory('all');
        setSearchKeyword('');
      }
    } catch (err: any) {
      setScanError(err?.message || '扫描客户文件夹拓扑发生错误');
      setScanResult(null);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (initialFolderPath) {
      performScan(initialFolderPath);
    }
  }, [initialFolderPath]);

  // 搜索处理与即时自动展开匹配项
  const handleSearchChange = (kw: string) => {
    setSearchKeyword(kw);
    if (kw.trim()) {
      const lower = kw.trim().toLowerCase();
      const matchedNames = new Set<string>();
      normalizedClients.forEach((c) => {
        const matchName = c.client_name.toLowerCase().includes(lower);
        const matchReferrer = c.referrer_name?.toLowerCase().includes(lower);
        const matchCo = c.co_borrowers?.some((co) => co.toLowerCase().includes(lower));
        const matchCase = c.cases.some(
          (cs) =>
            cs.dir_name.toLowerCase().includes(lower) ||
            cs.lender?.toLowerCase().includes(lower) ||
            cs.property_address?.toLowerCase().includes(lower) ||
            cs.loan_type?.toLowerCase().includes(lower) ||
            cs.doc_type?.toLowerCase().includes(lower)
        );
        if (matchName || matchReferrer || matchCo || matchCase) {
          matchedNames.add(c.client_name);
        }
      });
      setExpandedClientNames(matchedNames);
    } else {
      // 搜索清空时还原智能折叠策略：仅展开推荐活跃主案客户
      const defaultExpanded = new Set<string>();
      normalizedClients.forEach((cl) => {
        if (
          cl.cases.some(
            (cs) => cs.is_recommended_active && cs.status !== 'settled' && cs.status !== 'closed' && cs.status !== 'lead'
          )
        ) {
          defaultExpanded.add(cl.client_name);
        }
      });
      setExpandedClientNames(defaultExpanded);
    }
  };

  // Filtered clients
  const filteredClients = useMemo(() => {
    let list = normalizedClients;

    // 1. Category Filter
    if (activeCategory !== 'all') {
      list = list.filter((c) => c.client_category === activeCategory);
    }

    // 2. Search Keyword Filter (不区分大小写匹配客户、推荐人、联名借款人、物业地址、银行、贷款类型等)
    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      list = list.filter((c) => {
        const matchName = c.client_name.toLowerCase().includes(kw);
        const matchReferrer = c.referrer_name?.toLowerCase().includes(kw);
        const matchCo = c.co_borrowers?.some((co) => co.toLowerCase().includes(kw));
        const matchCase = c.cases.some(
          (cs) =>
            cs.dir_name.toLowerCase().includes(kw) ||
            cs.lender?.toLowerCase().includes(kw) ||
            cs.property_address?.toLowerCase().includes(kw) ||
            cs.loan_type?.toLowerCase().includes(kw) ||
            cs.doc_type?.toLowerCase().includes(kw)
        );
        return matchName || matchReferrer || matchCo || matchCase;
      });
    }

    return list;
  }, [normalizedClients, activeCategory, searchKeyword]);

  // Expand / Collapse actions
  const isAllExpanded = useMemo(() => {
    if (filteredClients.length === 0) return false;
    return filteredClients.every((c) => expandedClientNames.has(c.client_name));
  }, [filteredClients, expandedClientNames]);

  const handleToggleExpandAll = () => {
    if (isAllExpanded) {
      setExpandedClientNames(new Set());
    } else {
      const allNames = new Set(filteredClients.map((c) => c.client_name));
      setExpandedClientNames(allNames);
    }
  };

  const handleToggleClientExpand = (clientName: string) => {
    setExpandedClientNames((prev) => {
      const next = new Set(prev);
      if (next.has(clientName)) {
        next.delete(clientName);
      } else {
        next.add(clientName);
      }
      return next;
    });
  };

  // Case Selection Handlers
  const handleToggleCase = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleToggleClientAll = (client: ClientTopologyMeta) => {
    const clientPaths = client.cases.map((c) => c.folder_path);
    const isAllSelected = clientPaths.every((p) => selectedPaths.has(p));

    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (isAllSelected) {
        clientPaths.forEach((p) => next.delete(p));
      } else {
        clientPaths.forEach((p) => next.add(p));
      }
      return next;
    });
  };

  const handleSelectRecommendedOnly = () => {
    const recs = new Set<string>();
    allCases.forEach((c) => {
      if (c.is_recommended_active && c.status !== 'settled' && c.status !== 'closed' && c.status !== 'lead') {
        recs.add(c.folder_path);
      }
    });
    setSelectedPaths(recs);
    useToastStore.getState().showToast('info', `已仅勾选 ${recs.size} 个推荐主力在途案卷`);
  };

  const handleSelectAllFiltered = () => {
    const filteredPaths = new Set(selectedPaths);
    filteredClients.forEach((cl) => {
      cl.cases.forEach((cs) => filteredPaths.add(cs.folder_path));
    });
    setSelectedPaths(filteredPaths);
  };

  const handleClearSelection = () => {
    setSelectedPaths(new Set());
  };

  // Selected Clients Count
  const selectedClientsCount = useMemo(() => {
    return normalizedClients.filter((cl) => cl.cases.some((cs) => selectedPaths.has(cs.folder_path))).length;
  }, [normalizedClients, selectedPaths]);

  // Execute Batch Import with Progress Tracking
  const handleBatchImport = async () => {
    if (selectedPaths.size === 0) {
      useToastStore.getState().showToast('error', '请先至少勾选一个要建档的案卷');
      return;
    }

    const selectedCases = allCases.filter((c) => selectedPaths.has(c.folder_path));

    const importItems: BatchTopologyImportItem[] = selectedCases.map((c) => {
      // Find client name
      const parentClient = normalizedClients.find((cl) => cl.cases.some((cs) => cs.folder_path === c.folder_path));
      const clientName = parentClient?.client_name || scanResult?.client_name || c.prefilled?.client_name || '客户';

      return {
        folder_path: c.folder_path,
        client_name: clientName,
        lender: c.lender || c.prefilled?.lender || 'CBA',
        loan_amount: c.prefilled?.loan_amount,
        property_address: c.property_address || c.prefilled?.property_address,
        stage: c.status === 'submitted' ? '已递交银行' : c.status === 'onhold' ? '预审准备' : '资料收集',
        is_imported: true,
        platform_submissions: c.submitted_platforms || [],
        client_phone: c.prefilled?.client_phone || '',
        client_email: c.prefilled?.client_email || '',
        employment_type: c.prefilled?.employment_type,
        residency: c.prefilled?.residency,
        property_value: c.prefilled?.property_value,
        interest_rate: c.prefilled?.interest_rate,
        doc_type: c.doc_type || c.prefilled?.doc_type,
        loan_type: c.loan_type || c.prefilled?.loan_type,
        onhold_reason: c.onhold_reason,
      };
    });

    setIsImporting(true);
    setImportProgress(10);
    setImportProgressText(`正在初始化 ${importItems.length} 个案卷数据...`);

    // Simulated step progress
    const progressTimer = setInterval(() => {
      setImportProgress((prev) => {
        if (prev < 85) {
          const next = prev + Math.floor(Math.random() * 15) + 5;
          setImportProgressText(`正在迁移建档 ${Math.round((next / 100) * importItems.length)} / ${importItems.length} 个案卷...`);
          return Math.min(next, 85);
        }
        return prev;
      });
    }, 250);

    try {
      const res = await batchTopologyImport({ items: importItems });
      clearInterval(progressTimer);
      setImportProgress(100);
      setImportProgressText('批量导入建档完成！');

      if (res.ok) {
        // 1. 刷新 Store 中的在途案件列表
        await useCaseStore.getState().fetchCases();

        // 2. 触发系统通知 Toast
        useToastStore.getState().showToast(
          'success',
          `成功批量导入 ${res.imported_count} 个案卷（覆盖 ${selectedClientsCount} 位客户）`
        );

        // 3. 甄别是否包含「推荐活跃主案」
        const importedSelectedCases = allCases.filter((c) => selectedPaths.has(c.folder_path));
        const recActiveCase = importedSelectedCases.find(
          (c) => c.is_recommended_active && c.status !== 'settled' && c.status !== 'closed' && c.status !== 'lead'
        ) || importedSelectedCases.find((c) => c.status === 'active');

        const freshCases = useCaseStore.getState().cases;
        let targetCase = null;
        if (res.active_case_id) {
          targetCase = freshCases.find((c) => c.caseId === res.active_case_id);
        }
        if (!targetCase && recActiveCase) {
          targetCase = freshCases.find(
            (c) => c.folderPath === recActiveCase.folder_path || c.clientName.includes(recActiveCase.prefilled?.client_name || '')
          );
        }
        if (!targetCase && res.created_case_ids && res.created_case_ids.length > 0) {
          targetCase = freshCases.find((c) => res.created_case_ids?.includes(c.caseId));
        }

        // 若包含推荐活跃主案，自动选中并进入该案卷的 AI 对话中栏 (WO-90)
        if (recActiveCase && targetCase) {
          useCaseStore.getState().setCurrentCase(targetCase);
          window.dispatchEvent(new CustomEvent('open-case-brain', { detail: targetCase.caseId }));
        }

        if (onImportComplete) {
          onImportComplete(res.imported_count, recActiveCase ? targetCase?.caseId : undefined);
        }
        if (onClose) {
          onClose();
        }
      } else {
        useToastStore.getState().showToast('error', res.message || '批量导入失败');
      }
    } catch (err: any) {
      clearInterval(progressTimer);
      useToastStore.getState().showToast('error', err?.message || '批量导入网络请求发生错误');
    } finally {
      setTimeout(() => {
        setIsImporting(false);
        setImportProgress(0);
        setImportProgressText('');
      }, 500);
    }
  };

  return (
    <div className="space-y-4 text-xs" id="folder-topology-scanner-root">
      {/* 1. 顶部路径扫描与控制 */}
      <TopologyScanHeader
        folderPath={folderPath}
        setFolderPath={setFolderPath}
        scanning={scanning}
        onScan={performScan}
        hasScanResult={!!scanResult}
      />

      {/* 2. 扫描中 Loading */}
      {scanning && (
        <div
          className="p-8 rounded-2xl border flex flex-col items-center justify-center space-y-3"
          style={{
            backgroundColor: 'var(--bg-panel)',
            borderColor: 'var(--border)',
          }}
        >
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--purple)' }} />
          <div className="text-center space-y-1">
            <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              正在深度扫描 600+ 客户大根目录拓扑...
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              分析多案卷分流、推荐人渠道、联名借款人及主力在途案卷
            </div>
          </div>
        </div>
      )}

      {/* 3. 扫描错误提示 */}
      {!scanning && scanError && (
        <div
          className="p-4 rounded-2xl border flex items-start space-x-2.5"
          style={{
            backgroundColor: 'var(--red-soft)',
            borderColor: 'rgba(220, 38, 38, 0.3)',
            color: 'var(--red)',
          }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-xs">目录扫描失败</div>
            <div className="text-[11px] leading-relaxed opacity-90">{scanError}</div>
          </div>
        </div>
      )}

      {/* 4. 扫描结果展示 */}
      {!scanning && scanResult && (
        <div className="space-y-4">
          {/* 统计面板与快捷分流 Pills */}
          <TopologySummaryStats
            summary={summary}
            activeCategory={activeCategory}
            onSelectCategory={setActiveCategory}
            searchKeyword={searchKeyword}
            onSearchChange={handleSearchChange}
            isAllExpanded={isAllExpanded}
            onToggleExpandAll={handleToggleExpandAll}
          />

          {/* 客户 ➔ 案卷两层手风琴树状列表 */}
          <div className="space-y-3" id="topology-clients-tree-container">
            {filteredClients.length === 0 ? (
              <div
                className="p-8 rounded-2xl border text-center space-y-2"
                style={{
                  backgroundColor: 'var(--bg-panel)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-muted)',
                }}
              >
                <Users className="w-8 h-8 mx-auto opacity-40" />
                <div className="font-semibold text-xs">没有匹配到符合条件的客户</div>
                <div className="text-[11px]">请尝试调整分类标签或清空搜索关键词</div>
              </div>
            ) : (
              filteredClients.map((client) => (
                <ClientAccordionCard
                  key={client.client_name}
                  client={client}
                  isExpanded={expandedClientNames.has(client.client_name)}
                  selectedPaths={selectedPaths}
                  onToggleExpand={() => handleToggleClientExpand(client.client_name)}
                  onToggleCase={handleToggleCase}
                  onToggleClientAll={handleToggleClientAll}
                />
              ))
            )}
          </div>

          {/* 底部悬浮/吸底批量操作与进度条 */}
          <TopologyImportActionBar
            totalCasesCount={allCases.length}
            selectedCount={selectedPaths.size}
            selectedClientsCount={selectedClientsCount}
            onSelectRecommendedOnly={handleSelectRecommendedOnly}
            onSelectAllFiltered={handleSelectAllFiltered}
            onClearSelection={handleClearSelection}
            isImporting={isImporting}
            importProgress={importProgress}
            importProgressText={importProgressText}
            onImport={handleBatchImport}
            onClose={onClose}
          />
        </div>
      )}
    </div>
  );
}
