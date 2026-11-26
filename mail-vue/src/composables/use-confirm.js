import { ElMessageBox } from 'element-plus'

export function useConfirm() {
  const confirm = (message, title = 'Please confirm', options = {}) =>
    ElMessageBox.confirm(message, title, {
      confirmButtonText: options.confirmText || 'Confirm',
      cancelButtonText: options.cancelText || 'Cancel',
      type: options.type || 'warning',
      confirmButtonClass: 'el-button--primary',
      draggable: false,
      closeOnClickModal: false,
      ...options.box
    }).then(() => true).catch(() => false)

  const confirmDanger = (message, title = 'This cannot be undone') =>
    confirm(message, title, { type: 'warning', confirmText: 'Delete' })

  return { confirm, confirmDanger }
}