export type NavTabId = "tasks" | "cases" | "knowledge" | "settings";
export type ViewId = NavTabId | "case-detail" | "drafts" | "archive" | "imports" | "migration" | "analytics" | "brain";

export interface NavTabItem {
  id: NavTabId;
  label: string;
  badge?: number;
}

export type FilterId = "all" | "email" | "file" | "os" | "brandon" | "overdue";

export interface FilterItem {
  id: FilterId;
  label: string;
  count: number;
}
