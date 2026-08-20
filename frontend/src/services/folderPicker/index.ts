/**
 * 案件文件夹选择器 Provider 抽象 (Electron Native Integration)
 * 
 * 架构设计与优先级原则：
 * 1. 【第一优先级 - Electron 原生】：
 *    若存在 window.veraElectron?.chooseDirectory，直接调起 Windows/macOS 系统原生文件夹选择器，
 *    用户选完目录直接返回路径，中途不弹出任何冗余 Web 模态弹窗。
 * 2. 【第二优先级 - 纯 Web 浏览器模式】：
 *    在纯 Web 浏览器环境下，直接使用轻量 prompt 输入或路径确认，不再弹出旧版模态窗口。
 */

export interface FolderPickResult {
  path: string;
  mode?: 'existing' | 'create';
  folder_name?: string;
}

export interface PickFolderOptions {
  mode?: 'existing' | 'create';
  initialPath?: string;
  folderName?: string;
  title?: string;
  clientName?: string;
  caseId?: string;
}

/**
 * 选择已有目录 / 确定目标目录
 * 优先直通 Electron 原生系统文件夹选择器；Web 模式使用轻量 prompt
 */
export async function pickExistingFolder(options?: PickFolderOptions): Promise<FolderPickResult | null> {
  // 1. 第一优先级：Electron 原生系统选择器
  if (typeof window !== 'undefined' && window.veraElectron?.chooseDirectory) {
    try {
      const res = await window.veraElectron.chooseDirectory();
      if (res && res.trim()) {
        return { path: res.trim(), mode: options?.mode || 'existing' };
      }
      return null; // 用户取消选择
    } catch (err) {
      console.warn('[FolderPicker] Electron chooseDirectory failed:', err);
    }
  }

  // 2. Web 浏览器环境下轻量 prompt 交互
  if (typeof window !== 'undefined') {
    const input = window.prompt(
      options?.title || '请输入客户大根目录绝对路径（如 D:\\...）',
      options?.initialPath || 'D:\\EverStones_Clients_Root'
    );

    if (input && input.trim()) {
      return { path: input.trim(), mode: options?.mode || 'existing' };
    }
  }

  return null;
}

/**
 * 轻量快捷函数：直接获取原生/目标目录绝对路径字符串
 * @param title 弹窗标题提示
 * @returns 文件夹路径或 null
 */
export async function pickNativeDirectory(title?: string): Promise<string | null> {
  const result = await pickExistingFolder({ title });
  return result ? result.path : null;
}
