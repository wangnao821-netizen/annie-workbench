import { ChecklistItemResponse } from '../types/api';
import { ChecklistItemType } from '../types';

export function mapChecklistItem(c: ChecklistItemResponse): ChecklistItemType {
  const isRequired = c.is_required === true || c.category === 'required';
  const label = c.item_name || c.name_zh || c.name || '';
  const reason = c.ai_suggestion || c.reason || undefined;
  const category: ChecklistItemType['category'] = isRequired ? 'required' : 'ai_suggested';

  const fileMatched =
    c.matched_file_name ||
    (c.received_file_ids && c.received_file_ids.length > 0 ? c.received_file_ids.join(', ') : undefined) ||
    (c.file_ids && c.file_ids.length > 0 ? c.file_ids.join(', ') : undefined) ||
    (c.received_file_id || undefined);

  const fileId = c.matched_file_id || c.received_file_id || (c.file_ids && c.file_ids.length > 0 ? c.file_ids[0] : undefined);
  const isAutoMatched = Boolean(fileMatched || fileId);

  return {
    id: String(c.id),
    label,
    category,
    checked: c.status === 'received' || c.status === 'confirmed',
    status: c.status,
    reason,
    fileMatched,
    fileId,
    isAutoMatched,
    masterCategory: c.master_category,
    receivedFileId: c.received_file_id || undefined,
    receivedFileIds: c.received_file_ids,
  };
}
