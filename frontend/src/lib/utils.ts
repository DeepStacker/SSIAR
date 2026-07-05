import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const fmtPct = (val: number | null | undefined, decimals = 1): string => {
  if (val == null || isNaN(val)) return '—'
  return `${Number(val).toFixed(decimals)}%`
}

export const fmtNum = (val: number | null | undefined): string => {
  if (val == null || isNaN(val)) return '—'
  return Number(val).toLocaleString()
}

export const correlationColor = (val: number): string => {
  if (val == null || isNaN(val)) return 'transparent'
  const abs = Math.abs(val)
  if (val > 0) return `rgba(16, 185, 129, ${0.1 + abs * 0.7})`
  if (val < 0) return `rgba(244, 63, 94, ${0.1 + abs * 0.7})`
  return 'rgba(148, 163, 184, 0.15)'
}

export const scoreColor = (val: number): string => {
  if (val == null || isNaN(val)) return 'var(--text-muted)'
  if (val >= 75) return 'var(--accent-emerald)'
  if (val >= 50) return 'var(--accent-amber)'
  return 'var(--accent-rose)'
}

export const hasData = (val: any): boolean => {
  return val != null && val !== '' && !isNaN(Number(val))
}

export const fmtDate = (dateStr: string): string => {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

export const downloadBlob = (content: string, filename: string, mimeType: string): void => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const exportToCsv = (headers: string[], rows: string[][], filename: string): void => {
  const escapeCsv = (val: string): string => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`
    }
    return val
  }
  const headerLine = headers.map(escapeCsv).join(',')
  const dataLines = rows.map(row => row.map(escapeCsv).join(','))
  const csv = '\uFEFF' + [headerLine, ...dataLines].join('\n')
  downloadBlob(csv, filename, 'text/csv;charset=utf-8')
}

export const exportToJson = (data: any, filename: string): void => {
  const json = JSON.stringify(data, null, 2)
  downloadBlob(json, filename, 'application/json')
}
