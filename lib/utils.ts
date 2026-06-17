export const formatVND = (amount: number): string =>
  new Intl.NumberFormat('vi-VN').format(amount) + ' đ'

export const formatNumber = (n: number): string =>
  new Intl.NumberFormat('vi-VN').format(n)

export const formatDate = (date: string | Date): string =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))

export const formatDateTime = (date: string | Date): string =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))

export const getStatusBadge = (status: string): { label: string; className: string } => {
  const map: Record<string, { label: string; className: string }> = {
    completed:   { label: 'Hoàn thành',     className: 'bg-green-100 text-green-700' },
    delivered:   { label: 'Đã giao',        className: 'bg-green-100 text-green-700' },
    active:      { label: 'Hoạt động',      className: 'bg-green-100 text-green-700' },
    available:   { label: 'Sẵn sàng',       className: 'bg-green-100 text-green-700' },
    approved:    { label: 'Đã duyệt',       className: 'bg-green-100 text-green-700' },
    paid:        { label: 'Đã TT',          className: 'bg-green-100 text-green-700' },
    pending:     { label: 'Chờ duyệt',      className: 'bg-yellow-100 text-yellow-700' },
    qc_check:    { label: 'Kiểm tra KCS',   className: 'bg-yellow-100 text-yellow-700' },
    partial:     { label: 'TT một phần',    className: 'bg-yellow-100 text-yellow-700' },
    new:         { label: 'Mới',            className: 'bg-yellow-100 text-yellow-700' },
    confirmed:   { label: 'Đã xác nhận',   className: 'bg-blue-100 text-blue-700' },
    picking:     { label: 'Đang lấy hàng', className: 'bg-blue-100 text-blue-700' },
    delivering:  { label: 'Đang giao',     className: 'bg-blue-100 text-blue-700' },
    on_trip:     { label: 'Đang chạy',     className: 'bg-blue-100 text-blue-700' },
    sent:        { label: 'Đã gửi',        className: 'bg-blue-100 text-blue-700' },
    cancelled:   { label: 'Đã hủy',        className: 'bg-red-100 text-red-700' },
    delayed:     { label: 'Giao trễ',      className: 'bg-red-100 text-red-700' },
    failed:      { label: 'Thất bại',      className: 'bg-red-100 text-red-700' },
    unpaid:      { label: 'Chưa TT',         className: 'bg-orange-100 text-orange-700' },
    inactive:    { label: 'Không HĐ',      className: 'bg-gray-100 text-gray-600' },
    paused:      { label: 'Tạm dừng',      className: 'bg-gray-100 text-gray-600' },
    draft:       { label: 'Bản nháp',      className: 'bg-gray-100 text-gray-600' },
    maintenance: { label: 'Bảo dưỡng',    className: 'bg-gray-100 text-gray-600' },
    off_duty:    { label: 'Nghỉ',          className: 'bg-gray-100 text-gray-600' },
  }
  return map[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
}

export const cn = (...classes: (string | undefined | null | false)[]): string =>
  classes.filter(Boolean).join(' ')
