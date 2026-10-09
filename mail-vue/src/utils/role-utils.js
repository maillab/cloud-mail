// 系统种子默认角色名（init 时写入 DB 的固定值）。展示时按当前语言映射；
// 管理员自定义或改名后的角色原样显示。
export const SEED_DEFAULT_ROLE_NAME = '普通用户'

export function displayRoleName(name, t) {
  if (!name) return ''
  if (name === SEED_DEFAULT_ROLE_NAME) return t('defaultRoleName')
  return name
}
