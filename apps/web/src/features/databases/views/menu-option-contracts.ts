import type { ReactNode } from "react"

export type DatabaseSearchableMenuOption = {
  color?: string
  icon?: ReactNode
  label: string
  searchText?: string
  value: string
}
