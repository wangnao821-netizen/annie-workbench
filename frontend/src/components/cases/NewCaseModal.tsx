import { NewCaseSheet } from './NewCaseSheet';
import { CaseInfo } from '../../stores/caseStore';

interface NewCaseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (caseInfo: CaseInfo) => void;
}

/**
 * @deprecated Use NewCaseSheet directly. This component is preserved as a wrapper for backwards compatibility.
 */
export function NewCaseModal({ open, onClose, onCreated }: NewCaseModalProps) {
  return <NewCaseSheet open={open} onClose={onClose} onCreated={onCreated} />;
}

export { NewCaseSheet };
