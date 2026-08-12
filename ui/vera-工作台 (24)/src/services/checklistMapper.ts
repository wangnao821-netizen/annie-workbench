import { ChecklistItemResponse } from '../types/api';
import { ChecklistItemType } from '../types';

export function mapChecklistItem(c: ChecklistItemResponse): ChecklistItemType {
  return {
    id: c.id,
    label: c.name,
    category: c.category as ChecklistItemType['category'],
    checked: c.status === 'received',
    reason: c.reason,
    fileMatched: c.file_ids && c.file_ids.length > 0 ? c.file_ids.join(', ') : undefined,
  };
}
