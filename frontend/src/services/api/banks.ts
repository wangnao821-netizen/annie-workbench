import { request } from '../http';
import { BanksResponse, PlatformsResponse, BankItem, BankPlatformUpdateRequest } from '../../types/api';

export async function getBanks(): Promise<BanksResponse> {
  try {
    return await request<BanksResponse>('/api/banks/');
  } catch (err) {
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      return {
        banks: [
          { key: 'cba', display_name: 'Commonwealth Bank', name_zh: '澳洲联邦银行', type: 'Bank', adi: true, tier: 'full', has_calculator: true, platforms: ['applyonline', 'infynity'], vera_confirmed: true },
          { key: 'macquarie', display_name: 'Macquarie Bank', name_zh: '麦格理银行', type: 'Bank', adi: true, tier: 'full', has_calculator: true, platforms: ['applyonline'], vera_confirmed: true },
          { key: 'boc', display_name: 'Bank of China', name_zh: '中国银行(澳洲)', type: 'Bank', adi: true, tier: 'full', has_calculator: true, platforms: ['applyonline'], vera_confirmed: false },
          { key: 'ma_money', display_name: 'MA Money', name_zh: 'MA 融通金融', type: 'Non-Bank', adi: false, tier: 'full', has_calculator: true, platforms: ['loanapp'], vera_confirmed: true },
          { key: 'latrobe', display_name: 'LaTrobe Financial', name_zh: '拉特罗布金融', type: 'Non-Bank', adi: false, tier: 'full', has_calculator: true, platforms: ['loanapp'], vera_confirmed: true },
          { key: 'resimac', display_name: 'Resimac', name_zh: 'Resimac 房贷', type: 'Non-Bank', adi: false, tier: 'full', has_calculator: true, platforms: ['applyonline'], vera_confirmed: true },
          { key: 'nab', display_name: 'National Australia Bank', name_zh: '澳洲国民银行', type: 'Bank', adi: true, tier: 'full', has_calculator: false, platforms: ['applyonline'], vera_confirmed: true },
          { key: 'wbc', display_name: 'Westpac', name_zh: '西太平洋银行', type: 'Bank', adi: true, tier: 'full', has_calculator: false, platforms: ['applyonline'], vera_confirmed: true },
          { key: 'anz', display_name: 'ANZ Bank', name_zh: '澳新银行', type: 'Bank', adi: true, tier: 'full', has_calculator: false, platforms: ['applyonline'], vera_confirmed: true },
          { key: 'bankwest', display_name: 'Bankwest', name_zh: '邦德斯银行', type: 'Bank', adi: true, tier: 'basic', has_calculator: false, platforms: ['applyonline'], vera_confirmed: false },
          { key: 'stgeorge', display_name: 'St. George Bank', name_zh: '圣乔治银行', type: 'Bank', adi: true, tier: 'basic', has_calculator: false, platforms: ['applyonline'], vera_confirmed: false },
          { key: 'suncorp', display_name: 'Suncorp Bank', name_zh: '桑托普银行', type: 'Bank', adi: true, tier: 'basic', has_calculator: false, platforms: ['applyonline'], vera_confirmed: false },
          { key: 'ing', display_name: 'ING Australia', name_zh: 'ING 银行', type: 'Bank', adi: true, tier: 'basic', has_calculator: false, platforms: ['applyonline'], vera_confirmed: false },
          { key: 'amp', display_name: 'AMP Bank', name_zh: '安保银行', type: 'Bank', adi: true, tier: 'basic', has_calculator: false, platforms: ['applyonline'], vera_confirmed: false },
          { key: 'bendigo', display_name: 'Bendigo Bank', name_zh: '本迪戈银行', type: 'Bank', adi: true, tier: 'basic', has_calculator: false, platforms: ['applyonline'], vera_confirmed: false },
          { key: 'boq', display_name: 'Bank of Queensland', name_zh: '昆士兰银行', type: 'Bank', adi: true, tier: 'basic', has_calculator: false, platforms: ['applyonline'], vera_confirmed: false },
          { key: 'me_bank', display_name: 'ME Bank', name_zh: 'ME 银行', type: 'Bank', adi: true, tier: 'basic', has_calculator: false, platforms: ['applyonline'], vera_confirmed: false },
          { key: 'pepper', display_name: 'Pepper Money', name_zh: '佩珀金融', type: 'Non-Bank', adi: false, tier: 'basic', has_calculator: false, platforms: ['loanapp'], vera_confirmed: false },
          { key: 'liberty', display_name: 'Liberty Financial', name_zh: '自由金融', type: 'Non-Bank', adi: false, tier: 'basic', has_calculator: false, platforms: ['loanapp'], vera_confirmed: false },
          { key: 'firstmac', display_name: 'Firstmac', name_zh: '第一麦格理', type: 'Non-Bank', adi: false, tier: 'basic', has_calculator: false, platforms: ['applyonline'], vera_confirmed: false },
          { key: 'bluestone', display_name: 'Bluestone Mortgages', name_zh: '蓝石房贷', type: 'Non-Bank', adi: false, tier: 'basic', has_calculator: false, platforms: ['loanapp'], vera_confirmed: false },
          { key: 'redbook', display_name: 'Redbook Capital', name_zh: '红书资本', type: 'Non-Bank', adi: false, tier: 'basic', has_calculator: false, platforms: ['loanapp'], vera_confirmed: false },
        ],
      };
    }
    throw err;
  }
}

export async function getPlatforms(): Promise<PlatformsResponse> {
  try {
    return await request<PlatformsResponse>('/api/platforms/');
  } catch (err) {
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      return {
        platforms: [
          { key: 'applyonline', display_name: 'ApplyOnline', name_zh: 'ApplyOnline 网关', type: 'Gateway', vera_confirmed: true },
          { key: 'loanapp', display_name: 'Loanapp', name_zh: 'Loanapp 递交系统', type: 'Gateway', vera_confirmed: true },
          { key: 'infynity', display_name: 'Infynity', name_zh: 'Infynity 聚合平台', type: 'CRM', vera_confirmed: true },
          { key: 'moneyquest', display_name: 'MoneyQuest', name_zh: 'MoneyQuest 平台', type: 'CRM', vera_confirmed: false },
        ],
      };
    }
    throw err;
  }
}

export async function updateBankPlatforms(
  key: string,
  platforms: string[],
  veraConfirmed: boolean
): Promise<BankItem> {
  try {
    const body: BankPlatformUpdateRequest = {
      platforms,
      vera_confirmed: veraConfirmed,
    };
    return await request<BankItem>(`/api/banks/${key}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      return {
        key,
        display_name: key,
        name_zh: key,
        type: 'Bank',
        adi: true,
        tier: 'full',
        has_calculator: true,
        platforms,
        vera_confirmed: veraConfirmed,
      };
    }
    throw err;
  }
}

