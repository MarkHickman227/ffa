import { ItemStatus, ItemType, RiskFlag } from '@prisma/client'

const HIGH_VALUE_THRESHOLD = 500
const HIGH_RISK_TYPES = new Set<ItemType>([ItemType.SMART_HOME, ItemType.SECURITY_SYSTEM])
const EXCHANGE_RISK_DAYS = 14

interface RiskInput {
  itemType: ItemType
  status: ItemStatus
  estimatedValue?: number | null
  valuationDate?: Date | null
  exchangeDate?: Date | null
  previousStatus?: ItemStatus | null
}

export function computeRiskFlag(input: RiskInput): RiskFlag {
  const { itemType, status, estimatedValue, valuationDate, exchangeDate, previousStatus } = input

  // HIGH: excluded high-value item
  if (status === ItemStatus.EXCLUDED && (estimatedValue ?? 0) > HIGH_VALUE_THRESHOLD) {
    return RiskFlag.HIGH
  }

  // HIGH: smart home / security system excluded
  if (status === ItemStatus.EXCLUDED && HIGH_RISK_TYPES.has(itemType)) {
    return RiskFlag.HIGH
  }

  // HIGH: status changed within 14 days of exchange
  if (exchangeDate && previousStatus && previousStatus !== status) {
    const daysToExchange = (exchangeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    if (daysToExchange <= EXCHANGE_RISK_DAYS) {
      return RiskFlag.HIGH
    }
  }

  // MEDIUM: status changed after valuation
  if (valuationDate && previousStatus && previousStatus !== status) {
    if (new Date() > valuationDate) {
      return RiskFlag.MEDIUM
    }
  }

  // LOW: any other status change
  if (previousStatus && previousStatus !== status) {
    return RiskFlag.LOW
  }

  return RiskFlag.NONE
}
