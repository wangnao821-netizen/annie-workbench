import { request } from '../http';
import { VersionInfo, HealthInfo } from '../../types/api';

export function getVersion(): Promise<VersionInfo> {
  return request<VersionInfo>('/api/version');
}

export function getHealth(): Promise<HealthInfo> {
  return request<HealthInfo>('/api/health');
}
