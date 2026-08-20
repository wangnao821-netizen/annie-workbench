import { request } from '../http';
import {
  Granularity,
  AnalyticsOverview,
  AnalyticsPipeline,
  AnalyticsLenders,
  AnalyticsEfficiency,
  AnalyticsUsage,
} from '../../types/api';

export type { Granularity };

const mockOverview: Record<Granularity, AnalyticsOverview> = {
  day: {
    granularity: 'day',
    current: {
      active_cases: 18,
      new_cases: 3,
      submitted: 2,
      approved: 1,
      settled: 1,
      commission_estimate: 12500,
      tasks_done: 8,
    },
    previous: {
      active_cases: 16,
      new_cases: 2,
      submitted: 1,
      approved: 1,
      settled: 0,
      commission_estimate: 9300,
      tasks_done: 6,
    },
  },
  week: {
    granularity: 'week',
    current: {
      active_cases: 24,
      new_cases: 8,
      submitted: 5,
      approved: 4,
      settled: 3,
      commission_estimate: 48200,
      tasks_done: 35,
    },
    previous: {
      active_cases: 21,
      new_cases: 6,
      submitted: 4,
      approved: 3,
      settled: 4,
      commission_estimate: 39700,
      tasks_done: 28,
    },
  },
  month: {
    granularity: 'month',
    current: {
      active_cases: 42,
      new_cases: 28,
      submitted: 20,
      approved: 16,
      settled: 12,
      commission_estimate: 185000,
      tasks_done: 140,
    },
    previous: {
      active_cases: 36,
      new_cases: 23,
      submitted: 16,
      approved: 14,
      settled: 9,
      commission_estimate: 153000,
      tasks_done: 110,
    },
  },
};

const mockPipeline: Record<Granularity, AnalyticsPipeline> = {
  day: {
    granularity: 'day',
    series: [
      { period: '08/07', new_cases: 2, submitted: 1, approved: 1, settled: 0, commission: 0 },
      { period: '08/08', new_cases: 1, submitted: 2, approved: 0, settled: 1, commission: 8500 },
      { period: '08/09', new_cases: 3, submitted: 1, approved: 2, settled: 0, commission: 0 },
      { period: '08/10', new_cases: 2, submitted: 2, approved: 1, settled: 1, commission: 12000 },
      { period: '08/11', new_cases: 3, submitted: 2, approved: 1, settled: 1, commission: 12500 },
    ],
  },
  week: {
    granularity: 'week',
    series: [
      { period: '第 28 周', new_cases: 6, submitted: 4, approved: 3, settled: 2, commission: 32000 },
      { period: '第 29 周', new_cases: 7, submitted: 5, approved: 4, settled: 3, commission: 41000 },
      { period: '第 30 周', new_cases: 5, submitted: 3, approved: 3, settled: 2, commission: 28000 },
      { period: '第 31 周', new_cases: 6, submitted: 4, approved: 3, settled: 4, commission: 39700 },
      { period: '第 32 周', new_cases: 8, submitted: 5, approved: 4, settled: 3, commission: 48200 },
    ],
  },
  month: {
    granularity: 'month',
    series: [
      { period: '4月', new_cases: 22, submitted: 15, approved: 12, settled: 8, commission: 120000 },
      { period: '5月', new_cases: 25, submitted: 18, approved: 14, settled: 10, commission: 145000 },
      { period: '6月', new_cases: 20, submitted: 14, approved: 11, settled: 9, commission: 132000 },
      { period: '7月', new_cases: 23, submitted: 16, approved: 14, settled: 9, commission: 153000 },
      { period: '8月', new_cases: 28, submitted: 20, approved: 16, settled: 12, commission: 185000 },
    ],
  },
};

const mockLenders: AnalyticsLenders = {
  lenders: [
    { lender: 'CBA', case_count: 12, avg_approval_days: 4.2, os_rate: 22, approval_rate: 92 },
    { lender: 'NAB', case_count: 9, avg_approval_days: 3.8, os_rate: 18, approval_rate: 95 },
    { lender: 'ANZ', case_count: 6, avg_approval_days: 5.5, os_rate: 30, approval_rate: 88 },
    { lender: 'Westpac', case_count: 5, avg_approval_days: 4.8, os_rate: 25, approval_rate: 90 },
    { lender: 'Macquarie', case_count: 4, avg_approval_days: 2.5, os_rate: 12, approval_rate: 98 },
  ],
};

const mockEfficiency: Record<Granularity, AnalyticsEfficiency> = {
  day: {
    granularity: 'day',
    current: {
      tasks_done: 12,
      on_time_rate: 95,
      checklist_confirm_rate: 91,
      ai_adoption_count: 28,
      avg_client_reply_days: 0.8,
    },
    previous: {
      tasks_done: 9,
      on_time_rate: 90,
      checklist_confirm_rate: 85,
      ai_adoption_count: 19,
      avg_client_reply_days: 1.2,
    },
  },
  week: {
    granularity: 'week',
    current: {
      tasks_done: 48,
      on_time_rate: 94,
      checklist_confirm_rate: 89,
      ai_adoption_count: 126,
      avg_client_reply_days: 1.2,
    },
    previous: {
      tasks_done: 40,
      on_time_rate: 88,
      checklist_confirm_rate: 82,
      ai_adoption_count: 95,
      avg_client_reply_days: 1.8,
    },
  },
  month: {
    granularity: 'month',
    current: {
      tasks_done: 192,
      on_time_rate: 93,
      checklist_confirm_rate: 88,
      ai_adoption_count: 480,
      avg_client_reply_days: 1.4,
    },
    previous: {
      tasks_done: 165,
      on_time_rate: 87,
      checklist_confirm_rate: 80,
      ai_adoption_count: 380,
      avg_client_reply_days: 2.1,
    },
  },
};

export async function getOverview(granularity: Granularity): Promise<AnalyticsOverview> {
  const isMock = import.meta.env.VITE_USE_MOCK !== 'false';
  if (isMock) return mockOverview[granularity];
  try {
    return await request<AnalyticsOverview>(`/api/analytics/overview?granularity=${granularity}`);
  } catch {
    return mockOverview[granularity];
  }
}

export async function getPipeline(granularity: Granularity, buckets?: number): Promise<AnalyticsPipeline> {
  const isMock = import.meta.env.VITE_USE_MOCK !== 'false';
  if (isMock) return mockPipeline[granularity];
  try {
    const query = buckets ? `?granularity=${granularity}&buckets=${buckets}` : `?granularity=${granularity}`;
    return await request<AnalyticsPipeline>(`/api/analytics/pipeline${query}`);
  } catch {
    return mockPipeline[granularity];
  }
}

export async function getLenders(granularity: Granularity): Promise<AnalyticsLenders> {
  const isMock = import.meta.env.VITE_USE_MOCK !== 'false';
  if (isMock) return mockLenders;
  try {
    return await request<AnalyticsLenders>(`/api/analytics/lenders?granularity=${granularity}`);
  } catch {
    return mockLenders;
  }
}

export async function getEfficiency(granularity: Granularity): Promise<AnalyticsEfficiency> {
  const isMock = import.meta.env.VITE_USE_MOCK !== 'false';
  if (isMock) return mockEfficiency[granularity];
  try {
    return await request<AnalyticsEfficiency>(`/api/analytics/efficiency?granularity=${granularity}`);
  } catch {
    return mockEfficiency[granularity];
  }
}

const mockUsage: Record<Granularity, AnalyticsUsage> = {
  day: {
    current: {
      calls: 38,
      prompt_tokens: 125000,
      completion_tokens: 18400,
      prompt_cache_hit_tokens: 90000,
      prompt_cache_miss_tokens: 35000,
      cache_hit_rate: 0.72,
      cost_usd: 2.45,
      avg_latency_ms: 1200,
      corrected_count: 3,
    },
    previous: {
      calls: 28,
      prompt_tokens: 92000,
      completion_tokens: 14000,
      prompt_cache_hit_tokens: 60000,
      prompt_cache_miss_tokens: 32000,
      cache_hit_rate: 0.65,
      cost_usd: 1.95,
      avg_latency_ms: 1350,
      corrected_count: 5,
    },
  },
  week: {
    current: {
      calls: 240,
      prompt_tokens: 850000,
      completion_tokens: 120000,
      prompt_cache_hit_tokens: 637500,
      prompt_cache_miss_tokens: 212500,
      cache_hit_rate: 0.75,
      cost_usd: 16.8,
      avg_latency_ms: 1150,
      corrected_count: 14,
    },
    previous: {
      calls: 195,
      prompt_tokens: 680000,
      completion_tokens: 95000,
      prompt_cache_hit_tokens: 476000,
      prompt_cache_miss_tokens: 204000,
      cache_hit_rate: 0.70,
      cost_usd: 13.9,
      avg_latency_ms: 1280,
      corrected_count: 20,
    },
  },
  month: {
    current: {
      calls: 980,
      prompt_tokens: 3500000,
      completion_tokens: 480000,
      prompt_cache_hit_tokens: 2730000,
      prompt_cache_miss_tokens: 770000,
      cache_hit_rate: 0.78,
      cost_usd: 68.5,
      avg_latency_ms: 1100,
      corrected_count: 42,
    },
    previous: {
      calls: 810,
      prompt_tokens: 2900000,
      completion_tokens: 390000,
      prompt_cache_hit_tokens: 2030000,
      prompt_cache_miss_tokens: 870000,
      cache_hit_rate: 0.70,
      cost_usd: 57.2,
      avg_latency_ms: 1220,
      corrected_count: 58,
    },
  },
};

export async function getUsage(granularity: Granularity): Promise<AnalyticsUsage> {
  const isMock = import.meta.env.VITE_USE_MOCK !== 'false';
  if (isMock) return mockUsage[granularity];
  try {
    return await request<AnalyticsUsage>(`/api/analytics/usage?granularity=${granularity}`);
  } catch {
    return mockUsage[granularity];
  }
}

