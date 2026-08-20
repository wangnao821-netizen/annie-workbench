import { CaseTimelinePanel } from './CaseTimelinePanel';

interface TimelinePanelProps {
  caseId: string;
}

export function TimelinePanel({ caseId }: TimelinePanelProps) {
  return <CaseTimelinePanel caseId={caseId} />;
}

